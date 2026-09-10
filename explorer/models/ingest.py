from django.db import models
from django.db.models import UniqueConstraint
from explorer.models.catalog import DatasetVersion


class IngestionJob(models.Model):
    dataset_version = models.ForeignKey(DatasetVersion, on_delete=models.PROTECT, related_name="ingestion_jobs")
    job_type = models.TextField()
    status = models.TextField(default="PENDING")
    idempotency_key = models.TextField(unique=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    request_count = models.IntegerField(default=0)
    raw_row_count = models.IntegerField(default=0)
    normalized_row_count = models.IntegerField(default=0)
    failed_row_count = models.IntegerField(default=0)
    source_updated_at = models.DateTimeField(null=True, blank=True)
    metadata_checksum = models.CharField(max_length=64, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"ingest"."ingestion_job"'

    def __str__(self):
        return f"{self.idempotency_key} ({self.status})"


class IngestionSlice(models.Model):
    ingestion_job = models.ForeignKey(IngestionJob, on_delete=models.CASCADE, related_name="slices")
    slice_key = models.TextField()
    request_parameters = models.JSONField(default=dict)
    status = models.TextField(default="PENDING")
    attempts = models.IntegerField(default=0)
    next_attempt_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    response_row_count = models.IntegerField(default=0)
    error_code = models.TextField(blank=True, default="")
    error_message = models.TextField(blank=True, default="")

    class Meta:
        db_table = '"ingest"."ingestion_slice"'
        constraints = [
            UniqueConstraint(
                fields=["ingestion_job", "slice_key"],
                name="unique_slice_per_job",
            )
        ]
        indexes = [
            models.Index(
                fields=["status", "next_attempt_at"],
                name="slice_retry_idx",
            )
        ]

    def __str__(self):
        return f"{self.ingestion_job_id}:{self.slice_key} ({self.status})"


class RawObservation(models.Model):
    ingestion_job = models.ForeignKey(IngestionJob, on_delete=models.PROTECT, related_name="raw_observations")
    ingestion_slice = models.ForeignKey(IngestionSlice, on_delete=models.PROTECT, related_name="raw_observations")
    dataset_version = models.ForeignKey(DatasetVersion, on_delete=models.PROTECT, related_name="raw_observations")
    org_id = models.TextField()
    tbl_id = models.TextField()
    c1 = models.TextField(blank=True, default="")
    c1_nm = models.TextField(blank=True, default="")
    c1_obj_nm = models.TextField(blank=True, default="")
    c2 = models.TextField(blank=True, default="")
    c2_nm = models.TextField(blank=True, default="")
    c2_obj_nm = models.TextField(blank=True, default="")
    c3 = models.TextField(blank=True, default="")
    c3_nm = models.TextField(blank=True, default="")
    c3_obj_nm = models.TextField(blank=True, default="")
    c4 = models.TextField(blank=True, default="")
    c4_nm = models.TextField(blank=True, default="")
    c4_obj_nm = models.TextField(blank=True, default="")
    c5 = models.TextField(blank=True, default="")
    c5_nm = models.TextField(blank=True, default="")
    c5_obj_nm = models.TextField(blank=True, default="")
    c6 = models.TextField(blank=True, default="")
    c6_nm = models.TextField(blank=True, default="")
    c6_obj_nm = models.TextField(blank=True, default="")
    c7 = models.TextField(blank=True, default="")
    c7_nm = models.TextField(blank=True, default="")
    c7_obj_nm = models.TextField(blank=True, default="")
    c8 = models.TextField(blank=True, default="")
    c8_nm = models.TextField(blank=True, default="")
    c8_obj_nm = models.TextField(blank=True, default="")
    itm_id = models.TextField()
    itm_nm = models.TextField(blank=True, default="")
    unit_id = models.TextField(blank=True, default="")
    unit_nm = models.TextField(blank=True, default="")
    prd_se = models.TextField()
    prd_de = models.TextField()
    dt = models.TextField()
    symbol = models.TextField(blank=True, default="")
    source_updated_at = models.DateTimeField(null=True, blank=True)
    raw_payload = models.JSONField(default=dict)
    source_row_hash = models.CharField(max_length=64)
    quality_status = models.TextField(default="UNVALIDATED")
    collected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"ingest"."raw_observation"'
        constraints = [
            UniqueConstraint(
                fields=["ingestion_job", "source_row_hash"],
                name="unique_source_row_per_job",
            )
        ]

    def __str__(self):
        return f"Raw {self.org_id}/{self.tbl_id} {self.prd_de}:{self.dt}"
