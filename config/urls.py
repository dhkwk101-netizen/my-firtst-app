# config/urls.py
from django.contrib import admin
from django.urls import include, path
from explorer.views import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health", health, name="health"),
    path("", include("explorer.urls")),
]
