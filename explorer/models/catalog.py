from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeOperators
from django.db import models
from django.db.models import CheckConstraint, Q, UniqueConstraint
from explorer.models.geo import Region
from explorer.models.semantic import Indicator, Metric, TaxOwner, TaxType


class DatasetFamily(models.Model):
    family_key = models.TextField(unique=True)
    name = models.TextField()
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = '"catalog"."dataset_family"'

    def __str__(self):
        return self.name


class Dataset(models.Model):
    dataset_key = models.TextField(unique=True)
    family = models.ForeignKey(DatasetFamily, on_delete=models.PROTECT, related_name="datasets")
    source_provider = models.TextField()
    source_org_id = models.TextField()
    source_table_id = models.TextField()
    source_table_name = models.TextField()
    geography_level = models.TextField()
    frequency = models.TextField()

    class Meta:
        db_table = '"catalog"."dataset"'
        constraints = [
            UniqueConstraint(
                fields=["source_provider", "source_org_id", "source_table_id"],
                name="unique_dataset_source_identity",
            )
        ]

    def __str__(self):
        return f"{self.dataset_key} ({self.source_table_name})"


class DatasetVersion(models.Model):
    dataset = models.ForeignKey(Dataset, on_delete=models.PROTECT, related_name="versions")
    version = models.PositiveIntegerField()
    status = models.TextField(default="DRAFT")
    available_period = DateRangeField(null=True, blank=True)
    source_updated_at = models.DateTimeField(null=True, blank=True)
    metadata_checksum = models.CharField(max_length=64)
    metadata_snapshot = models.JSONField(default=dict)
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"catalog"."dataset_version"'
        constraints = [
            UniqueConstraint(
                fields=["dataset", "version"],
                name="unique_version_per_dataset",
            ),
            UniqueConstraint(
                fields=["dataset", "metadata_checksum"],
                name="unique_checksum_per_dataset",
            ),
            UniqueConstraint(
                fields=["dataset"],
                condition=Q(status="ACTIVE"),
                name="unique_active_version_per_dataset",
            ),
        ]

    def __str__(self):
        return f"{self.dataset.dataset_key} v{self.version} ({self.status})"


class DatasetDimension(models.Model):
    dataset_version = models.ForeignKey(DatasetVersion, on_delete=models.CASCADE, related_name="dimensions")
    source_dimension = models.TextField(null=True, blank=True)
    semantic_dimension = models.TextField()
    required = models.BooleanField(default=True)
    selection_strategy = models.TextField()
    default_value = models.TextField(null=True, blank=True)
    ordinal = models.IntegerField()

    class Meta:
        db_table = '"catalog"."dataset_dimension"'
        constraints = [
            CheckConstraint(
                condition=(
                    (Q(selection_strategy="FIXED") & ~Q(default_value__isnull=True))
                    | ~Q(selection_strategy="FIXED")
                ),
                name="fixed_dimension_requires_default_value",
            ),
            CheckConstraint(
                condition=(
                    (Q(selection_strategy="ALL_MAPPED") & ~Q(source_dimension__isnull=True))
                    | ~Q(selection_strategy="ALL_MAPPED")
                ),
                name="all_mapped_requires_source_dimension",
            ),
        ]

    def __str__(self):
        return f"{self.dataset_version_id}:{self.semantic_dimension}"


class DatasetItemMapping(models.Model):
    dataset_version = models.ForeignKey(DatasetVersion, on_delete=models.CASCADE, related_name="item_mappings")
    source_item_id = models.TextField()
    source_item_name = models.TextField()
    indicator = models.ForeignKey(Indicator, on_delete=models.PROTECT, related_name="item_mappings")
    metric = models.ForeignKey(Metric, on_delete=models.PROTECT, related_name="item_mappings")
    tax_owner = models.ForeignKey(TaxOwner, null=True, blank=True, on_delete=models.SET_NULL, related_name="item_mappings")
    source_unit_id = models.TextField()
    valid_period = DateRangeField()
    comparability_status = models.TextField(default="COMPARABLE")

    class Meta:
        db_table = '"catalog"."dataset_item_mapping"'
        constraints = [
            ExclusionConstraint(
                name="dataset_item_mapping_no_overlap",
                expressions=[
                    ("dataset_version", RangeOperators.EQUAL),
                    ("source_item_id", RangeOperators.EQUAL),
                    ("valid_period", RangeOperators.OVERLAPS),
                ],
            )
        ]

    def __str__(self):
        return f"{self.source_item_id} -> {self.indicator_id}"


class DatasetRegionMapping(models.Model):
    dataset_version = models.ForeignKey(DatasetVersion, on_delete=models.CASCADE, related_name="region_mappings")
    source_dimension = models.TextField()
    source_region_code = models.TextField()
    source_region_name = models.TextField()
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="dataset_mappings")
    valid_period = DateRangeField()
    mapping_method = models.TextField()
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = '"catalog"."dataset_region_mapping"'
        constraints = [
            ExclusionConstraint(
                name="dataset_region_mapping_no_overlap",
                expressions=[
                    ("dataset_version", RangeOperators.EQUAL),
                    ("source_dimension", RangeOperators.EQUAL),
                    ("source_region_code", RangeOperators.EQUAL),
                    ("valid_period", RangeOperators.OVERLAPS),
                ],
            )
        ]

    def __str__(self):
        return f"{self.source_region_code} -> {self.region_id}"


class TaxMappingRule(models.Model):
    dataset_version = models.ForeignKey(DatasetVersion, on_delete=models.CASCADE, related_name="tax_mapping_rules")
    source_tax_code = models.TextField()
    source_tax_name = models.TextField()
    tax_type = models.ForeignKey(TaxType, on_delete=models.PROTECT, related_name="mapping_rules")
    valid_period = DateRangeField()
    comparability_status = models.TextField(default="COMPARABLE")
    rule_reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = '"catalog"."tax_mapping_rule"'
        constraints = [
            ExclusionConstraint(
                name="tax_mapping_rule_no_overlap",
                expressions=[
                    ("dataset_version", RangeOperators.EQUAL),
                    ("source_tax_code", RangeOperators.EQUAL),
                    ("valid_period", RangeOperators.OVERLAPS),
                ],
            )
        ]

    def __str__(self):
        return f"{self.source_tax_code} -> {self.tax_type_id}"


class IndicatorSourceAssignment(models.Model):
    indicator = models.ForeignKey(Indicator, on_delete=models.PROTECT, related_name="source_assignments")
    metric = models.ForeignKey(Metric, on_delete=models.PROTECT, related_name="source_assignments")
    tax_owner = models.ForeignKey(TaxOwner, null=True, blank=True, on_delete=models.SET_NULL, related_name="source_assignments")
    region_level = models.TextField()
    dataset_version = models.ForeignKey(DatasetVersion, on_delete=models.PROTECT, related_name="indicator_assignments")
    valid_period = DateRangeField()
    authority_status = models.TextField(default="CANDIDATE")
    priority = models.IntegerField(default=100)
    reason = models.TextField(blank=True, default="")

    class Meta:
        db_table = '"catalog"."indicator_source_assignment"'

    def __str__(self):
        return f"{self.indicator_id}:{self.dataset_version_id} ({self.authority_status})"


class NormalizationRule(models.Model):
    rule_key = models.TextField(unique=True)
    version = models.PositiveIntegerField()
    rule_type = models.TextField()
    parameters = models.JSONField(default=dict)
    checksum = models.CharField(max_length=64)
    status = models.TextField(default="ACTIVE")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"catalog"."normalization_rule"'

    def __str__(self):
        return f"{self.rule_key} v{self.version}"
