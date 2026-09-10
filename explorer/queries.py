from datetime import date
from decimal import Decimal
from typing import Any
from django.db.models import F
from explorer.models import (
    BoundaryFeature,
    BoundarySet,
    Indicator,
    Observation,
    Region,
    RegionName,
)


PROVINCE_MAP = {
    "KR_11": {"name": "서울특별시", "short": "서울", "lat": 37.5665, "lng": 126.9780, "zoom": 11},
    "KR_26": {"name": "부산광역시", "short": "부산", "lat": 35.1796, "lng": 129.0756, "zoom": 11},
    "KR_27": {"name": "대구광역시", "short": "대구", "lat": 35.8714, "lng": 128.6014, "zoom": 11},
    "KR_28": {"name": "인천광역시", "short": "인천", "lat": 37.4563, "lng": 126.7052, "zoom": 10},
    "KR_29": {"name": "광주광역시", "short": "광주", "lat": 35.1595, "lng": 126.8526, "zoom": 11},
    "KR_30": {"name": "대전광역시", "short": "대전", "lat": 36.3504, "lng": 127.3845, "zoom": 11},
    "KR_31": {"name": "울산광역시", "short": "울산", "lat": 35.5384, "lng": 129.3114, "zoom": 11},
    "KR_36": {"name": "세종특별자치시", "short": "세종", "lat": 36.4800, "lng": 127.2890, "zoom": 11},
    "KR_41": {"name": "경기도", "short": "경기", "lat": 37.4138, "lng": 127.5183, "zoom": 9},
    "KR_43": {"name": "충청북도", "short": "충북", "lat": 36.6357, "lng": 127.4912, "zoom": 9},
    "KR_44": {"name": "충청남도", "short": "충남", "lat": 36.5184, "lng": 126.8000, "zoom": 9},
    "KR_46": {"name": "전라남도", "short": "전남", "lat": 34.8679, "lng": 126.9910, "zoom": 8},
    "KR_47": {"name": "경상북도", "short": "경북", "lat": 36.5760, "lng": 128.5056, "zoom": 8},
    "KR_48": {"name": "경상남도", "short": "경남", "lat": 35.4606, "lng": 128.2132, "zoom": 9},
    "KR_50": {"name": "제주특별자치도", "short": "제주", "lat": 33.4996, "lng": 126.5312, "zoom": 10},
    "KR_51": {"name": "강원특별자치도", "short": "강원", "lat": 37.8228, "lng": 128.1555, "zoom": 8},
    "KR_52": {"name": "전북특별자치도", "short": "전북", "lat": 35.7175, "lng": 127.1530, "zoom": 9},
}


def query_regions() -> list[dict[str, Any]]:
    regions = Region.objects.filter(status="ACTIVE").order_by("region_key")
    out = []
    for r in regions:
        # Get official or latest name
        name_obj = r.names.filter(is_official=True).first() or r.names.first()
        name_str = name_obj.name if name_obj else r.region_key
        prefix = r.region_key[:5]
        prov = PROVINCE_MAP.get(prefix)
        prov_name = prov["name"] if prov else None
        short_prov = prov["short"] if prov else None
        full_name = f"{prov_name} {name_str}" if prov_name else name_str

        out.append(
            {
                "regionKey": r.region_key,
                "name": name_str,
                "fullName": full_name,
                "provinceCode": prefix if prov else None,
                "provinceName": prov_name,
                "shortProvinceName": short_prov,
                "level": r.region_level,
                "kind": r.region_kind,
            }
        )
    return out



def query_indicators() -> list[dict[str, Any]]:
    indicators = Indicator.objects.filter(status="ACTIVE").select_related("canonical_unit").order_by("category", "name")
    return [
        {
            "indicatorKey": ind.indicator_key,
            "name": ind.name,
            "category": ind.category,
            "unit": ind.canonical_unit.name,
            "unitSymbol": ind.canonical_unit.symbol,
            "sourceType": ind.source_type,
        }
        for ind in indicators
    ]


