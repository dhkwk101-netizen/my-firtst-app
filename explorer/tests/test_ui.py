from django.test import TestCase


class UiTests(TestCase):
    def test_index_contains_labeled_filters_separate_charts_and_map(self):
        response = self.client.get("/")
        content = response.content.decode()
        self.assertContains(response, 'id="region-select"')
        self.assertContains(response, 'id="province-select"')
        self.assertContains(response, 'id="region-search"')
        self.assertContains(response, 'id="ranking-search"')
        self.assertContains(response, 'id="map"')
        self.assertContains(response, 'id="ranking-table"')
        self.assertNotIn("KOSIS_API_KEY", content)
        self.assertNotIn("objL1", content)

    def test_index_contains_compare_mode_elements(self):
        response = self.client.get("/")
        self.assertContains(response, 'id="tab-macro"')
        self.assertContains(response, 'id="tab-compare"')
        self.assertContains(response, 'id="view-compare"')
        self.assertContains(response, 'id="compare-select-a"')
        self.assertContains(response, 'id="compare-select-b"')
        self.assertContains(response, 'id="btn-compare-swap"')
        self.assertContains(response, 'id="compare-radar-chart"')
        self.assertContains(response, 'id="compare-timeseries-chart"')
        self.assertContains(response, 'id="compare-table"')
        self.assertContains(response, 'compare_manager.js')
