import hashlib
import json
import math
from dataclasses import dataclass
from datetime import date
from typing import Any
from django.db.models import Q
from explorer.kosis.client import sanitize_params
from explorer.models import (
    DatasetDimension,
    DatasetItemMapping,
    DatasetRegionMapping,
    DatasetVersion,
    IndicatorSourceAssignment,
)


@dataclass(frozen=True)
class IngestionIntent:
    indicator_key: str
    metric_keys: tuple[str, ...]
    region_level: str
    start_year: int
    end_year: int


@dataclass(frozen=True)
class CountSlice:
    period_count: int
    item_count: int
    dimension_counts: tuple[int, ...]
    estimated_cells: int


@dataclass(frozen=True)
class PlannedSlice:
    slice_key: str
    dataset_version_id: int
    start_year: int
    end_year: int
    request_parameters: dict[str, Any]
    normalization_context: dict[str, Any]
    estimated_cells: int


def estimate_cells(period_count: int, item_count: int, dimension_counts: tuple[int, ...]) -> int:
    dim_prod = math.prod(dimension_counts) if dimension_counts else 1
    return period_count * item_count * dim_prod


def split_counts(
    period_count: int,
    item_count: int,
    dimension_counts: tuple[int, ...],
    limit: int = 40000,
) -> tuple[CountSlice, ...]:
    total_cells = estimate_cells(period_count, item_count, dimension_counts)
    if total_cells <= limit:
        return (
            CountSlice(
                period_count=period_count,
                item_count=item_count,
                dimension_counts=dimension_counts,
                estimated_cells=total_cells,
            ),
        )

    # Split periods first
    if period_count > 1:
        half = period_count // 2
        return split_counts(half, item_count, dimension_counts, limit) + split_counts(
            period_count - half, item_count, dimension_counts, limit
        )

    # If period_count == 1, split dimension counts
    if dimension_counts and dimension_counts[0] > 1:
        dim0 = dimension_counts[0]
        half_dim = dim0 // 2
        rest_dims = dimension_counts[1:]
        return split_counts(1, item_count, (half_dim,) + rest_dims, limit) + split_counts(
            1, item_count, (dim0 - half_dim,) + rest_dims, limit
        )

    # Split items
    if item_count > 1:
        half_items = item_count // 2
        return split_counts(1, half_items, dimension_counts, limit) + split_counts(
            1, item_count - half_items, dimension_counts, limit
        )

    return (
        CountSlice(
            period_count=period_count,
            item_count=item_count,
            dimension_counts=dimension_counts,
            estimated_cells=total_cells,
        ),
    )


def _compute_slice_key(
    dataset_version_id: int,
    checksum: str,
    sanitized_params: dict[str, str],
    normalization_context: dict[str, Any],
) -> str:
    payload = {
        "dataset_version_id": dataset_version_id,
        "checksum": checksum,
        "params": sanitized_params,
        "norm_ctx": normalization_context,
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def plan(intent: IngestionIntent) -> tuple[PlannedSlice, ...]:
    # Query authoritative assignments
    assignments = (
        IndicatorSourceAssignment.objects.filter(
            indicator__indicator_key=intent.indicator_key,
            metric__metric_key__in=intent.metric_keys,
            region_level=intent.region_level,
            authority_status="AUTHORITATIVE",
            dataset_version__status="ACTIVE",
        )
        .select_related("dataset_version", "dataset_version__dataset")
        .order_by("priority", "id")
    )

    planned_slices: list[PlannedSlice] = []

    for assignment in assignments:
        v = assignment.dataset_version
        ds = v.dataset
        v_period = assignment.valid_period

        assign_start_year = v_period.lower.year if v_period and v_period.lower else intent.start_year
        assign_end_year = (
            (v_period.upper.year - 1) if (v_period and v_period.upper) else intent.end_year
        )

        eff_start = max(intent.start_year, assign_start_year)
        eff_end = min(intent.end_year, assign_end_year)

        if eff_start > eff_end:
            continue

        # Items
        item_mappings = DatasetItemMapping.objects.filter(
            dataset_version=v,
            indicator__indicator_key=intent.indicator_key,
            metric__metric_key__in=intent.metric_keys,
        )
        item_ids = [m.source_item_id for m in item_mappings]
        if not item_ids:
            item_ids = ["ALL"]

        # Dimensions
        dimensions = DatasetDimension.objects.filter(dataset_version=v).order_by("ordinal")
        normalization_context: dict[str, Any] = {}
        request_params: dict[str, Any] = {
            "orgId": ds.source_org_id,
            "tblId": ds.source_table_id,
        }

        for dim in dimensions:
            if dim.selection_strategy == "FIXED":
                if dim.semantic_dimension == "REGION":
                    normalization_context["fixed_region_key"] = dim.default_value
                elif dim.semantic_dimension == "TAX_TYPE":
                    normalization_context["fixed_tax_type"] = dim.default_value
            elif dim.selection_strategy == "ALL_MAPPED" and dim.source_dimension:
                # Add to request parameters as objL1..
                dim_idx = dim.source_dimension.replace("C", "")
                request_params[f"objL{dim_idx}"] = "ALL"

        years_count = eff_end - eff_start + 1
        items_count = len(item_ids)

        count_slices = split_counts(
            period_count=years_count,
            item_count=items_count,
            dimension_counts=(1,),
            limit=40000,
        )

        curr_year = eff_start
        for cs in count_slices:
            slice_end_year = curr_year + cs.period_count - 1
            slice_params = dict(request_params)
            slice_params["prdSe"] = "Y"
            slice_params["startPrdDe"] = str(curr_year)
            slice_params["endPrdDe"] = str(slice_end_year)
            if item_ids != ["ALL"]:
                slice_params["itmId"] = "+".join(item_ids)

            sanitized = sanitize_params(slice_params)
            slice_key = _compute_slice_key(v.id, v.metadata_checksum, sanitized, normalization_context)

            planned_slices.append(
                PlannedSlice(
                    slice_key=slice_key,
                    dataset_version_id=v.id,
                    start_year=curr_year,
                    end_year=slice_end_year,
                    request_parameters=slice_params,
                    normalization_context=dict(normalization_context),
                    estimated_cells=cs.estimated_cells,
                )
            )
            curr_year = slice_end_year + 1

    return tuple(planned_slices)
