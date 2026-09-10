from django.test import SimpleTestCase
from explorer.kosis.discovery import DiscoveryIntent, discover, metadata_checksum
from explorer.tests.fakes import FakeKosisClient


class DiscoveryTests(SimpleTestCase):
    def test_split_city_and_district_tax_tables_share_family_but_not_dataset(self):
        manifest = discover(
            DiscoveryIntent(
                indicator_key="ACQUISITION_TAX",
                metric_keys=("COLLECTED",),
                geography_level="BASIC_LOCAL_GOVERNMENT",
                start_year=2010,
                end_year=2024,
                search_terms=("취득세", "기초자치단체별 부과징수"),
            ),
            client=FakeKosisClient.from_fixture("kosis_metadata_split_tables.json"),
        )
        self.assertEqual(len(manifest.dataset_families), 1)
        self.assertEqual(len(manifest.candidates), 2)
        self.assertNotEqual(manifest.candidates[0].source_table_id, manifest.candidates[1].source_table_id)
        self.assertTrue(all(candidate.registry_status == "DRAFT" for candidate in manifest.candidates))

    def test_metadata_checksum_is_stable_regardless_of_key_order(self):
        obj_a = {"orgId": "101", "tblId": "DT_01", "items": [{"id": "1", "name": "val"}]}
        obj_b = {"items": [{"name": "val", "id": "1"}], "tblId": "DT_01", "orgId": "101"}
        self.assertEqual(metadata_checksum(obj_a), metadata_checksum(obj_b))
