from django.test import TestCase
from explorer.models import BoundarySet, Region
from explorer.tests.factories import make_published_series


class ApiTests(TestCase):
    def test_series_returns_values_and_lineage_without_kosis_request_fields(self):
        region, indicator = make_published_series()
        response = self.client.get(
            "/api/series",
            {
                "regionId": region.region_key,
                "indicatorId": indicator.indicator_key,
                "from": "2020",
                "to": "2024",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("values", payload)
        self.assertIn("source", payload)
        self.assertNotIn("objL1", response.content.decode())
        self.assertNotIn("apiKey", response.content.decode())

    def test_rankings_returns_ordered_features_and_boundary_version(self):
        region, indicator = make_published_series()
        response = self.client.get(
            "/api/rankings",
            {"indicatorId": indicator.indicator_key, "year": "2024"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("rankings", payload)
        self.assertIn("boundaryVersion", payload)

    def test_invalid_year_rejected(self):
        region, indicator = make_published_series()
        response = self.client.get(
            "/api/series",
            {
                "regionId": region.region_key,
                "indicatorId": indicator.indicator_key,
                "from": "1999",
                "to": "2024",
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_regions_and_indicators_endpoints(self):
        region, indicator = make_published_series()
        res_reg = self.client.get("/api/regions")
        self.assertEqual(res_reg.status_code, 200)
        regions = res_reg.json()["regions"]
        self.assertTrue(len(regions) >= 1)
        self.assertIn("provinceCode", regions[0])
        self.assertIn("fullName", regions[0])

        res_ind = self.client.get("/api/indicators")
        self.assertEqual(res_ind.status_code, 200)
        self.assertTrue(len(res_ind.json()["indicators"]) >= 1)

    def test_rankings_supports_province_filtering(self):
        region, indicator = make_published_series()
        response = self.client.get(
            "/api/rankings",
            {
                "indicatorId": indicator.indicator_key,
                "year": "2024",
                "province": "KR_11",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload.get("provinceCode"), "KR_11")
        self.assertIn("rankings", payload)

