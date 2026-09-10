from django.core.management.base import BaseCommand, CommandError
from explorer.models import IngestionJob
from explorer.pipeline.normalizer import normalize_job


class Command(BaseCommand):
    help = "Rebuild staged mart observations from immutable RAW without calling KOSIS"

    def add_arguments(self, parser):
        parser.add_argument("--job-id", type=int, required=True, help="IngestionJob ID")

    def handle(self, *args, **options):
        job_id = options["job_id"]
        try:
            job = IngestionJob.objects.get(id=job_id)
        except IngestionJob.DoesNotExist:
            raise CommandError(f"IngestionJob {job_id} does not exist")

        res = normalize_job(job.id)
        self.stdout.write(
            self.style.SUCCESS(
                f"Rebuilt job {job_id}: normalized={res.normalized_count}, failed={res.failed_count}"
            )
        )
