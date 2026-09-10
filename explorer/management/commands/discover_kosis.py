import dataclasses
import json
import os
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from explorer.kosis.client import KosisClient
from explorer.kosis.discovery import DiscoveryIntent, discover


class Command(BaseCommand):
    help = "Discover KOSIS dataset candidates and emit candidate manifest"

    def add_arguments(self, parser):
        parser.add_argument("--indicator", required=True, help="Semantic indicator key")
        parser.add_argument("--metric", action="append", default=[], help="Metric keys")
        parser.add_argument("--geography-level", default="BASIC_LOCAL_GOVERNMENT")
        parser.add_argument("--from-year", type=int, required=True, help="Start year")
        parser.add_argument("--to-year", type=int, required=True, help="End year")
        parser.add_argument("--query", action="append", default=[], help="Search terms")
        parser.add_argument("--output", required=True, help="Output manifest path")

    def handle(self, *args, **options):
        api_key = os.environ.get("KOSIS_API_KEY")
        if not api_key:
            raise CommandError("KOSIS_API_KEY environment variable is required")

        queries = options["query"] or [options["indicator"]]
        metrics = tuple(options["metric"] or ["AMOUNT"])

        intent = DiscoveryIntent(
            indicator_key=options["indicator"],
            metric_keys=metrics,
            geography_level=options["geography_level"],
            start_year=options["from_year"],
            end_year=options["to_year"],
            search_terms=tuple(queries),
        )

        client = KosisClient(api_key=api_key)
        manifest = discover(intent, client)

        if not manifest.candidates:
            raise CommandError("No candidates found or metadata failed to establish evidence")

        output_path = Path(options["output"])
        output_path.parent.mkdir(parents=True, exist_ok=True)

        manifest_dict = dataclasses.asdict(manifest)
        temp_path = output_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(manifest_dict, indent=2, ensure_ascii=False), encoding="utf-8")
        temp_path.replace(output_path)

        self.stdout.write(
            self.style.SUCCESS(
                f"Discovered {len(manifest.candidates)} candidates across {len(manifest.dataset_families)} families -> {output_path}"
            )
        )
