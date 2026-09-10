import re
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from django.db import transaction
from explorer.models import (
    DatasetDimension,
    DatasetItemMapping,
    DatasetRegionMapping,
    IngestionJob,
    NormalizationRule,
    Observation,
    Period,
    RawObservation,
    Region,
)


@dataclass(frozen=True)
class ParsedValue:
    numeric_value: Decimal | None
    value_status: str
    rule_id: int | None = None


@dataclass
class NormalizationResult:
    normalized_count: int = 0
    failed_count: int = 0
    failures: list[dict[str, Any]] = field(default_factory=list)


def parse_stat_value(
    raw_value: str | None,
    symbol: str | None,
    unit_rule: NormalizationRule | None = None,
) -> ParsedValue:
    if raw_value is not None:
        raw_value = str(raw_value).strip()
    if symbol is not None:
        symbol = str(symbol).strip()

    # Treat missing symbols or empty strings as MISSING
    if not raw_value or raw_value in ("-", "...", "…", "X", "x") or symbol in ("-", "...", "…", "X", "x"):
        return ParsedValue(
            numeric_value=None,
            value_status="MISSING",
            rule_id=unit_rule.id if unit_rule else None,
        )

    # Clean numeric formatting (e.g. 1,000 -> 1000)
    cleaned = raw_value.replace(",", "").strip()
    try:
        dec = Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return ParsedValue(
            numeric_value=None,
            value_status="INVALID",
            rule_id=unit_rule.id if unit_rule else None,
        )

    # Apply unit conversion rule if present
    rule_id = None
    if unit_rule:
        rule_id = unit_rule.id
        if unit_rule.rule_type == "UNIT_SCALE" and "multiplier" in unit_rule.parameters:
            mult = Decimal(str(unit_rule.parameters["multiplier"]))
            dec = dec * mult

    return ParsedValue(numeric_value=dec, value_status="PRESENT", rule_id=rule_id)


def normalize_job(job_id: int) -> NormalizationResult:
    job = IngestionJob.objects.select_related("dataset_version").get(id=job_id)
    version = job.dataset_version

    # Delete existing staged/unpublished observations for this job
    Observation.objects.filter(ingestion_job=job, status="UNPUBLISHED").delete()

    raw_rows = RawObservation.objects.filter(ingestion_job=job).order_by("id")
    result = NormalizationResult()

    # Pre-fetch dimensions to check for fixed context
    dimensions = list(DatasetDimension.objects.filter(dataset_version=version))
    fixed_region_key = None
    for dim in dimensions:
        if dim.selection_strategy == "FIXED" and dim.semantic_dimension == "REGION":
            fixed_region_key = dim.default_value

    observations_to_create = []

    for raw in raw_rows:
        # 1. Locate Period
        period_key = f"Y_{raw.prd_de}" if raw.prd_se == "Y" else f"M_{raw.prd_de}"
        period = Period.objects.filter(period_key=period_key).first()
        if not period:
            result.failed_count += 1
            result.failures.append({"raw_id": raw.id, "error": "INVALID_PERIOD", "period_key": period_key})
            continue

        ref_date = period.period_start

        # 2. Match Item Mapping
        item_mapping = (
            DatasetItemMapping.objects.filter(
                dataset_version=version,
                source_item_id=raw.itm_id,
                valid_period__contains=ref_date,
            )
            .select_related("indicator", "metric", "tax_owner", "indicator__canonical_unit")
            .first()
        )
        if not item_mapping:
            result.failed_count += 1
            result.failures.append({"raw_id": raw.id, "error": "UNKNOWN_ITEM", "item_id": raw.itm_id})
            continue

        # 3. Match Region
        region = None
        if fixed_region_key:
            region = Region.objects.filter(region_key=fixed_region_key).first()
        else:
            region_code = raw.c1
            reg_mapping = DatasetRegionMapping.objects.filter(
                dataset_version=version,
                source_region_code=region_code,
                valid_period__contains=ref_date,
            ).select_related("region").first()
            if reg_mapping:
                region = reg_mapping.region

        if not region:
            result.failed_count += 1
            result.failures.append({"raw_id": raw.id, "error": "UNKNOWN_REGION", "c1": raw.c1})
            continue

        # 4. Check Unit & Conversion Rule
        unit_rule = NormalizationRule.objects.filter(
            status="ACTIVE",
            parameters__source_unit=raw.unit_id,
        ).first()

        parsed = parse_stat_value(raw.dt, raw.symbol, unit_rule=unit_rule)

        # 5. Create Observation
        observations_to_create.append(
            Observation(
                region=region,
                period=period,
                indicator=item_mapping.indicator,
                metric=item_mapping.metric,
                tax_owner=item_mapping.tax_owner,
                numeric_value=parsed.numeric_value,
                canonical_unit=item_mapping.indicator.canonical_unit,
                raw_value=raw.dt,
                status="UNPUBLISHED",
                symbol=raw.symbol,
                quality_status="PASSED" if parsed.value_status != "INVALID" else "FAILED",
                source_raw_observation=raw,
                source_dataset_version=version,
                normalization_rule=unit_rule if parsed.rule_id else None,
                ingestion_job=job,
            )
        )

    if observations_to_create:
        with transaction.atomic():
            Observation.objects.bulk_create(observations_to_create)
        result.normalized_count += len(observations_to_create)

    # Update job counter
    job.normalized_row_count = result.normalized_count
    job.failed_row_count = result.failed_count
    job.save(update_fields=["normalized_row_count", "failed_row_count"])

    return result
