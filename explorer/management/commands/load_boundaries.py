from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from explorer.boundaries import BoundaryError, build_boundary_set


class Command(BaseCommand):
    help = "Load SGIS yearly administrative boundaries"

    def add_arguments(self, parser):
        parser.add_argument("--year", type=int, required=True, help="Reference year (2010-2024)")
        parser.add_argument("--fixture", help="Path to local GeoJSON fixture")
        parser.add_argument("--source-crs", required=True, help="Explicit verified source CRS (e.g. EPSG:5179)")
        parser.add_argument("--simplify-tolerance", type=float, default=0, help="Simplification tolerance")

    def handle(self, *args, **options):
        year = options["year"]
        if year < 2010 or year > 2024:
            raise CommandError(f"Year {year} is out of target range 2010-2024")

        fixture_path = options.get("fixture")
        if fixture_path:
            raw_data = Path(fixture_path).read_bytes()
        else:
            raise CommandError("Please provide --fixture path for boundary ingestion")

        try:
            result = build_boundary_set(
                year=year,
                raw_geojson=raw_data,
                source_crs=options["source_crs"],
                simplify_tolerance=options["simplify_tolerance"],
            )
        except BoundaryError as exc:
            raise CommandError(str(exc)) from exc

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully built boundary set for year {result.reference_year} with {result.feature_count} features -> {result.asset_uri}"
            )
        )
