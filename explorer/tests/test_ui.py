from django.test import TestCase


class UiTests(TestCase):
    def test_index_contains_labeled_filters_separate_charts_and_map(self):
        response = self.client.get("/")
        content = response.content.decode()
        self.assertContains(response, 'label for="region-select"')
        self.assertContains(response, 'select id="province-select"')
        self.assertContains(response, 'input type="text" id="region-search"')
        self.assertContains(response, 'input type="text" id="ranking-search"')
        self.assertContains(response, 'canvas id="tax-chart"')
        self.assertContains(response, 'canvas id="population-chart"')
        self.assertContains(response, 'div id="map"')
        self.assertContains(response, 'table id="ranking-table"')
        self.assertNotIn("KOSIS_API_KEY", content)
        self.assertNotIn("objL1", content)

