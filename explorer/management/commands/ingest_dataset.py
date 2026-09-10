import os
from django.core.management.base import BaseCommand, CommandError
from explorer.kosis.client import KosisClient
from explorer.kosis.planner import IngestionIntent, plan
from explorer.models import DatasetVersion, IngestionJob, IngestionSlice
from explorer.pipeline.collector import collect_job


class Command(BaseCommand):
    help = "Ingest KOSIS dataset version into immutable RAW"

    def add_arguments(self, parser):
        parser.add_argument("--version-id", type=int, required=True, help="DatasetVersion ID")
        parser.add_argument("--from-year", type=int, default=2010, help="Start year")
        parser.add_argument("--to-year", type=int, default=2024, help="End year")
        parser.add_argument(
            "--mode",
            choices=["FULL", "REFRESH", "REPAIR"],
            default="FULL",
            help="Ingestion mode",
        )

    def handle(self, *args, **options):
        version_id = options["version_id"]
        try:
            version = DatasetVersion.objects.get(id=version_id)
        except DatasetVersion.DoesNotExist:
            raise CommandError(f"DatasetVersion {version_id} does not exist")

        if version.status != "ACTIVE":
            raise CommandError(f"DatasetVersion {version_id} status is '{version.status}'; must be 'ACTIVE'")

        api_key = os.environ.get("KOSIS_API_KEY")
        if not api_key:
            raise CommandError("KOSIS_API_KEY environment variable is required")

        idempotency_key = f"INGEST_V{version_id}_{options['mode']}_{options['from_year']}_{options['to_year']}"
        job, created = IngestionJob.objects.get_or_create(
            idempotency_key=idempotency_key,
            defaults={
                "dataset_version": version,
                "job_type": options["mode"],
                "status": "PENDING",
            },
        )

        if created or job.status in ("PENDING", "FAILED"):
            # Plan slices if no slices exist yet
            if not IngestionSlice.objects.filter(ingestion_job=job).exists():
                intent = IngestionIntent(
                    indicator_key="ACQUISITION_TAX",  # or resolved from item mappings
                    metric_keys=("AMOUNT",),
                    region_level="BASIC_LOCAL_GOVERNMENT",
                    start_year=options["from_year"],
                    end_year=options["to_year"],
                )
                planned_slices = plan(intent)
                for p in planned_slices:
                    if p.dataset_version_id == version.id:
                        IngestionSlice.objects.get_or_create(
                            ingestion_job=job,
                            slice_key=p.slice_key,
                            defaults={
                                "request_parameters": p.request_parameters,
                                "status": "PENDING",
                            },
                        )

        client = KosisClient(api_key=api_key)
        res = collect_job(job.id, client)
        job.refresh_from_db()

        self.stdout.write(
            self.style.SUCCESS(
                f"Job {job.id} finished with status '{job.status}': "
                f"collected={res.raw_rows_collected}, success_slices={res.successful_slices}, "
                f"failed_slices={res.failed_slices}, split_slices={res.split_slices}, skipped={res.skipped_slices}"
            )
        )
