from django.urls import path
from explorer.api import (
    api_indicators,
    api_rankings,
    api_regions,
    api_series,
)

app_name = "explorer"

urlpatterns = [
    path("api/regions", api_regions, name="api_regions"),
    path("api/indicators", api_indicators, name="api_indicators"),
    path("api/series", api_series, name="api_series"),
    path("api/rankings", api_rankings, name="api_rankings"),
]
