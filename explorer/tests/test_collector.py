from django.test import TestCase
from explorer.kosis.types import KosisApiError
from explorer.models import IngestionSlice, RawObservation
from explorer.pipeline.collector import collect_job
from explorer.tests.factories import make_planned_job
from explorer.tests.fakes import FakeKosisClient


class CollectorTests(TestCase):
    def test_completed_slice_is_not_called_again(self):
        job = make_planned_job(slice_status="SUCCESS")
        client = FakeKosisClient.success([])
        result = collect_job(job.id, client)
        self.assertEqual(client.calls, [])
        self.assertEqual(result.skipped_slices, 1)

    def test_error_41_creates_child_slices(self):
        job = make_planned_job(slice_status="PENDING", job_key="TEST_SPLIT_JOB")
        client = FakeKosisClient()
        client.enqueue_response(KosisApiError(code="41", message="row limit", retryable=True))
        client.enqueue_response(FakeKosisClient.success([{"ORG_ID": "101", "TBL_ID": "T1", "DT": "1"}]).queue[0])
        client.enqueue_response(FakeKosisClient.success([{"ORG_ID": "101", "TBL_ID": "T1", "DT": "2"}]).queue[0])

        result = collect_job(job.id, client)
        self.assertEqual(result.split_slices, 1)
        self.assertTrue(IngestionSlice.objects.filter(ingestion_job=job, status="SPLIT").exists())
        self.assertEqual(IngestionSlice.objects.filter(ingestion_job=job, status="SUCCESS").count(), 2)

    def test_error_10_fails_job_without_retry(self):
        job = make_planned_job(slice_status="PENDING", job_key="TEST_FAIL_JOB")
        client = FakeKosisClient()
        client.enqueue_response(KosisApiError(code="10", message="missing key", retryable=False))

        result = collect_job(job.id, client)
        job.refresh_from_db()
        self.assertEqual(job.status, "FAILED")
        self.assertEqual(len(client.calls), 1)

    def test_error_50_retries_at_most_three_times(self):
        job = make_planned_job(slice_status="PENDING", job_key="TEST_RETRY_JOB")
        client = FakeKosisClient()
        for _ in range(4):
            client.enqueue_response(KosisApiError(code="50", message="server error", retryable=True))

        result = collect_job(job.id, client)
        slice_row = IngestionSlice.objects.get(ingestion_job=job)
        self.assertEqual(slice_row.attempts, 3)
        self.assertEqual(slice_row.status, "FAILED")

    def test_two_identical_source_rows_create_one_raw_observation(self):
        job = make_planned_job(slice_status="PENDING", job_key="TEST_DEDUP_JOB")
        row = {
            "ORG_ID": "TEST_ORG",
            "TBL_ID": "TEST_TBL",
            "ITM_ID": "ITEM1",
            "PRD_SE": "Y",
            "PRD_DE": "2024",
            "DT": "500",
        }
        client = FakeKosisClient.success([row, row])
        result = collect_job(job.id, client)
        self.assertEqual(RawObservation.objects.filter(ingestion_job=job).count(), 1)
