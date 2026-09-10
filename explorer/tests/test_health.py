# explorer/tests/test_health.py
from django.test import TestCase


class HealthTests(TestCase):
    def test_health_returns_ok_without_source_credentials(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
