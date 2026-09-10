from datetime import date
from pathlib import Path
from django.test import TestCase
from psycopg.types.range import Range
from explorer.boundaries import BoundaryError, build_boundary_set
from explorer.models import Region, RegionIdentifier

FIXTURES = Path(__file__).parent / "fixtures"


class BoundaryTests(TestCase):
    def setUp(self):
        self.r1 = Region.objects.create(
            region_key="TEST_REG_A",
            region_level="BASIC_LOCAL_GOVERNMENT",
            region_kind="AUTONOMOUS_DISTRICT",
            valid_period=Range(date(2010, 1, 1), None, "[)"),
            status="ACTIVE",
        )
        RegionIdentifier.objects.create(
            region=self.r1,
            code_system="SGIS_ADM_CD",
            code="TEST_SGIS_A",
            valid_period=Range(date(2010, 1, 1), None, "[)"),
            source="TEST_FIXTURE",
        )

        self.r2 = Region.objects.create(
            region_key="TEST_REG_B",
            region_level="BASIC_LOCAL_GOVERNMENT",
            region_kind="AUTONOMOUS_DISTRICT",
            valid_period=Range(date(2010, 1, 1), None, "[)"),
            status="ACTIVE",
        )
        RegionIdentifier.objects.create(
            region=self.r2,
            code_system="SGIS_ADM_CD",
            code="TEST_SGIS_B",
            valid_period=Range(date(2010, 1, 1), None, "[)"),
            source="TEST_FIXTURE",
        )

    def test_build_maps_features_and_outputs_wgs84(self):
        raw_geojson = (FIXTURES / "sgis_boundary_2020.geojson").read_bytes()
        result = build_boundary_set(
            year=2020,
            raw_geojson=raw_geojson,
            source_crs="EPSG:5179",
            simplify_tolerance=0,
        )
        self.assertEqual(result.reference_year, 2020)
        self.assertEqual(result.feature_count, 2)
        self.assertEqual(result.output_crs, "EPSG:4326")

    def test_missing_source_crs_raises_error(self):
        raw_geojson = (FIXTURES / "sgis_boundary_2020.geojson").read_bytes()
        with self.assertRaises(BoundaryError):
            build_boundary_set(year=2020, raw_geojson=raw_geojson, source_crs="", simplify_tolerance=0)

    def test_year_mismatch_raises_error(self):
        raw_geojson = (FIXTURES / "sgis_boundary_2020.geojson").read_bytes()
        with self.assertRaises(BoundaryError):
            build_boundary_set(year=2021, raw_geojson=raw_geojson, source_crs="EPSG:5179", simplify_tolerance=0)