def query_series(
    region_keys: tuple[str, ...],
    indicator_key: str,
    metric_key: str | None = None,
    tax_owner_key: str | None = None,
    start_year: int = 2010,
    end_year: int = 2024,
) -> dict[str, Any]:
    qs = (
        Observation.objects.filter(
            status="PUBLISHED",
            superseded_at__isnull=True,
            region__region_key__in=region_keys,
            indicator__indicator_key=indicator_key,
            period__period_start__gte=date(start_year, 1, 1),
            period__period_end__lte=date(end_year, 12, 31),
        )
        .select_related(
            "region",
            "period",
            "indicator",
            "metric",
            "tax_owner",
            "canonical_unit",
            "source_raw_observation",
            "source_dataset_version__dataset",
            "derived_indicator",
        )
        .order_by("period__period_start")
    )

    if metric_key:
        qs = qs.filter(metric__metric_key=metric_key)
    if tax_owner_key:
        qs = qs.filter(tax_owner__tax_owner_key=tax_owner_key)

    values = []
    source_info: dict[str, Any] = {}

    for obs in qs:
        # Numeric value formatting
        val = float(obs.numeric_value) if obs.numeric_value is not None else None
        values.append(
            {
                "regionKey": obs.region.region_key,
                "period": str(obs.period.period_start.year),
                "value": val,
                "status": "PRESENT" if obs.numeric_value is not None else "MISSING",
                "symbol": obs.symbol,
            }
        )

        if not source_info:
            if obs.source_dataset_version:
                ds = obs.source_dataset_version.dataset
                source_info = {
                    "derived": False,
                    "provider": ds.source_provider,
                    "tableId": ds.source_table_id,
                    "tableName": ds.source_table_name,
                    "unit": obs.canonical_unit.name,
                    "unitSymbol": obs.canonical_unit.symbol,
                }
            elif obs.derived_indicator:
                inputs_list = []
                for inp in obs.inputs.select_related("input_observation__indicator"):
                    inputs_list.append({
                        "role": inp.input_role,
                        "indicatorKey": inp.input_observation.indicator.indicator_key,
                    })
                source_info = {
                    "derived": True,
                    "evaluator": obs.derived_indicator.evaluator_key,
                    "unit": obs.canonical_unit.name,
                    "unitSymbol": obs.canonical_unit.symbol,
                    "inputs": inputs_list,
                }

    return {
        "indicatorKey": indicator_key,
        "regionKeys": list(region_keys),
        "startYear": start_year,
        "endYear": end_year,
        "values": values,
        "source": source_info,
    }


def query_rankings(
    indicator_key: str,
    year: int,
    metric_key: str | None = None,
    tax_owner_key: str | None = None,
    province_code: str | None = None,
) -> dict[str, Any]:
    boundary_set = BoundarySet.objects.filter(reference_year=year, status="ACTIVE").first()
    boundary_version = str(year)

    # Pre-fetch boundary features
    feature_map: dict[int, str] = {}
    if boundary_set:
        for feat in BoundaryFeature.objects.filter(boundary_set=boundary_set):
            feature_map[feat.region_id] = feat.feature_key

    qs = (
        Observation.objects.filter(
            status="PUBLISHED",
            superseded_at__isnull=True,
            indicator__indicator_key=indicator_key,
            period__period_start__lte=date(year, 12, 31),
            period__period_end__gte=date(year, 1, 1),
        )
        .select_related("region", "indicator", "metric", "tax_owner", "canonical_unit")
        .order_by("-numeric_value")
    )

    if province_code:
        qs = qs.filter(region__region_key__startswith=province_code)

    if metric_key:
        qs = qs.filter(metric__metric_key=metric_key)
    if tax_owner_key:
        qs = qs.filter(tax_owner__tax_owner_key=tax_owner_key)

    # Pre-fetch official region names
    region_names: dict[int, str] = {
        rn.region_id: rn.name
        for rn in RegionName.objects.filter(is_official=True)
    }

    rankings = []
    current_rank = 1
    for obs in qs:
        val = float(obs.numeric_value) if obs.numeric_value is not None else None
        rank = None
        if val is not None:
            rank = current_rank
            current_rank += 1

        feature_key = feature_map.get(obs.region_id, obs.region.region_key)
        region_name = region_names.get(obs.region_id, obs.region.region_key)
        prefix = obs.region.region_key[:5]
        prov = PROVINCE_MAP.get(prefix)
        prov_name = prov["name"] if prov else None
        short_prov = prov["short"] if prov else None
        full_name = f"{prov_name} {region_name}" if prov_name else region_name

        rankings.append(
            {
                "regionKey": obs.region.region_key,
                "regionName": region_name,
                "fullName": full_name,
                "provinceCode": prefix if prov else None,
                "provinceName": prov_name,
                "shortProvinceName": short_prov,
                "featureKey": feature_key,
                "value": val,
                "rank": rank,
                "status": "PRESENT" if val is not None else "MISSING",
            }
        )

    return {
        "indicatorKey": indicator_key,
        "year": year,
        "provinceCode": province_code,
        "boundaryVersion": boundary_version,
        "boundaryUrl": boundary_set.asset_uri if boundary_set else f"/static/geo/boundaries/{year}.geojson",
        "values": rankings,
        "rankings": rankings,
    }

