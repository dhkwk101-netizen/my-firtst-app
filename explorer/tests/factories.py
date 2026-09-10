from datetime import date
from psycopg.types.range import Range
from explorer.models import (
    BoundarySet,
    Dataset,
    DatasetFamily,
    DatasetVersion,
    Indicator,
    IngestionJob,
    IngestionSlice,
    Metric,
    Period,
    Region,
    TaxOwner,
    Unit,
)


def make_job_and_slice(job_key="TEST_JOB_1"):
    family, _ = DatasetFamily.objects.get_or_create(
        family_key="TEST_FAMILY",
        defaults={"name": "Test Family"},
    )
    dataset, _ = Dataset.objects.get_or_create(
        dataset_key="TEST_DATASET",
        defaults={
            "family": family,
            "source_provider": "KOSIS",
            "source_org_id": "TEST_ORG",
            "source_table_id": "TEST_TABLE",
            "source_table_name": "Test Table",
            "geography_level": "BASIC_LOCAL_GOVERNMENT",
            "frequency": "YEAR",
        },
    )
    version, _ = DatasetVersion.objects.get_or_create(
        dataset=dataset,
        version=1,
        defaults={
            "status": "ACTIVE",
            "metadata_checksum": "0" * 64,
            "metadata_snapshot": {"source": "factory"},
        },
    )
    job = IngestionJob.objects.create(
        dataset_version=version,
        job_type="FULL_BACKFILL",
        status="RUNNING",
        idempotency_key=job_key,
    )
    slice_row = IngestionSlice.objects.create(
        ingestion_job=job,
        slice_key=f"{job_key}_SLICE_1",
        request_parameters={"orgId": "TEST_ORG", "tblId": "TEST_TABLE", "startPrdDe": "2020", "endPrdDe": "2024"},
        status="PENDING",
    )
    return job, slice_row


def make_planned_job(slice_status="PENDING", job_key="TEST_PLAN_JOB"):
    job, slice_row = make_job_and_slice(job_key)
    slice_row.status = slice_status
    slice_row.save()
    return job


def make_region_and_period(year=2024):
    region, _ = Region.objects.get_or_create(
        region_key="TEST_REGION_1",
        defaults={
            "region_level": "BASIC_LOCAL_GOVERNMENT",
            "region_kind": "AUTONOMOUS_DISTRICT",
            "valid_period": Range(date(2010, 1, 1), None, "[)"),
            "status": "ACTIVE",
        },
    )
    boundary_set, _ = BoundarySet.objects.get_or_create(
        reference_year=year,
        defaults={
            "source_name": "TEST_SGIS",
            "source_uri": f"https://example.invalid/{year}",
            "asset_uri": f"/geo/boundaries/{year}.geojson",
            "checksum": f"{year}" * 16,
            "status": "ACTIVE",
        },
    )
    period, _ = Period.objects.get_or_create(
        period_key=f"TEST_Y_{year}",
        defaults={
            "period_type": "YEAR",
            "period_start": date(year, 1, 1),
            "period_end": date(year, 12, 31),
            "boundary_set": boundary_set,
        },
    )
    unit, _ = Unit.objects.get_or_create(
        unit_key="TEST_KRW_THOUSAND",
        defaults={"name": "천원", "dimension": "CURRENCY", "symbol": "천원"},
    )
    metric, _ = Metric.objects.get_or_create(
        metric_key="TEST_AMOUNT",
        defaults={"name": "금액", "description": "원천 수납액"},
    )
    tax_owner, _ = TaxOwner.objects.get_or_create(
        tax_owner_key="TEST_BASIC_GOV",
        defaults={"name": "시군구세"},
    )
    indicator, _ = Indicator.objects.get_or_create(
        indicator_key="TEST_ACQUISITION_TAX",
        defaults={
            "name": "취득세",
            "description": "지방세 취득세",
            "category": "TAX",
            "canonical_unit": unit,
            "value_type": "CURRENCY",
            "aggregation_method": "SUM",
            "geography_requirement": "MANDATORY",
            "default_frequency": "YEAR",
            "source_type": "OFFICIAL",
            "status": "ACTIVE",
        },
    )
    return region, period, indicator, metric, tax_owner, unit


def make_published_series():
    from decimal import Decimal
    from explorer.models import Observation, RawObservation

    region, period, indicator, metric, tax_owner, unit = make_region_and_period(2024)
    job, slice_row = make_job_and_slice("TEST_SERIES_JOB")
    raw = RawObservation.objects.create(
        ingestion_job=job,
        ingestion_slice=slice_row,
        dataset_version=job.dataset_version,
        org_id="TEST_ORG",
        tbl_id="TEST_TBL",
        itm_id="TEST_ITM",
        prd_se="Y",
        prd_de="2024",
        dt="1000",
        source_row_hash="hash_series_raw",
    )
    obs = Observation.objects.create(
        region=region,
        period=period,
        indicator=indicator,
        metric=metric,
        tax_owner=tax_owner,
        numeric_value=Decimal("1000"),
        canonical_unit=unit,
        raw_value="1000",
        status="PUBLISHED",
        quality_status="PASSED",
        source_raw_observation=raw,
        source_dataset_version=job.dataset_version,
        ingestion_job=job,
    )
    return region, indicator
