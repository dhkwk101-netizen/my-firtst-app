from pathlib import Path
from unittest.mock import MagicMock
from django.test import SimpleTestCase
from explorer.kosis.client import KosisClient, sanitize_params
from explorer.kosis.parser import parse_kosis_response
from explorer.kosis.types import KosisApiError


FIXTURES = Path(__file__).parent / "fixtures"


class KosisContractTests(SimpleTestCase):
    def test_dt_zero_remains_raw_string(self):
        response = parse_kosis_response(
            "application/json", (FIXTURES / "kosis_success.json").read_bytes()
        )
        self.assertEqual(response.rows[0].dt, "0")

    def test_xml_error_is_detected_when_json_was_expected(self):
        with self.assertRaises(KosisApiError) as raised:
            parse_kosis_response(
                "application/xml", (FIXTURES / "kosis_error.xml").read_bytes()
            )
        self.assertEqual(raised.exception.code, "41")

    def test_json_error_object_is_not_parsed_as_a_data_row(self):
        with self.assertRaises(KosisApiError) as raised:
            parse_kosis_response(
                "application/json", (FIXTURES / "kosis_error.json").read_bytes()
            )
        self.assertEqual(raised.exception.code, "10")

    def test_sanitize_params_removes_api_key_case_insensitively(self):
        params = {"apiKey": "SECRET123", "APIKEY": "SECRET456", "orgId": "101", "tblId": "DT_101"}
        sanitized = sanitize_params(params)
        self.assertEqual(sanitized, {"orgId": "101", "tblId": "DT_101"})
        self.assertNotIn("apiKey", sanitized)
        self.assertNotIn("APIKEY", sanitized)

    def test_limiter_sleeps_remaining_interval(self):
        mock_sleep = MagicMock()
        timeline = [100.0, 100.1]  # 0.1s elapsed between calls, needs 0.25s sleep for 0.35s interval
        mock_clock = lambda: timeline.pop(0) if timeline else 100.35

        client = KosisClient(api_key="TEST_KEY", sleep_fn=mock_sleep, clock_fn=mock_clock)
        # Mock fetch_raw to return success fixture
        client._fetch_raw = MagicMock(
            return_value=("application/json", (FIXTURES / "kosis_success.json").read_bytes())
        )

        client.fetch({"orgId": "TEST_ORG", "tblId": "TEST_TABLE"})
        client.fetch({"orgId": "TEST_ORG", "tblId": "TEST_TABLE"})

        mock_sleep.assert_called_once()
        sleep_duration = mock_sleep.call_args[0][0]
        self.assertAlmostEqual(sleep_duration, 0.25, places=2)
