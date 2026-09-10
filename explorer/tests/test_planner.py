from datetime import date
from django.test import TestCase
from psycopg.types.range import Range
from explorer.kosis.planner import (
    IngestionIntent,
    estimate_cells,
    plan,
    split_counts,
)
from explorer.models import (
    Dataset,
    DatasetDimension,
    DatasetFamily,
    DatasetItemMapping,
    DatasetRegionMapping,
    DatasetVersion,
    Indicator,
    IndicatorSourceAssignment,
    Metric,
    Region,
    Unit,
)


class PlannerTests(TestCase):
    def test_estimate_cells_multiplies_period_items_and_dimensions(self):
        self.assertEqual(estimate_cells(15, 2, (250, 1)), 7500)

    def test_split_counts_keeps_every_slice_within_limit(self):
        slices = split_counts(period_count=15, item_count=8, dimension_counts=(500,), limit=40000)
        self.assertTrue(slices)
        self.assertTrue(all(slice_row.estimated_cells <= 40000 for slice_row in slices))
        self.assertEqual(
            sum(
                slice_row.period_count * slice_row.item_count * slice_row.dimension_counts[0]
                for slice_row in slices
            ),
            60000,
        )

    def test_source_assignment_split_at_2016_produces_separate_plans(self):
        family = DatasetFamily.objects.create(family_key="TAX_FAMILY", name="Tax Family")
        ds1 = Dataset.objects.create(
            dataset_key="TAX_HISTORICAL",
            family=family,
            source_provider="KOSIS",
            source_org_id="101",
            source_table_id="TBL_OLD",
            source_table_name="Tax Old",
            geography_level="BASIC_LOCAL_GOVERNMENT",
            frequency="YEAR",
        )
        ds2 = Dataset.objects.create(
            dataset_key="TAX_MODERN",
            family=family,
            source_provider="KOSIS",
            source_org_id="101",
            source_table_id="TBL_NEW",
            source_table_name="Tax New",
            geography_level="BASIC_LOCAL_GOVERNMENT",
            frequency="YEAR",
        )
        v1 = DatasetVersion.objects.create(
            dataset=ds1, version=1, status="ACTIVE",
            metadata_checksum="1" * 64, metadata_snapshot={},
        )
        v2 = DatasetVersion.objects.create(
            dataset=ds2, version=1, status="ACTIVE",
            metadata_checksum="2" * 64, metadata_snapshot={},
        )
        unit = Unit.objects.create(unit_key="KRW", name="원", dimension="CURRENCY", symbol="원")
        indicator = Indicator.objects.create(
            indicator_key="ACQUISITION_TAX",
            name="취득세",
            description="",
            category="TAX",
            canonical_unit=unit,
            value_type="CURRENCY",
            aggregation_method="SUM",
            geography_requirement="MANDATORY",
            default_frequency="YEAR",
            source_type="OFFICIAL",
            status="ACTIVE",
        )
        metric = Metric.objects.create(metric_key="COLLECTED", name="수납액", description="")

        # Assignments: 2010 to 2016 (exclusive), and 2016 to None
        IndicatorSourceAssignment.objects.create(
            indicator=indicator,
            metric=metric,
            region_level="BASIC_LOCAL_GOVERNMENT",
            dataset_version=v1,
            valid_period=Range(date(2010, 1, 1), date(2016, 1, 1), "[)"),
            authority_status="AUTHORITATIVE",
            priority=1,
        )
        IndicatorSourceAssignment.objects.create(
            indicator=indicator,
            metric=metric,
            region_level="BASIC_LOCAL_GOVERNMENT",
            dataset_version=v2,
            valid_period=Range(date(2016, 1, 1), date(2025, 1, 1), "[)"),
            authority_status="AUTHORITATIVE",
            priority=1,
        )

        DatasetItemMapping.objects.create(
            dataset_version=v1, source_item_id="ITEM1", source_item_name="Item 1",
            indicator=indicator, metric=metric, source_unit_id="U1",
            valid_period=Range(date(2010, 1, 1), None, "[)"), comparability_status="COMPARABLE",
        )
        DatasetItemMapping.objects.create(
            dataset_version=v2, source_item_id="ITEM1", source_item_name="Item 1",
            indicator=indicator, metric=metric, source_unit_id="U1",
            valid_period=Range(date(2010, 1, 1), None, "[)"), comparability_status="COMPARABLE",
        )

        intent = IngestionIntent(
            indicator_key="ACQUISITION_TAX",
            metric_keys=("COLLECTED",),
            region_level="BASIC_LOCAL_GOVERNMENT",
            start_year=2010,
            end_year=2024,
        )
        planned = plan(intent)
        self.assertTrue(len(planned) >= 2)
        v1_slices = [p for p in planned if p.dataset_version_id == v1.id]
        v2_slices = [p for p in planned if p.dataset_version_id == v2.id]
        self.assertTrue(v1_slices)
        self.assertTrue(v2_slices)
        self.assertEqual(v1_slices[0].start_year, 2010)
        self.assertEqual(v1_slices[0].end_year, 2015)
        self.assertEqual(v2_slices[0].start_year, 2016)
        self.assertEqual(v2_slices[0].end_year, 2024)

    def test_fixed_region_appears_only_in_normalization_context(self):
        family = DatasetFamily.objects.create(family_key="FIXED_FAMILY", name="Fixed Family")
        ds = Dataset.objects.create(
            dataset_key="JONGNO_TAX",
            family=family,
            source_provider="KOSIS",
            source_org_id="101",
            source_table_id="TBL_JONGNO",
            source_table_name="Jongno Tax",
            geography_level="BASIC_LOCAL_GOVERNMENT",
            frequency="YEAR",
        )
        v = DatasetVersion.objects.create(
            dataset=ds, version=1, status="ACTIVE",
            metadata_checksum="3" * 64, metadata_snapshot={},
        )
        region = Region.objects.create(
            region_key="11010_JONGNO",
            region_level="BASIC_LOCAL_GOVERNMENT",
            region_kind="AUTONOMOUS_DISTRICT",
            valid_period=Range(date(2010, 1, 1), None, "[)"),
            status="ACTIVE",
        )
        # Fixed dimension for Region (no source_dimension)
        DatasetDimension.objects.create(
            dataset_version=v,
            source_dimension=None,
            semantic_dimension="REGION",
            required=True,
            selection_strategy="FIXED",
            default_value="11010_JONGNO",
            ordinal=1,
        )
        unit = Unit.objects.create(unit_key="KRW_2", name="원", dimension="CURRENCY", symbol="원")
        indicator = Indicator.objects.create(
            indicator_key="JONGNO_TAX_IND",
            name="종로세",
            description="",
            category="TAX",
            canonical_unit=unit,
            value_type="CURRENCY",
            aggregation_method="SUM",
            geography_requirement="MANDATORY",
            default_frequency="YEAR",
            source_type="OFFICIAL",
            status="ACTIVE",
        )
        metric = Metric.objects.create(metric_key="COLLECTED_2", name="수납액", description="")
        IndicatorSourceAssignment.objects.create(
            indicator=indicator,
            metric=metric,
            region_level="BASIC_LOCAL_GOVERNMENT",
            dataset_version=v,
            valid_period=Range(date(2020, 1, 1), date(2025, 1, 1), "[)"),
            authority_status="AUTHORITATIVE",
            priority=1,
        )
        DatasetItemMapping.objects.create(
            dataset_version=v, source_item_id="ITM_1", source_item_name="Item 1",
            indicator=indicator, metric=metric, source_unit_id="U1",
            valid_period=Range(date(2020, 1, 1), None, "[)"), comparability_status="COMPARABLE",
        )

        intent = IngestionIntent(
            indicator_key="JONGNO_TAX_IND",
            metric_keys=("COLLECTED_2",),
            region_level="BASIC_LOCAL_GOVERNMENT",
            start_year=2020,
            end_year=2024,
        )
        planned = plan(intent)
        self.assertTrue(planned)
        for p in planned:
            self.assertNotIn("11010_JONGNO", p.request_parameters.values())
            self.assertEqual(p.normalization_context.get("fixed_region_key"), "11010_JONGNO")
