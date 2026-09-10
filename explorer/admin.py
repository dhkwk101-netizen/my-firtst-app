from django.contrib import admin
from explorer.models.catalog import (
    Dataset,
    DatasetDimension,
    DatasetFamily,
    DatasetItemMapping,
    DatasetRegionMapping,
    DatasetVersion,
    IndicatorSourceAssignment,
    NormalizationRule,
    TaxMappingRule,
)


class ReadOnlyApprovedInlineMixin:
    def has_change_permission(self, request, obj=None):
        if obj and obj.status in ("ACTIVE", "NEEDS_REVIEW", "RETIRED"):
            return False
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if obj and obj.status in ("ACTIVE", "NEEDS_REVIEW", "RETIRED"):
            return False
        return super().has_delete_permission(request, obj)


class DatasetDimensionInline(ReadOnlyApprovedInlineMixin, admin.TabularInline):
    model = DatasetDimension
    extra = 0


class DatasetItemMappingInline(ReadOnlyApprovedInlineMixin, admin.TabularInline):
    model = DatasetItemMapping
    extra = 0


class DatasetRegionMappingInline(ReadOnlyApprovedInlineMixin, admin.TabularInline):
    model = DatasetRegionMapping
    extra = 0


class TaxMappingRuleInline(ReadOnlyApprovedInlineMixin, admin.TabularInline):
    model = TaxMappingRule
    extra = 0


@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    list_display = (
        "dataset_key",
        "family",
        "source_provider",
        "source_org_id",
        "source_table_id",
        "source_table_name",
        "geography_level",
        "frequency",
    )
    search_fields = ("dataset_key", "source_table_id", "source_table_name")


@admin.register(DatasetVersion)
class DatasetVersionAdmin(admin.ModelAdmin):
    list_display = (
        "dataset",
        "version",
        "status",
        "metadata_checksum",
        "available_period",
        "approved_at",
        "dimensions_count",
        "item_mappings_count",
        "region_mappings_count",
        "tax_mappings_count",
    )
    list_filter = ("status", "dataset")
    inlines = [
        DatasetDimensionInline,
        DatasetItemMappingInline,
        DatasetRegionMappingInline,
        TaxMappingRuleInline,
    ]

    def dimensions_count(self, obj):
        return obj.dimensions.count()

    def item_mappings_count(self, obj):
        return obj.item_mappings.count()

    def region_mappings_count(self, obj):
        return obj.region_mappings.count()

    def tax_mappings_count(self, obj):
        return obj.tax_mapping_rules.count()


admin.site.register(DatasetFamily)
admin.site.register(IndicatorSourceAssignment)
admin.site.register(NormalizationRule)
