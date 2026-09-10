from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeOperators
from django.db import models
from django.db.models import Q, UniqueConstraint


class Region(models.Model):
    region_key = models.TextField(unique=True)
    region_level = models.TextField()
    region_kind = models.TextField()
    valid_period = DateRangeField()
    status = models.TextField(default="ACTIVE")

    class Meta:
        db_table = '"geo"."region"'
        indexes = [
            models.Index(fields=["region_key"]),
            models.Index(fields=["region_level", "status"]),
        ]

    def __str__(self):
        return self.region_key


class RegionIdentifier(models.Model):
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="identifiers")
    code_system = models.TextField()
    code = models.TextField()
    valid_period = DateRangeField()
    source = models.TextField()

    class Meta:
        db_table = '"geo"."region_identifier"'
        constraints = [
            ExclusionConstraint(
                name="region_identifier_no_overlap",
                expressions=[
                    ("code_system", RangeOperators.EQUAL),
                    ("code", RangeOperators.EQUAL),
                    ("valid_period", RangeOperators.OVERLAPS),
                ],
            )
        ]
        indexes = [
            models.Index(fields=["region", "code_system", "code"]),
            models.Index(fields=["code_system", "code"]),
        ]

    def __str__(self):
        return f"{self.code_system}:{self.code} ({self.region_id})"


class RegionName(models.Model):
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="names")
    name = models.TextField()
    name_type = models.TextField()
    valid_period = DateRangeField()
    is_official = models.BooleanField(default=True)

    class Meta:
        db_table = '"geo"."region_name"'
        indexes = [
            models.Index(fields=["region", "name_type"]),
            models.Index(fields=["name"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.region_id})"


class RegionRelation(models.Model):
    source_region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="target_relations")
    target_region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="source_relations")
    relation_type = models.TextField()
    valid_period = DateRangeField()
    reason = models.TextField()

    class Meta:
        db_table = '"geo"."region_relation"'
        indexes = [
            models.Index(fields=["source_region", "target_region"]),
        ]

    def __str__(self):
        return f"{self.source_region_id} -> {self.target_region_id} ({self.relation_type})"


class BoundarySet(models.Model):
    reference_year = models.IntegerField()
    reference_date = models.DateField(null=True, blank=True)
    source_name = models.TextField()
    source_uri = models.TextField()
    asset_uri = models.TextField()
    checksum = models.CharField(max_length=64)
    status = models.TextField(default="ACTIVE")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = '"geo"."boundary_set"'
        constraints = [
            UniqueConstraint(
                fields=["reference_year"],
                condition=Q(status="ACTIVE"),
                name="unique_active_boundary_set_per_year",
            )
        ]
        indexes = [
            models.Index(fields=["reference_year", "status"]),
        ]

    def __str__(self):
        return f"BoundarySet {self.reference_year} ({self.status})"


class BoundaryFeature(models.Model):
    boundary_set = models.ForeignKey(BoundarySet, on_delete=models.PROTECT, related_name="features")
    region = models.ForeignKey(Region, on_delete=models.PROTECT, related_name="boundary_features")
    feature_key = models.TextField()
    feature_checksum = models.CharField(max_length=64)

    class Meta:
        db_table = '"geo"."boundary_feature"'
        constraints = [
            UniqueConstraint(
                fields=["boundary_set", "feature_key"],
                name="unique_feature_key_per_boundary_set",
            )
        ]
        indexes = [
            models.Index(fields=["boundary_set", "region"]),
        ]

    def __str__(self):
        return f"{self.boundary_set_id}:{self.feature_key}"
