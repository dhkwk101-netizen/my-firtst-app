from django.db import models
from django.db.models import CheckConstraint, F, Q, UniqueConstraint
from explorer.models.catalog import DatasetVersion, NormalizationRule
from explorer.models.geo import Region
from explorer.models.ingest import IngestionJob, RawObservation
from explorer.models.semantic import (
    DerivedIndicator,
    Indicator,
    Metric,
    Period,
    TaxOwner,
    Unit,
)


class Observation(models.Model):
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="observations")
    period = models.ForeignKey(Period, on_delete=models.PROTECT, related_name="observations")
    indicator = models.ForeignKey(Indicator, on_delete=models.PROTECT, related_name="observations")
    metric = models.ForeignKey(Metric, on_delete=models.PROTECT, related_name="observations")
    tax_owner = models.ForeignKey(
        TaxOwner, null=True, blank=True, on_delete=models.PROTECT, related_name="observations"
    )
    numeric_value = models.DecimalField(max_digits=38, decimal_places=10, null=True, blank=True)
    canonical_unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="mart_observations")
    raw_value = models.TextField(blank=True, default="")
    status = models.TextField(default="PUBLISHED")
    symbol = models.TextField(blank=True, default="")
    quality_status = models.TextField(default="PASSED")
    source_raw_observation = models.ForeignKey(
        RawObservation, null=True, blank=True, on_delete=models.PROTECT, related_name="mart_observations"
    )
    source_dataset_version = models.ForeignKey(
        DatasetVersion, null=True, blank=True, on_delete=models.PROTECT, related_name="mart_observations"
    )
    derived_indicator = models.ForeignKey(
        DerivedIndicator, null=True, blank=True, on_delete=models.PROTECT, related_name="mart_observations"
    )
    normalization_rule = models.ForeignKey(
        NormalizationRule, null=True, blank=True, on_delete=models.PROTECT, related_name="mart_observations"
    )
    ingestion_job = models.ForeignKey(
        IngestionJob, null=True, blank=True, on_delete=models.PROTECT, related_name="mart_observations"
    )
    published_at = models.DateTimeField(auto_now_add=True)
    superseded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"mart"."observation"'
        constraints = [
            CheckConstraint(
                condition=(
                    (
                        Q(source_raw_observation__isnull=False)
                        & Q(source_dataset_version__isnull=False)
                        & Q(derived_indicator__isnull=True)
                    )
                    | (
                        Q(source_raw_observation__isnull=True)
                        & Q(source_dataset_version__isnull=True)
                        & Q(derived_indicator__isnull=False)
                    )
                ),
                name="observation_exactly_one_lineage",
            ),
            UniqueConstraint(
                fields=[
                    "region",
                    "period",
                    "indicator",
                    "metric",
                    "tax_owner",
                    "source_dataset_version",
                ],
                condition=Q(status="PUBLISHED", superseded_at__isnull=True),
                name="unique_active_source_observation",
            ),
            UniqueConstraint(
                fields=[
                    "region",
                    "period",
                    "indicator",
                    "metric",
                    "tax_owner",
                    "derived_indicator",
                ],
                condition=Q(status="PUBLISHED", superseded_at__isnull=True),
                name="unique_active_derived_observation",
            ),
        ]
        indexes = [
            models.Index(
                fields=["region", "indicator", "metric", "period"],
                condition=Q(status="PUBLISHED", superseded_at__isnull=True),
                name="obs_series_read_idx",
            ),
            models.Index(
                fields=["indicator", "metric", "period", "region"],
                condition=Q(status="PUBLISHED", superseded_at__isnull=True),
                name="obs_map_rank_read_idx",
            ),
        ]

    def __str__(self):
        return f"Obs {self.region_id}/{self.indicator_id}:{self.period_id} = {self.numeric_value}"


class ObservationInput(models.Model):
    derived_observation = models.ForeignKey(
        Observation, on_delete=models.CASCADE, related_name="inputs"
    )
    input_observation = models.ForeignKey(
        Observation, on_delete=models.PROTECT, related_name="used_as_inputs"
    )
    input_role = models.TextField()

    class Meta:
        db_table = '"mart"."observation_input"'
        constraints = [
            UniqueConstraint(
                fields=["derived_observation", "input_role"],
                name="unique_input_role_per_derived_observation",
            ),
            CheckConstraint(
                condition=~Q(derived_observation=F("input_observation")),
                name="observation_input_no_self_link",
            ),
        ]

    def __str__(self):
        return f"{self.derived_observation_id} <- {self.input_role} ({self.input_observation_id})"
