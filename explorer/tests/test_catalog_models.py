from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase
from explorer.models import Dataset, DatasetDimension, DatasetFamily, DatasetVersion


class CatalogModelTests(TestCase):
    def setUp(self):
        family = DatasetFamily.objects.create(family_key="TEST_FAMILY", name="Test family")
        self.dataset = Dataset.objects.create(
            dataset_key="TEST_DATASET",
            family=family,
            source_provider="KOSIS",
            source_org_id="TEST_ORG",
            source_table_id="TEST_TABLE",
            source_table_name="Synthetic test table",
            geography_level="BASIC_LOCAL_GOVERNMENT",
            frequency="YEAR",
        )

    def test_only_one_active_version_per_dataset(self):
        DatasetVersion.objects.create(
            dataset=self.dataset, version=1, status="ACTIVE",
            metadata_checksum="a" * 64, metadata_snapshot={"source": "fixture"},
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            DatasetVersion.objects.create(
                dataset=self.dataset, version=2, status="ACTIVE",
                metadata_checksum="b" * 64, metadata_snapshot={"source": "fixture"},
            )

    def test_active_version_mapping_cannot_be_changed(self):
        version = DatasetVersion.objects.create(
            dataset=self.dataset, version=1, status="ACTIVE",
            metadata_checksum="a" * 64, metadata_snapshot={"source": "fixture"},
        )
        mapping = DatasetDimension.objects.create(
            dataset_version=version, source_dimension="C1",
            semantic_dimension="REGION", required=True,
            selection_strategy="ALL_MAPPED", ordinal=1,
        )
        mapping.semantic_dimension = "TAX_TYPE"
        with self.assertRaises(DatabaseError), transaction.atomic():
            mapping.save(update_fields=["semantic_dimension"])
