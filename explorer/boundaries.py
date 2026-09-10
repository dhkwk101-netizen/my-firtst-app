import hashlib
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from django.conf import settings
from django.db import transaction
import pyproj
from shapely.geometry import mapping, shape
from shapely.ops import transform
from explorer.models import BoundaryFeature, BoundarySet, Region, RegionIdentifier


class BoundaryError(Exception):
    pass


@dataclass(frozen=True)
class BoundaryBuildResult:
    reference_year: int
    feature_count: int
    output_crs: str
    asset_uri: str


def build_boundary_set(
    year: int,
    raw_geojson: bytes,
    source_crs: str,
    simplify_tolerance: float = 0,
) -> BoundaryBuildResult:
    if not source_crs or not source_crs.strip():
        raise BoundaryError("Explicit verified source_crs is required")

    try:
        data = json.loads(raw_geojson.decode("utf-8"))
    except Exception as exc:
        raise BoundaryError(f"Invalid GeoJSON: {exc}") from exc

    # Check year if present
    geojson_year = data.get("year")
    if geojson_year is not None and str(geojson_year) != str(year):
        raise BoundaryError(f"GeoJSON year '{geojson_year}' does not match command year '{year}'")

    features = data.get("features", [])
    if not features:
        raise BoundaryError("No features found in GeoJSON")

    try:
        transformer = pyproj.Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)
    except Exception as exc:
        raise BoundaryError(f"Invalid source CRS '{source_crs}': {exc}") from exc

    raw_hash = hashlib.sha256(raw_geojson).hexdigest()
    ref_date = date(year, 1, 1)

    out_features = []
    feature_records = []
    seen_keys = set()

    for feat in features:
        props = feat.get("properties", {})
        adm_cd = str(props.get("adm_cd") or props.get("code") or "").strip()
        if not adm_cd:
            raise BoundaryError("Feature missing adm_cd")

        if adm_cd in seen_keys:
            raise BoundaryError(f"Duplicate feature key '{adm_cd}'")
        seen_keys.add(adm_cd)

        # Match region
        reg_ident = (
            RegionIdentifier.objects.filter(
                code_system="SGIS_ADM_CD",
                code=adm_cd,
                valid_period__contains=ref_date,
            )
            .select_related("region")
            .first()
        )
        if not reg_ident:
            raise BoundaryError(f"Unmapped in-scope region for code '{adm_cd}' in year {year}")

        region = reg_ident.region
        geom_obj = shape(feat["geometry"])

        if simplify_tolerance > 0:
            geom_obj = geom_obj.simplify(simplify_tolerance, preserve_topology=True)

        wgs_geom = transform(transformer.transform, geom_obj)
        if not wgs_geom.is_valid:
            raise BoundaryError(f"Invalid geometry produced for feature '{adm_cd}'")

        feat_hash = hashlib.sha256(json.dumps(mapping(wgs_geom), sort_keys=True).encode("utf-8")).hexdigest()

        out_features.append(
            {
                "type": "Feature",
                "properties": {
                    "featureKey": adm_cd,
                    "regionId": region.id,
                    "regionKey": region.region_key,
                    "name": props.get("adm_nm", ""),
                },
                "geometry": mapping(wgs_geom),
            }
        )

        feature_records.append((region, adm_cd, feat_hash))

    out_collection = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": out_features,
    }

    # Write static file
    static_dir = Path(settings.BASE_DIR) / "explorer" / "static" / "geo" / "boundaries"
    static_dir.mkdir(parents=True, exist_ok=True)
    out_file = static_dir / f"{year}.geojson"
    temp_file = out_file.with_suffix(".tmp")
    temp_file.write_text(json.dumps(out_collection, ensure_ascii=False), encoding="utf-8")
    temp_file.replace(out_file)

    asset_uri = f"/static/geo/boundaries/{year}.geojson"

    # Persist BoundarySet and BoundaryFeature rows
    with transaction.atomic():
        boundary_set, _ = BoundarySet.objects.update_or_create(
            reference_year=year,
            defaults={
                "reference_date": ref_date,
                "source_name": "SGIS",
                "source_uri": f"https://sgis.kostat.go.kr/{year}",
                "asset_uri": asset_uri,
                "checksum": raw_hash,
                "status": "ACTIVE",
            },
        )
        BoundaryFeature.objects.filter(boundary_set=boundary_set).delete()
        BoundaryFeature.objects.bulk_create(
            [
                BoundaryFeature(
                    boundary_set=boundary_set,
                    region=reg,
                    feature_key=f_key,
                    feature_checksum=f_hash,
                )
                for reg, f_key, f_hash in feature_records
            ]
        )

    return BoundaryBuildResult(
        reference_year=year,
        feature_count=len(out_features),
        output_crs="EPSG:4326",
        asset_uri=asset_uri,
    )
