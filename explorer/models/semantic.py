from django.contrib.postgres.fields import DateRangeField
from django.db import models
from django.db.models import Q, UniqueConstraint
from explorer.models.geo import BoundarySet


class Period(models.Model):
    period_key = models.TextField(unique=True)
    period_type = models.TextField()
    period_start = models.DateField()
    period_end = models.DateField()
    reference_date = models.DateField(null=True, blank=True)
    boundary_set = models.ForeignKey(BoundarySet, null=True, blank=True, on_delete=models.SET_NULL, related_name="periods")

    class Meta:
        db_table = '"semantic"."period"'
        indexes = [
            models.Index(fields=["period_key"]),
            models.Index(fields=["period_type", "period_start"]),
        ]

    def __str__(self):
        return self.period_key


class Unit(models.Model):
    unit_key = models.TextField(unique=True)
    name = models.TextField()
    dimension = models.TextField()
    symbol = models.TextField()

    class Meta:
        db_table = '"semantic"."unit"'

    def __str__(self):
        return f"{self.name} ({self.symbol})"


class Metric(models.Model):
    metric_key = models.TextField(unique=True)
    name = models.TextField()
    description = models.TextField()

    class Meta:
        db_table = '"semantic"."metric"'

    def __str__(self):
        return self.name


class TaxOwner(models.Model):
    tax_owner_key = models.TextField(unique=True)
    name = models.TextField()

    class Meta:
        db_table = '"semantic"."tax_owner"'

    def __str__(self):
        return self.name


class Indicator(models.Model):
    indicator_key = models.TextField(unique=True)
    name = models.TextField()
    description = models.TextField()
    category = models.TextField()
    canonical_unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="indicators")
    value_type = models.TextField()
    aggregation_method = models.TextField()
    geography_requirement = models.TextField()
    default_frequency = models.TextField()
    source_type = models.TextField()
    status = models.TextField(default="ACTIVE")

    class Meta:
        db_table = '"semantic"."indicator"'
        indexes = [
            models.Index(fields=["indicator_key"]),
            models.Index(fields=["category", "status"]),
        ]

    def __str__(self):
        return self.name


class DerivedIndicator(models.Model):
    indicator = models.ForeignKey(Indicator, on_delete=models.PROTECT, related_name="derivations")
    version = models.IntegerField()
    evaluator_key = models.TextField()
    parameters = models.JSONField(default=dict)
    output_unit = models.ForeignKey(Unit, on_delete=models.PROTECT, related_name="derived_outputs")
    status = models.TextField(default="ACTIVE")
    checksum = models.CharField(max_length=64)

    class Meta:
        db_table = '"semantic"."derived_indicator"'
        constraints = [
            UniqueConstraint(
                fields=["indicator"],
                condition=Q(status="ACTIVE"),
                name="unique_active_derived_indicator_per_indicator",
            ),
            UniqueConstraint(
                fields=["indicator", "version"],
                name="unique_derived_indicator_version",
            ),
        ]

    def __str__(self):
        return f"{self.indicator.indicator_key} v{self.version}"


class DerivedIndicatorInput(models.Model):
    derived_indicator = models.ForeignKey(DerivedIndicator, on_delete=models.CASCADE, related_name="inputs")
    role = models.TextField()
    input_indicator = models.ForeignKey(Indicator, on_delete=models.PROTECT, related_name="used_in_derivations")
    input_metric = models.ForeignKey(Metric, on_delete=models.PROTECT, related_name="derived_inputs")
    required_tax_owner = models.ForeignKey(TaxOwner, null=True, blank=True, on_delete=models.SET_NULL, related_name="derived_inputs")

    class Meta:
        db_table = '"semantic"."derived_indicator_input"'
        constraints = [
            UniqueConstraint(
                fields=["derived_indicator", "role"],
                name="unique_role_per_derived_indicator",
            )
        ]

    def __str__(self):
        return f"{self.derived_indicator_id}:{self.role}"


class TaxType(models.Model):
    tax_type_key = models.TextField(unique=True)
    name = models.TextField()
    description = models.TextField()
    indicator = models.ForeignKey(Indicator, on_delete=models.PROTECT, related_name="tax_types")
    valid_period = DateRangeField()

    class Meta:
        db_table = '"semantic"."tax_type"'

    def __str__(self):
        return self.name
