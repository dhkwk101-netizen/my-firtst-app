from datetime import date
from decimal import Decimal
from django.test import TestCase
from psycopg.types.range import Range
from explorer.models import (
    Dataset,
    DatasetDimension,
    DatasetFamily,
    DatasetItemMapping,
    DatasetRegionMapping,
    DatasetVersion,
    Indicator,
    IngestionJob,
    IngestionSlice,
    Metric,
    NormalizationRule,
    Observation,
    Period,
    RawObservation,
    Region,
    Unit,
)
from explorer.pipeline.normalizer import (
    normalize_job,
    parse_stat_value,
)


class NormalizerTests(TestCase):
    def test_zero_is_present(self):
        parsed = parse_stat_value("0", None)
        self.assertEqual(parsed.numeric_value, Decimal("0"))
        self.assertEqual(parsed.value_status, "PRESENT")

    def test_dash_is_missing_not_zero(self):
        parsed = parse_stat_value("-", "-")
        self.assertIsNone(parsed.numeric_value)
        self.assertEqual(parsed.value_status, "MISSING")

    def test_source_region_code_selects_mapping_valid_in_year(self):
        family = DatasetFamily.objects.create(family_key="F_NORM", name="Family Norm")
        ds = Dataset.objects.create(
            dataset_key="DS_NORM", family=family, source_provider="KOSIS",
            source_org_id="101", source_table_id="T_NORM", source_table_name="Table Norm",
            geography_level="BASIC_LOCAL_GOVERNMENT", frequency="YEAR",
        )
        version = DatasetVersion.objects.create(
            dataset=ds, version=1, status="ACTIVE", metadata_checksum="a" * 64, metadata_snapshot={},
        )
        r2014 = Region.objects.create(
            region_key="REG_2014", region_level="BASIC_LOCAL_GOVERNMENT", region_kind="DISTRICT",
            valid_period=Range(date(2010, 1, 1), date(2015, 1, 1), "[)"), status="ACTIVE",
        )
        r2015 = Region.objects.create(
            region_key="REG_2015", region_level="BASIC_LOCAL_GOVERNMENT", region_kind="DISTRICT",
            valid_period=Range(date(2015, 1, 1), None, "[)"), status="ACTIVE",
        )
        DatasetRegionMapping.objects.create(
            dataset_version=version, source_dimension="C1", source_region_code="11010",
            source_region_name="종로", region=r2014, valid_period=Range(date(2010, 1, 1), date(2015, 1, 1), "[)"),
            mapping_method="EXACT",
        )
        DatasetRegionMapping.objects.create(
            dataset_version=version, source_dimension="C1", source_region_code="11010",
            source_region_name="종로", region=r2015, valid_period=Range(date(2015, 1, 1), None, "[)"),
            mapping_method="EXACT",
        )
        unit = Unit.objects.create(unit_key="U_KRW", name="원", dimension="CURRENCY", symbol="원")
        indicator = Indicator.objects.create(
            indicator_key="IND_NORM", name="세금", description="", category="TAX",
            canonical_unit=unit, value_type="CURRENCY", aggregation_method="SUM",
            geography_requirement="MANDATORY", default_frequency="YEAR", source_type="OFFICIAL",
            status="ACTIVE",
        )
        metric = Metric.objects.create(metric_key="MET_NORM", name="금액", description="")
        DatasetItemMapping.objects.create(
            dataset_version=version, source_item_id="ITM1", source_item_name="세목",
            indicator=indicator, metric=metric, source_unit_id="KRW",
            valid_period=Range(date(2010, 1, 1), None, "[)"), comparability_status="COMPARABLE",
        )
        Period.objects.create(
            period_key="Y_2014", period_type="YEAR", period_start=date(2014, 1, 1), period_end=date(2014, 12, 31),
        )
        Period.objects.create(
            period_key="Y_2015", period_type="YEAR", period_start=date(2015, 1, 1), period_end=date(2015, 12, 31),
        )

        job = IngestionJob.objects.create(
            dataset_version=version, job_type="FULL", status="SUCCESS", idempotency_key="JOB_NORM_1",
        )
        slice_row = IngestionSlice.objects.create(
            ingestion_job=job, slice_key="SLICE_1", request_parameters={}, status="SUCCESS",
        )
        RawObservation.objects.create(
            ingestion_job=job, ingestion_slice=slice_row, dataset_version=version,
            org_id="101", tbl_id="T_NORM", itm_id="ITM1", c1="11010", c1_nm="종로",
            prd_se="Y", prd_de="2014", dt="1000", source_row_hash="hash2014",
        )
        RawObservation.objects.create(
            ingestion_job=job, ingestion_slice=slice_row, dataset_version=version,
            org_id="101", tbl_id="T_NORM", itm_id="ITM1", c1="11010", c1_nm="종로",
            prd_se="Y", prd_de="2015", dt="2000", source_row_hash="hash2015",
        )

        res = normalize_job(job.id)
        self.assertEqual(res.normalized_count, 2)
        obs2014 = Observation.objects.get(ingestion_job=job, period__period_key="Y_2014")
        obs2015 = Observation.objects.get(ingestion_job=job, period__period_key="Y_2015")
        self.assertEqual(obs2014.region, r2014)
        self.assertEqual(obs2015.region, r2015)

    def test_unknown_region_creates_failed_dq_result_without_observation(self):
        family = DatasetFamily.objects.create(family_key="F_NORM2", name="Family Norm 2")
        ds = Dataset.objects.create(
            dataset_key="DS_NORM2", family=family, source_provider="KOSIS",
            source_org_id="101", source_table_id="T_NORM2", source_table_name="Table Norm 2",
            geography_level="BASIC_LOCAL_GOVERNMENT", frequency="YEAR",
        )
        version = DatasetVersion.objects.create(
            dataset=ds, version=1, status="ACTIVE", metadata_checksum="b" * 64, metadata_snapshot={},
        )
        job = IngestionJob.objects.create(
            dataset_version=version, job_type="FULL", status="SUCCESS", idempotency_key="JOB_NORM_2",
        )
        slice_row = IngestionSlice.objects.create(
            ingestion_job=job, slice_key="SLICE_2", request_parameters={}, status="SUCCESS",
        )
        Period.objects.create(
            period_key="Y_2020", period_type="YEAR", period_start=date(2020, 1, 1), period_end=date(2020, 12, 31),
        )
        RawObservation.objects.create(
            ingestion_job=job, ingestion_slice=slice_row, dataset_version=version,
            org_id="101", tbl_id="T_NORM2", itm_id="ITM1", c1="UNKNOWN_CODE",
            prd_se="Y", prd_de="2020", dt="100", source_row_hash="hash_unknown",
        )

        res = normalize_job(job.id)
        self.assertEqual(res.failed_count, 1)
        self.assertEqual(res.normalized_count, 0)
        self.assertFalse(Observation.objects.filter(ingestion_job=job).exists())

    def test_thousand_krw_conversion_yields_exact_krw_decimal_with_rule_id(self):
        rule = NormalizationRule.objects.create(
            rule_key="KRW_THOUSAND_TO_WON",
            version=1,
            rule_type="UNIT_SCALE",
            parameters={"multiplier": "1000"},
            checksum="c" * 64,
            status="ACTIVE",
        )
        parsed = parse_stat_value("500", None, unit_rule=rule)
        self.assertEqual(parsed.numeric_value, Decimal("500000"))
        self.assertEqual(parsed.rule_id, rule.id)
