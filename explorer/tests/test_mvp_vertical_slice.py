from django.test import TestCase
from explorer.models import Observation, RawObservation
from explorer.tests.scenarios import load_synthetic_mvp


class MvpVerticalSliceTests(TestCase):
    def test_raw_to_series_ranking_and_per_capita_lineage(self):
        scenario = load_synthetic_mvp(years=range(2010, 2025))
        scenario.run_pipeline()

        # 1. Test series API for derived per-capita
        resp_series = self.client.get(
            "/api/series",
            {"regionId": "TEST_REGION_A", "indicatorId": "ACQUISITION_TAX_PER_CAPITA", "from": "2010", "to": "2024"},
        )
        self.assertEqual(resp_series.status_code, 200)
        series = resp_series.json()

        self.assertEqual(len(series["values"]), 15)
        self.assertTrue(series["source"]["derived"])
        self.assertEqual(len(series["source"]["inputs"]), 2)

        # 2. Test rankings API
        resp_rank = self.client.get(
            "/api/rankings",
            {"indicatorId": "ACQUISITION_TAX", "metric": "COLLECTED", "year": "2024"},
        )
        self.assertEqual(resp_rank.status_code, 200)
        ranking = resp_rank.json()

        self.assertEqual(ranking["boundaryVersion"], "2024")
        # In 2024, REG_B has DT=3400000, REG_A has DT=2400000 -> REG_B is rank 1, REG_A is rank 2
        self.assertEqual(ranking["values"][0]["featureKey"], "TEST_FEATURE_B")
        self.assertEqual(ranking["values"][0]["rank"], 1)
        self.assertEqual(ranking["values"][1]["featureKey"], "TEST_FEATURE_A")
        self.assertEqual(ranking["values"][1]["rank"], 2)

        # 3. Lineage validation: derived observation must link to both raw inputs via ObservationInput
        derived_obs = Observation.objects.filter(
            region__region_key="TEST_REGION_A",
            indicator__indicator_key="ACQUISITION_TAX_PER_CAPITA",
            period__period_start__year=2024,
            status="PUBLISHED",
        ).first()
        self.assertIsNotNone(derived_obs)
        self.assertIsNone(derived_obs.source_raw_observation)
        self.assertIsNone(derived_obs.source_dataset_version)
        self.assertIsNotNone(derived_obs.derived_indicator)

        inputs = list(derived_obs.inputs.all())
        self.assertEqual(len(inputs), 2)
        roles = {inp.input_role for inp in inputs}
        self.assertEqual(roles, {"TAX", "POPULATION"})

        # Verify underlying source observations have raw observation links
        for inp in inputs:
            self.assertIsNotNone(inp.input_observation.source_raw_observation)
            self.assertIsNotNone(inp.input_observation.source_dataset_version)

        # 4. Zero vs Missing: check all values are valid floats
        for v in series["values"]:
            self.assertEqual(v["status"], "PRESENT")
            self.assertIsInstance(v["value"], float)

        # 5. Security: verify no API keys or tokens are in the response
        series_str = resp_series.content.decode("utf-8")
        rank_str = resp_rank.content.decode("utf-8")
        self.assertNotIn("apiKey", series_str)
        self.assertNotIn("accessToken", series_str)
        self.assertNotIn("apiKey", rank_str)
        self.assertNotIn("accessToken", rank_str)
