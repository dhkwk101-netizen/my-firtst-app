from datetime import date
from decimal import Decimal
from django.test import TestCase
from psycopg.types.range import Range
from explorer.models import (
    Dataset,
    DatasetFamily,
    DatasetVersion,
    DerivedIndicator,
    DerivedIndicatorInput,
    Indicator,
    IngestionJob,
    IngestionSlice,
    Metric,
    Observation,
    ObservationInput,
    Period,
    RawObservation,
    Region,
    Unit,
)
from explorer.pipeline.derived import calculate_cagr, calculate_per_capita, calculate_yoy
from explorer.pipeline.publisher import publish_job


class DerivedCalculationTests(TestCase):
    def test_per_capita_uses_exact_decimal(self):
        self.assertEqual(calculate_per_capita(Decimal("1000"), Decimal("4")), Decimal("250"))

    def test_per_capita_missing_or_zero_denominator_is_missing(self):
        self.assertIsNone(calculate_per_capita(Decimal("1000"), Decimal("0")))
        self.assertIsNone(calculate_per_capita(Decimal("1000"), None))

    def test_yoy_and_cagr_require_positive_comparable_inputs(self):
        self.assertEqual(calculate_yoy(Decimal("110"), Decimal("100")), Decimal("10"))
        self.assertIsNone(calculate_cagr(Decimal("0"), Decimal("110"), 2))

    def test_failed_quality_in_staged_prevents_publication_and_supersession(self):
        family = DatasetFamily.objects.create(family_key="PUB_FAM", name="Pub Family")
        ds = Dataset.objects.create(
            dataset_key="PUB_DS", family=family, source_provider="KOSIS",
            source_org_id="101", source_table_id="PUB_TBL", source_table_name="Pub Table",
            geography_level="BASIC_LOCAL_GOVERNMENT", frequency="YEAR",
        )
        version = DatasetVersion.objects.create(
            dataset=ds, version=1, status="ACTIVE", metadata_checksum="p" * 64, metadata_snapshot={},
        )
        region = Region.objects.create(
            region_key="PUB_REG", region_level="BASIC_LOCAL_GOVERNMENT", region_kind="DISTRICT",
            valid_period=Range(date(2010, 1, 1), None, "[)"), status="ACTIVE",
        )
        period = Period.objects.create(
            period_key="PUB_Y_2024", period_type="YEAR", period_start=date(2024, 1, 1), period_end=date(2024, 12, 31),
        )
        unit = Unit.objects.create(unit_key="PUB_U", name="원", dimension="CURRENCY", symbol="원")
        indicator = Indicator.objects.create(
            indicator_key="PUB_IND", name="취득세", description="", category="TAX",
            canonical_unit=unit, value_type="CURRENCY", aggregation_method="SUM",
            geography_requirement="MANDATORY", default_frequency="YEAR", source_type="OFFICIAL",
            status="ACTIVE",
        )
        metric = Metric.objects.create(metric_key="PUB_MET", name="금액", description="")

        old_job = IngestionJob.objects.create(
            dataset_version=version, job_type="FULL", status="SUCCESS", idempotency_key="PUB_OLD_JOB",
        )
        slice_row = IngestionSlice.objects.create(
            ingestion_job=old_job, slice_key="PUB_SLICE", request_parameters={}, status="SUCCESS",
        )
        raw_old = RawObservation.objects.create(
            ingestion_job=old_job, ingestion_slice=slice_row, dataset_version=version,
            org_id="101", tbl_id="PUB_TBL", itm_id="ITM", prd_se="Y", prd_de="2024", dt="100",
            source_row_hash="hash_old",
        )
        # Prior active observation
        old_obs = Observation.objects.create(
            region=region, period=period, indicator=indicator, metric=metric,
            numeric_value=Decimal("100"), canonical_unit=unit, raw_value="100",
            status="PUBLISHED", quality_status="PASSED", source_dataset_version=version,
            source_raw_observation=raw_old,
            ingestion_job=old_job,
        )

        new_job = IngestionJob.objects.create(
            dataset_version=version, job_type="FULL", status="RUNNING", idempotency_key="PUB_NEW_JOB",
        )
        slice_new = IngestionSlice.objects.create(
            ingestion_job=new_job, slice_key="PUB_SLICE_NEW", request_parameters={}, status="SUCCESS",
        )
        raw_new = RawObservation.objects.create(
            ingestion_job=new_job, ingestion_slice=slice_new, dataset_version=version,
            org_id="101", tbl_id="PUB_TBL", itm_id="ITM", prd_se="Y", prd_de="2024", dt="200",
            source_row_hash="hash_new",
        )
        # Staged observation with FAILED quality
        staged_obs = Observation.objects.create(
            region=region, period=period, indicator=indicator, metric=metric,
            numeric_value=Decimal("200"), canonical_unit=unit, raw_value="200",
            status="UNPUBLISHED", quality_status="FAILED", source_dataset_version=version,
            source_raw_observation=raw_new,
            ingestion_job=new_job,
        )

        res = publish_job(new_job.id)
        self.assertFalse(res.success)

        old_obs.refresh_from_db()
        staged_obs.refresh_from_db()
        self.assertEqual(old_obs.status, "PUBLISHED")
        self.assertIsNone(old_obs.superseded_at)
        self.assertEqual(staged_obs.status, "UNPUBLISHED")
