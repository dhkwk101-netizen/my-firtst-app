import sys
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from explorer.kosis.client import KosisClient
from explorer.models import DatasetVersion, IngestionJob, IngestionSlice
from explorer.pipeline.collector import collect_job
from explorer.pipeline.normalizer import normalize_job
from explorer.pipeline.publisher import publish_job


class Command(BaseCommand):
    help = "Orchestrate full refresh for approved MVP dataset versions (Acquisition Tax and Population)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dataset-version",
            action="append",
            type=int,
            dest="dataset_versions",
            help="DatasetVersion ID to sync (can be specified multiple times). Defaults to all ACTIVE versions.",
        )
        parser.add_argument(
            "--repair",
            action="store_true",
            help="Repair mode: retry failed slices and rebuild mart",
        )

    def handle(self, *args, **options):
        version_ids = options.get("dataset_versions")
        is_repair = options.get("repair", False)

        if version_ids:
            versions = list(DatasetVersion.objects.filter(id__in=version_ids))
            if len(versions) != len(version_ids):
                raise CommandError("One or more specified DatasetVersion IDs do not exist.")
        else:
            versions = list(DatasetVersion.objects.filter(status="ACTIVE").order_by("id"))

        if not versions:
            raise CommandError("No active DatasetVersions found to sync.")

        # Gate 1: Check activation status and prerequisites
        for v in versions:
            if v.status != "ACTIVE":
                raise CommandError(f"DatasetVersion {v.id} is not ACTIVE (status={v.status}). Cannot sync unapproved data.")
            if not v.item_mappings.exists():
                raise CommandError(f"DatasetVersion {v.id} has no approved item mappings.")
            if not v.region_mappings.exists():
                raise CommandError(f"DatasetVersion {v.id} has no approved region mappings.")

        self.stdout.write(self.style.SUCCESS(f"Verified {len(versions)} approved DatasetVersion(s) ready for sync."))

        client = KosisClient()

        for v in versions:
            ds = v.dataset
            self.stdout.write(f"--- Processing DatasetVersion {v.id}: {ds.source_table_name} ({ds.source_table_id}) ---")

            # Check or create IngestionJob
            job_key = f"SYNC_JOB_V{v.id}_{timezone.now().strftime('%Y%m%d_%H%M%S')}" if not is_repair else f"REPAIR_JOB_V{v.id}"
            job, _ = IngestionJob.objects.get_or_create(
                dataset_version=v,
                idempotency_key=job_key,
                defaults={
                    "job_type": "FULL_BACKFILL" if not is_repair else "REPAIR",
                    "status": "RUNNING",
                },
            )

            # Check if job has slices, if not, create slices from 2010 to 2024
            if not job.slices.exists():
                # Default 2010-2024 backfill slice
                job.slices.create(
                    slice_key=f"SLICE_{job_key}_2010_2024",
                    request_parameters={
                        "orgId": ds.source_org_id,
                        "tblId": ds.source_table_id,
                        "startPrdDe": "2010",
                        "endPrdDe": "2024",
                    },
                    status="PENDING",
                )

            # 1. Collect
            self.stdout.write("1. Collecting RAW data from KOSIS...")
            collect_result = collect_job(job.id, client)
            self.stdout.write(
                f"   Collected: total={collect_result.total_slices}, success={collect_result.successful_slices}, "
                f"failed={collect_result.failed_slices}, raw_rows={collect_result.raw_rows_collected}"
            )
            if collect_result.failed_slices > 0 and not is_repair:
                raise CommandError(f"Job {job.id} had {collect_result.failed_slices} failed slices during collection.")

            # 2. Normalize
            self.stdout.write("2. Normalizing RAW observations into Mart...")
            norm_result = normalize_job(job.id)
            self.stdout.write(
                f"   Normalized: {norm_result.normalized_count} observations staged, {norm_result.failed_count} failures."
            )
            if norm_result.failed_count > 0:
                self.stdout.write(self.style.WARNING(f"   Warning: {norm_result.failed_count} rows failed data quality checks."))

            # 3. Publish & Derive
            self.stdout.write("3. Publishing staged observations & computing derived metrics...")
            pub_result = publish_job(job.id)
            if not pub_result.success:
                raise CommandError(f"Publishing failed for Job {job.id}: {pub_result.error_message}")

            self.stdout.write(
                self.style.SUCCESS(
                    f"   Published: {pub_result.published_count} new, {pub_result.superseded_count} superseded, "
                    f"{pub_result.derived_count} derived metrics computed."
                )
            )

        self.stdout.write(self.style.SUCCESS("All approved datasets synced successfully!"))
