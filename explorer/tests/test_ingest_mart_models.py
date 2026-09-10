from decimal import Decimal
from django.db import IntegrityError, transaction
from django.test import TestCase
from explorer.models import Observation, RawObservation
from explorer.tests.factories import make_job_and_slice, make_region_and_period


class IngestMartModelTests(TestCase):
    def test_source_row_hash_is_unique_within_job(self):
        job, slice_row = make_job_and_slice()
        values = dict(
            ingestion_job=job,
            ingestion_slice=slice_row,
            dataset_version=job.dataset_version,
            org_id="TEST_ORG",
            tbl_id="TEST_TABLE",
            itm_id="TEST_ITEM",
            prd_se="Y",
            prd_de="2024",
            dt="0",
            source_row_hash="a" * 64,
            raw_payload={"DT": "0"},
            quality_status="UNVALIDATED",
        )
        RawObservation.objects.create(**values)
        with self.assertRaises(IntegrityError), transaction.atomic():
            RawObservation.objects.create(**values)

    def test_observation_requires_source_or_derived_lineage(self):
        region, period, indicator, metric, tax_owner, unit = make_region_and_period()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Observation.objects.create(
                region=region,
                period=period,
                indicator=indicator,
                metric=metric,
                tax_owner=tax_owner,
                numeric_value=Decimal("100.0"),
                canonical_unit=unit,
                raw_value="100",
                status="PUBLISHED",
                # neither source_raw_observation nor derived_indicator provided
            )

    def test_only_one_active_source_observation_per_identity_and_dataset_version(self):
        job, slice_row = make_job_and_slice("TEST_JOB_2")
        region, period, indicator, metric, tax_owner, unit = make_region_and_period()
        raw_row = RawObservation.objects.create(
            ingestion_job=job,
            ingestion_slice=slice_row,
            dataset_version=job.dataset_version,
            org_id="TEST_ORG",
            tbl_id="TEST_TABLE",
            itm_id="TEST_ITEM",
            prd_se="Y",
            prd_de="2024",
            dt="100",
            source_row_hash="c" * 64,
            raw_payload={"DT": "100"},
            quality_status="UNVALIDATED",
        )
        Observation.objects.create(
            region=region,
            period=period,
            indicator=indicator,
            metric=metric,
            tax_owner=tax_owner,
            numeric_value=Decimal("100.0"),
            canonical_unit=unit,
            raw_value="100",
            status="PUBLISHED",
            source_raw_observation=raw_row,
            source_dataset_version=job.dataset_version,
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            Observation.objects.create(
                region=region,
                period=period,
                indicator=indicator,
                metric=metric,
                tax_owner=tax_owner,
                numeric_value=Decimal("200.0"),
                canonical_unit=unit,
                raw_value="200",
                status="PUBLISHED",
                source_raw_observation=raw_row,
                source_dataset_version=job.dataset_version,
            )
