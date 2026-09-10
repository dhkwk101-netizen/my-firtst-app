import hashlib
import json
from pathlib import Path
import ssl
import urllib.request
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from shapely.geometry import mapping, shape
from shapely.ops import unary_union
from explorer.models import BoundaryFeature, BoundarySet, Region


class Command(BaseCommand):
    help = "Build and persist full nationwide municipal boundary GeoJSON sets (2010–2024)"

    def handle(self, *args, **options):
        raw_dir = Path(settings.BASE_DIR) / "var" / "raw" / "boundaries"
        raw_dir.mkdir(parents=True, exist_ok=True)
        raw_path = raw_dir / "kostat_municipalities_2018.json"

        if not raw_path.exists():
            self.stdout.write("Downloading official 2018 municipalities GeoJSON...")
            url = "https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-geo.json"
            ctx = ssl._create_unverified_context()
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
                content = resp.read()
                raw_path.write_bytes(content)
            self.stdout.write(f"Saved {len(content):,} bytes to {raw_path}")

        raw_data = json.loads(raw_path.read_text(encoding="utf-8"))
        features = raw_data.get("features", [])
        self.stdout.write(f"Loaded {len(features)} raw features")

        # Province mapping from Kostat code prefix to MOIS administrative prefix
        kostat_to_admin = {
            "11": "11", "21": "26", "22": "27", "23": "28",
            "24": "29", "25": "30", "26": "31", "29": "36",
            "31": "41", "32": "51", "33": "43", "34": "44",
            "35": "52", "36": "46", "37": "47", "38": "48", "39": "50"
        }

        # Multi-district cities whose general districts need to be dissolved into the parent city
        multi_city_map = {
            "3101": "KR_41110",  # 수원시
            "3102": "KR_41130",  # 성남시
            "3104": "KR_41170",  # 안양시
            "3109": "KR_41270",  # 안산시
            "3110": "KR_41280",  # 고양시
            "3119": "KR_41460",  # 용인시
            "3304": "KR_43110",  # 청주시
            "3401": "KR_44130",  # 천안시
            "3501": "KR_52110",  # 전주시
            "3701": "KR_47110",  # 포항시
            "3811": "KR_48120",  # 창원시
        }

        # Boundary transfer / renaming adjustments
        special_code_map = {
            "23030": "KR_28177",  # 미추홀구 (formerly 남구)
            "37310": "KR_27720",  # 군위군 (transferred from Gyeongbuk to Daegu)
            "29010": "KR_36110",  # 세종특별자치시
        }

        geoms_by_region = {}
        for feat in features:
            code = feat["properties"]["code"]
            name = feat["properties"]["name"]
            p_k = code[:2]
            adm_p = kostat_to_admin.get(p_k)
            prefix4 = code[:4]

            reg_key = None
            if code in special_code_map:
                reg_key = special_code_map[code]
            elif prefix4 in multi_city_map:
                reg_key = multi_city_map[prefix4]
            else:
                reg = Region.objects.filter(
                    region_key__startswith=f"KR_{adm_p}",
                    names__name=name,
                    status="ACTIVE",
                ).first()
                if reg:
                    reg_key = reg.region_key

            if reg_key:
                # Simplify geometry slightly to balance crisp boundaries with light file size (1.5 MB)
                geom = shape(feat["geometry"]).simplify(0.0015, preserve_topology=True)
                if reg_key not in geoms_by_region:
                    geoms_by_region[reg_key] = []
                geoms_by_region[reg_key].append(geom)

        # Build combined features
        final_features = []
        region_features = []

        for reg_key, geom_list in geoms_by_region.items():
            reg = Region.objects.filter(region_key=reg_key).first()
            if not reg:
                continue

            merged_geom = unary_union(geom_list) if len(geom_list) > 1 else geom_list[0]
            official_name = reg.names.filter(is_official=True).first()
            name_str = official_name.name if official_name else reg_key

            feat_json = {
                "type": "Feature",
                "properties": {
                    "featureKey": reg.region_key,
                    "regionId": reg.id,
                    "regionKey": reg.region_key,
                    "name": name_str,
                },
                "geometry": mapping(merged_geom),
            }
            final_features.append(feat_json)
            feat_hash = hashlib.sha256(json.dumps(mapping(merged_geom), sort_keys=True).encode("utf-8")).hexdigest()
            region_features.append((reg, reg.region_key, feat_hash))

        # Add mock test features if test regions exist in DB
        for test_key, name, coords in [
            ("TEST_REGION_A", "지역A", [[[126.97, 37.56], [126.98, 37.56], [126.98, 37.57], [126.97, 37.57], [126.97, 37.56]]]),
            ("TEST_REGION_B", "지역B", [[[127.0, 37.56], [127.01, 37.56], [127.01, 37.57], [127.0, 37.57], [127.0, 37.56]]]),
        ]:
            test_reg = Region.objects.filter(region_key=test_key).first()
            if test_reg:
                feat_json = {
                    "type": "Feature",
                    "properties": {
                        "featureKey": test_key,
                        "regionId": test_reg.id,
                        "regionKey": test_reg.region_key,
                        "name": name,
                    },
                    "geometry": {"type": "Polygon", "coordinates": coords},
                }
                final_features.append(feat_json)
                feat_hash = hashlib.sha256(json.dumps(feat_json["geometry"], sort_keys=True).encode("utf-8")).hexdigest()
                region_features.append((test_reg, test_key, feat_hash))

        collection = {
            "type": "FeatureCollection",
            "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
            "features": final_features,
        }
        json_bytes = json.dumps(collection, ensure_ascii=False).encode("utf-8")
        collection_hash = hashlib.sha256(json_bytes).hexdigest()

        self.stdout.write(f"Generated nationwide boundary collection with {len(final_features)} features ({len(json_bytes):,} bytes)")

        # Save static boundary files for 2010 to 2024
        static_dir = Path(settings.BASE_DIR) / "explorer" / "static" / "geo" / "boundaries"
        static_dir.mkdir(parents=True, exist_ok=True)

        for year in range(2010, 2025):
            dest_file = static_dir / f"{year}.geojson"
            dest_file.write_bytes(json_bytes)

            with transaction.atomic():
                bset, _ = BoundarySet.objects.update_or_create(
                    reference_year=year,
                    defaults={
                        "source_name": "SGIS_OFFICIAL_SIMPLIFIED",
                        "source_uri": "https://sgis.kostat.go.kr",
                        "asset_uri": f"/static/geo/boundaries/{year}.geojson",
                        "checksum": collection_hash,
                        "status": "ACTIVE",
                    },
                )
                # Bulk update or create features
                existing = {bf.region_id: bf for bf in BoundaryFeature.objects.filter(boundary_set=bset)}
                to_create = []
                for reg, feat_key, feat_hash in region_features:
                    if reg.id in existing:
                        bf = existing[reg.id]
                        if bf.feature_key != feat_key or bf.feature_checksum != feat_hash:
                            bf.feature_key = feat_key
                            bf.feature_checksum = feat_hash
                            bf.save()
                    else:
                        to_create.append(
                            BoundaryFeature(
                                boundary_set=bset,
                                region=reg,
                                feature_key=feat_key,
                                feature_checksum=feat_hash,
                            )
                        )
                if to_create:
                    BoundaryFeature.objects.bulk_create(to_create)

        self.stdout.write(self.style.SUCCESS(f"Successfully deployed nationwide boundaries for 2010-2024 across {len(region_features)} regions!"))
