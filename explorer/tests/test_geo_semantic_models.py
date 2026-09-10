from datetime import date
from django.db import IntegrityError, transaction
from django.test import TestCase
from psycopg.types.range import Range
from explorer.models import BoundarySet, Region, RegionIdentifier


class GeoSemanticModelTests(TestCase):
    def test_region_identifier_periods_cannot_overlap(self):
        region = Region.objects.create(
            region_key="TEST_REGION_A",
            region_level="BASIC_LOCAL_GOVERNMENT",
            region_kind="AUTONOMOUS_DISTRICT",
            valid_period=Range(date(2010, 1, 1), None, "[)"),
            status="ACTIVE",
        )
        RegionIdentifier.objects.create(
            region=region,
            code_system="TEST_CODES",
            code="A01",
            valid_period=Range(date(2010, 1, 1), date(2020, 1, 1), "[)"),
            source="TEST_FIXTURE",
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            RegionIdentifier.objects.create(
                region=region,
                code_system="TEST_CODES",
                code="A01",
                valid_period=Range(date(2019, 1, 1), None, "[)"),
                source="TEST_FIXTURE",
            )

    def test_only_one_active_boundary_set_exists_per_year(self):
        values = dict(
            reference_year=2020,
            source_name="TEST_SGIS",
            source_uri="https://example.invalid/2020",
            asset_uri="/geo/boundaries/2020.geojson",
            checksum="a" * 64,
            status="ACTIVE",
        )
        BoundarySet.objects.create(**values)
        values["checksum"] = "b" * 64
        with self.assertRaises(IntegrityError), transaction.atomic():
            BoundarySet.objects.create(**values)
