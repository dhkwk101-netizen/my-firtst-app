from django.urls import path
from explorer.api import (
    api_check_updates,
    api_indicators,
    api_race_data,
    api_rankings,
    api_regional_dashboard,
    api_regions,
    api_series,
    api_sync_updates,
)
from explorer.views import index

app_name = "explorer"

urlpatterns = [
    path("", index, name="index"),
    path("api/regions", api_regions, name="api_regions"),
    path("api/indicators", api_indicators, name="api_indicators"),
    path("api/series", api_series, name="api_series"),
    path("api/rankings", api_rankings, name="api_rankings"),
    path("api/race-data", api_race_data, name="api_race_data"),
    path("api/regional-dashboard", api_regional_dashboard, name="api_regional_dashboard"),
    path("api/regional_dashboard", api_regional_dashboard, name="api_regional_dashboard_alias"),
    path("api/check-updates", api_check_updates, name="api_check_updates"),
    path("api/sync-updates", api_sync_updates, name="api_sync_updates"),
]

