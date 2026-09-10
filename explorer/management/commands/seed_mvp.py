from django.core.management.base import BaseCommand
from explorer.tests.scenarios import load_synthetic_mvp


class Command(BaseCommand):
    help = "Seed development database with 2010-2024 synthetic MVP test scenario data (regions, indicators, boundaries, mart series)"

    def handle(self, *args, **options):
        self.stdout.write("Loading synthetic MVP scenario...")
        scenario = load_synthetic_mvp(years=range(2010, 2025))
        self.stdout.write("Executing ingestion, normalization, and publication pipeline...")
        scenario.run_pipeline()
        self.stdout.write(self.style.SUCCESS("Successfully seeded development database with 2010-2024 MVP data!"))
