from django.test import TestCase
from explorer.queries import query_race_data
from explorer.tests.factories import make_published_series


class RaceDataTests(TestCase):
    def test_query_race_data_returns_all_regions_summary_and_metadata(self):
        region, indicator = make_published_series()
        res = query_race_data(
            indicator_key=indicator.indicator_key,
            start_year=2020,
            end_year=2024,
            top_n=10,
        )
        self.assertIn("indicatorKey", res)
        self.assertIn("indicatorName", res)
        self.assertIn("indicatorDescription", res)
        self.assertIn("allRegionsSummary", res)
        self.assertIsInstance(res["allRegionsSummary"], list)
        if res["allRegionsSummary"]:
            first_item = res["allRegionsSummary"][0]
            self.assertIn("finalRank", first_item)
            self.assertIn("regionKey", first_item)
            self.assertIn("name", first_item)
            self.assertIn("fullName", first_item)
            self.assertIn("yearlyValues", first_item)
            self.assertIn("yearlyRawValues", first_item)
            self.assertIn("finalValue", first_item)
            self.assertIn("finalRawValue", first_item)
