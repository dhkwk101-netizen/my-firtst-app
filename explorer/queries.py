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


def query_regions() -> list[dict[str, Any]]:
    regions = Region.objects.filter(status="ACTIVE").order_by("region_key")
    out = []
    for r in regions:
        # Get official or latest name
        name_obj = r.names.filter(is_official=True).first() or r.names.first()
        name_str = name_obj.name if name_obj else r.region_key
        out.append(
            {
                "regionKey": r.region_key,
                "name": name_str,
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

        rankings.append(
            {
                "regionKey": obs.region.region_key,
                "regionName": region_name,
                "featureKey": feature_key,
                "value": val,
                "rank": rank,
                "status": "PRESENT" if val is not None else "MISSING",
            }
        )

    return {
        "indicatorKey": indicator_key,
        "year": year,
        "boundaryVersion": boundary_version,
        "boundaryUrl": boundary_set.asset_uri if boundary_set else f"/static/geo/boundaries/{year}.geojson",
        "values": rankings,
        "rankings": rankings,
    }
