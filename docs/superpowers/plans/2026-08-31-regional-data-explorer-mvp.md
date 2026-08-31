# Regional Data Explorer MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a source-traceable 2010–2024 acquisition-tax, resident-population, per-capita, ranking, and historical-boundary explorer for Korea's basic local governments.

**Architecture:** Use one Django modular monolith and PostgreSQL database. A web process serves semantic JSON and server-rendered pages; management commands run metadata discovery, collection, normalization, derivation, and SGIS boundary acquisition from the same codebase. Browsers read only the local mart and static yearly GeoJSON.

**Tech Stack:** Python 3.13, Django 5.2 LTS, PostgreSQL 16+, psycopg 3.2, Shapely 2.1, pyproj 3.7, Django's test runner, vanilla JavaScript, Chart.js 4.5.1, Leaflet 1.9.4.

**Spec:** `docs/superpowers/specs/2026-08-31-regional-data-explorer-design.md`

## Global Constraints

- The attached `KOSIS 공유서비스 개발가이드.pdf` controls KOSIS request, response, limit, and error behavior.
- Never invent or hardcode real `orgId`, `tblId`, `itmId`, classification-member, source-region, or source-unit values.
- Only a human-approved DatasetVersion with complete metadata and mappings can become `ACTIVE`.
- Frontend and semantic query code must not import KOSIS adapter types or accept KOSIS parameters.
- Keep RAW insert-only and preserve `DT`, symbols, source units, C1–C8 fields, payload, checksum, and collection time.
- Region joins use period-bound identifiers, never names.
- Historical values remain on historical Regions and the BoundarySet for the same reference year.
- Zero and missing values remain distinct.
- City/province-owned and basic-local-government-owned tax observations remain separate; no automatic sum.
- One source request contains at most 40,000 estimated cells and starts at least 350 ms after the previous request.
- `KOSIS_API_KEY` and SGIS credentials never enter client responses, persisted request parameters, hashes, fixtures, or logs.
- Use PostgreSQL for tests; SQLite cannot verify range and exclusion constraints.
- No React, Django REST Framework, Celery, Redis, PostGIS, message broker, or custom admin UI.
- Each task uses a failing test first and ends with a focused commit.

---

## File Map

```text
pyproject.toml                         Python package and pinned dependency ranges
.gitignore                             Runtime, secret, cache, and generated-asset exclusions
manage.py                              Django command entry point
config/settings.py                     PostgreSQL and server settings
config/urls.py                         Root URL routing
config/asgi.py                         ASGI entry point
config/wsgi.py                         WSGI entry point

explorer/apps.py                       Django app registration
explorer/views.py                      HTML page and health view
explorer/api.py                        Semantic JSON endpoints only
explorer/urls.py                       Explorer routes
explorer/admin.py                      Initial Registry review interface

explorer/models/geo.py                 Region identity/history/boundary models
explorer/models/semantic.py            Period/unit/metric/indicator/tax/derivation models
explorer/models/catalog.py             Dataset Registry models
explorer/models/ingest.py              Jobs, Slices, and immutable RAW
explorer/models/mart.py                Published and derived observations
explorer/models/__init__.py            Django model exports

explorer/kosis/types.py                Typed source rows, metadata, requests, and errors
explorer/kosis/parser.py               JSON data and XML error parser
explorer/kosis/client.py               Sanitized HTTP client and rate limiter
explorer/kosis/discovery.py            Candidate metadata analysis and manifest creation
explorer/kosis/planner.py              Registry-to-request Slice planner

explorer/pipeline/collector.py          Slice execution and RAW persistence
explorer/pipeline/normalizer.py         RAW-to-staged Observation conversion and DQ
explorer/pipeline/publisher.py          Transactional publish and supersession
explorer/pipeline/derived.py            Versioned per-capita and growth calculations
explorer/boundaries.py                  SGIS acquisition, validation, mapping, and web assets
explorer/queries.py                     Mart series/ranking/lineage queries

explorer/management/commands/discover_kosis.py
explorer/management/commands/ingest_dataset.py
explorer/management/commands/rebuild_mart.py
explorer/management/commands/load_boundaries.py
explorer/management/commands/sync_mvp.py

explorer/templates/explorer/index.html  Trend and map page
explorer/static/explorer/app.js         Filters, charts, map, ranking, and source panel
explorer/static/explorer/styles.css     Responsive accessible layout
explorer/static/geo/boundaries/         Generated yearly web GeoJSON

explorer/tests/fixtures/                Sanitized KOSIS and SGIS contract fixtures
explorer/tests/fakes.py                 Deterministic source clients used across tests
explorer/tests/factories.py             Deterministic database object builders
explorer/tests/scenarios.py             Full synthetic 2010–2024 scenario
explorer/tests/test_*.py                Unit, contract, integration, DQ, API, and UI tests
README.md                               Setup, discovery gate, operations, and verification
```

Generated source payloads live under ignored `var/`; approved metadata lives in PostgreSQL, not Python constants.

---

## Milestone A — Foundation and database

### Task 1: Bootstrap the Django/PostgreSQL application

**Files:**
- Create: `pyproject.toml`
- Create: `.gitignore`
- Create: `manage.py`
- Create: `config/__init__.py`
- Create: `config/settings.py`
- Create: `config/urls.py`
- Create: `config/asgi.py`
- Create: `config/wsgi.py`
- Create: `explorer/__init__.py`
- Create: `explorer/apps.py`
- Create: `explorer/views.py`
- Create: `explorer/urls.py`
- Create: `explorer/tests/__init__.py`
- Create: `explorer/tests/test_health.py`

**Interfaces:**
- Consumes: `DJANGO_SECRET_KEY` plus PostgreSQL connection variables `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD`.
- Produces: Django project `config`, app `explorer`, `GET /health`, and `python manage.py test`.

- [ ] **Step 1: Create the package declaration and failing health test**

```toml
[build-system]
requires = ["setuptools>=75"]
build-backend = "setuptools.build_meta"

[project]
name = "regional-data-explorer"
version = "0.1.0"
requires-python = ">=3.13,<3.15"
dependencies = [
  "Django>=5.2,<5.3",
  "psycopg[binary]>=3.2,<3.3",
  "pyproj>=3.7,<3.8",
  "shapely>=2.1,<2.2",
]

[tool.setuptools.packages.find]
include = ["config*", "explorer*"]
```

```python
# explorer/tests/test_health.py
from django.test import TestCase


class HealthTests(TestCase):
    def test_health_returns_ok_without_source_credentials(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
```

- [ ] **Step 2: Run the test and confirm the project is absent**

Run: `py -m pip install -e .`
Expected: dependencies install successfully.

Run: `py manage.py test explorer.tests.test_health -v 2`
Expected: FAIL because `manage.py` or the Django settings module does not exist.

- [ ] **Step 3: Add the minimal project, PostgreSQL settings, and health route**

```python
# explorer/views.py
from django.http import JsonResponse


def health(request):
    return JsonResponse({"status": "ok"})
```

```python
# config/settings.py — database portion
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = [value for value in os.environ.get("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if value]
ROOT_URLCONF = "config.urls"
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "explorer",
]
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ["PGDATABASE"],
        "USER": os.environ["PGUSER"],
        "PASSWORD": os.environ.get("PGPASSWORD", ""),
        "HOST": os.environ.get("PGHOST", "localhost"),
        "PORT": os.environ.get("PGPORT", "5432"),
    }
}
STATIC_URL = "/static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
```

Retain Django 5.2's generated `MIDDLEWARE`, `TEMPLATES`, password validators, locale, and timezone settings around this database portion; do not hand-roll replacements.

```python
# config/urls.py
from django.contrib import admin
from django.urls import include, path
from explorer.views import health

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health", health, name="health"),
    path("", include("explorer.urls")),
]
```

Create `.gitignore` with `.venv/`, `__pycache__/`, `*.py[cod]`, `.env`, `var/`, generated yearly boundary files, and test/build caches. Do not ignore migrations or sanitized test fixtures.

- [ ] **Step 4: Run the bootstrap checks**

Run: `py manage.py check`
Expected: Django check reports no issues.

Run: `py manage.py test explorer.tests.test_health -v 2`
Expected: the health test passes.

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml .gitignore manage.py config explorer
git commit -m "chore: bootstrap django postgres application"
```

### Task 2: Add historical Region and semantic models

**Files:**
- Create: `explorer/models/__init__.py`
- Create: `explorer/models/geo.py`
- Create: `explorer/models/semantic.py`
- Create: `explorer/migrations/__init__.py`
- Create: `explorer/migrations/0001_schemas.py`
- Create: `explorer/migrations/0002_geo_semantic.py`
- Create: `explorer/tests/test_geo_semantic_models.py`

**Interfaces:**
- Consumes: Django/PostgreSQL foundation from Task 1.
- Produces: `Region`, `RegionIdentifier`, `RegionName`, `RegionRelation`, `BoundarySet`, `BoundaryFeature`, `Period`, `Unit`, `Metric`, `TaxOwner`, `Indicator`, `DerivedIndicator`, `DerivedIndicatorInput`, and `TaxType` model classes.

Exact field contract:

| Model | Required fields beyond `id` |
|---|---|
| Region | `region_key`, `region_level`, `region_kind`, `valid_period`, `status` |
| RegionIdentifier | `region`, `code_system`, `code`, `valid_period`, `source` |
| RegionName | `region`, `name`, `name_type`, `valid_period`, `is_official` |
| RegionRelation | `source_region`, `target_region`, `relation_type`, `valid_period`, `reason` |
| BoundarySet | `reference_year`, nullable `reference_date`, `source_name`, `source_uri`, `asset_uri`, `checksum`, `status`, `created_at` |
| BoundaryFeature | `boundary_set`, `region`, `feature_key`, `feature_checksum` |
| Period | `period_key`, `period_type`, `period_start`, `period_end`, nullable `reference_date`, nullable `boundary_set` |
| Unit | `unit_key`, `name`, `dimension`, `symbol` |
| Metric | `metric_key`, `name`, `description` |
| TaxOwner | `tax_owner_key`, `name` |
| Indicator | `indicator_key`, `name`, `description`, `category`, `canonical_unit`, `value_type`, `aggregation_method`, `geography_requirement`, `default_frequency`, `source_type`, `status` |
| DerivedIndicator | `indicator`, `version`, `evaluator_key`, `parameters`, `output_unit`, `status`, `checksum` |
| DerivedIndicatorInput | `derived_indicator`, `role`, `input_indicator`, `input_metric`, nullable `required_tax_owner` |
| TaxType | `tax_type_key`, `name`, `description`, `indicator`, `valid_period` |

- [ ] **Step 1: Write failing range and boundary-version tests**

```python
from datetime import date
from django.db import IntegrityError, transaction
from django.test import TestCase
from psycopg.types.range import Range
from explorer.models import BoundarySet, Region, RegionIdentifier


class GeoSemanticModelTests(TestCase):
    def test_region_identifier_periods_cannot_overlap(self):
        region = Region.objects.create(
            region_key="TEST_REGION_A",
            region_level="BASIC_LOCAL_GOVERNMENT",
            region_kind="AUTONOMOUS_DISTRICT",
            valid_period=Range(date(2010, 1, 1), None, "[)"),
            status="ACTIVE",
        )
        RegionIdentifier.objects.create(
            region=region,
            code_system="TEST_CODES",
            code="A01",
            valid_period=Range(date(2010, 1, 1), date(2020, 1, 1), "[)"),
            source="TEST_FIXTURE",
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            RegionIdentifier.objects.create(
                region=region,
                code_system="TEST_CODES",
                code="A01",
                valid_period=Range(date(2019, 1, 1), None, "[)"),
                source="TEST_FIXTURE",
            )

    def test_only_one_active_boundary_set_exists_per_year(self):
        values = dict(
            reference_year=2020,
            source_name="TEST_SGIS",
            source_uri="https://example.invalid/2020",
            asset_uri="/geo/boundaries/2020.geojson",
            checksum="a" * 64,
            status="ACTIVE",
        )
        BoundarySet.objects.create(**values)
        values["checksum"] = "b" * 64
        with self.assertRaises(IntegrityError), transaction.atomic():
            BoundarySet.objects.create(**values)
```

- [ ] **Step 2: Verify the missing-model failure**

Run: `py manage.py test explorer.tests.test_geo_semantic_models -v 2`
Expected: FAIL because the model classes and migrations do not exist.

- [ ] **Step 3: Create schemas, extension, models, and constraints**

`0001_schemas.py` must create `geo`, `semantic`, `catalog`, `ingest`, and `mart`, then enable `btree_gist`. Use reversible `RunSQL` operations that drop only objects created by this project on migration rollback.

```python
# Critical RegionIdentifier constraint in explorer/models/geo.py
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateRangeField, RangeOperators
from django.db import models


class RegionIdentifier(models.Model):
    region = models.ForeignKey("Region", on_delete=models.PROTECT)
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
        indexes = [models.Index(fields=["region", "code_system", "code"])]
```

Use text check constraints for status/type fields, a partial unique constraint for one active BoundarySet per year, and one active DerivedIndicator version per Indicator. Export every model through `explorer/models/__init__.py` so Django discovers them.

- [ ] **Step 4: Generate migrations and run model tests**

Run: `py manage.py makemigrations --check --dry-run`
Expected: no uncommitted model changes after the hand-written migrations are present.

Run: `py manage.py test explorer.tests.test_geo_semantic_models -v 2`
Expected: both constraint tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/models explorer/migrations explorer/tests/test_geo_semantic_models.py
git commit -m "feat: model historical regions and semantic indicators"
```

### Task 3: Add immutable Dataset Registry models and admin review

**Files:**
- Create: `explorer/models/catalog.py`
- Modify: `explorer/models/__init__.py`
- Create: `explorer/migrations/0003_catalog.py`
- Create: `explorer/admin.py`
- Create: `explorer/tests/test_catalog_models.py`

**Interfaces:**
- Consumes: Region, Indicator, Metric, Unit, TaxOwner, and TaxType models.
- Produces: `DatasetFamily`, `Dataset`, `DatasetVersion`, `DatasetDimension`, `DatasetItemMapping`, `DatasetRegionMapping`, `TaxMappingRule`, `IndicatorSourceAssignment`, and `NormalizationRule`.

Exact state sets:

```python
DATASET_VERSION_STATUSES = ("DRAFT", "VALIDATING", "ACTIVE", "NEEDS_REVIEW", "RETIRED")
SELECTION_STRATEGIES = ("ALL_MAPPED", "FIXED")
COMPARABILITY_STATUSES = ("COMPARABLE", "NOT_COMPARABLE", "NEEDS_REVIEW")
AUTHORITY_STATUSES = ("CANDIDATE", "AUTHORITATIVE", "REJECTED")
```

Exact field contract:

| Model | Required fields beyond `id` |
|---|---|
| DatasetFamily | `family_key`, `name`, `description` |
| Dataset | `dataset_key`, `family`, `source_provider`, `source_org_id`, `source_table_id`, `source_table_name`, `geography_level`, `frequency` |
| DatasetVersion | `dataset`, positive integer `version`, `status`, nullable `available_period`, nullable `source_updated_at`, `metadata_checksum`, `metadata_snapshot`, nullable `approved_at`, `approval_note`, `created_at` |
| DatasetDimension | `dataset_version`, nullable `source_dimension`, `semantic_dimension`, `required`, `selection_strategy`, nullable `default_value`, `ordinal` |
| DatasetItemMapping | `dataset_version`, `source_item_id`, `source_item_name`, `indicator`, `metric`, nullable `tax_owner`, `source_unit_id`, `valid_period`, `comparability_status` |
| DatasetRegionMapping | `dataset_version`, `source_dimension`, `source_region_code`, `source_region_name`, `region`, `valid_period`, `mapping_method`, nullable `approved_at` |
| TaxMappingRule | `dataset_version`, `source_tax_code`, `source_tax_name`, `tax_type`, `valid_period`, `comparability_status`, `rule_reason` |
| IndicatorSourceAssignment | `indicator`, `metric`, nullable `tax_owner`, `region_level`, `dataset_version`, `valid_period`, `authority_status`, `priority`, `reason` |
| NormalizationRule | `rule_key`, positive integer `version`, `rule_type`, `parameters`, `checksum`, `status`, `created_at` |

- [ ] **Step 1: Write failing Registry invariant tests**

```python
from django.db import DatabaseError, IntegrityError, transaction
from django.test import TestCase
from explorer.models import Dataset, DatasetDimension, DatasetFamily, DatasetVersion


class CatalogModelTests(TestCase):
    def setUp(self):
        family = DatasetFamily.objects.create(family_key="TEST_FAMILY", name="Test family")
        self.dataset = Dataset.objects.create(
            dataset_key="TEST_DATASET",
            family=family,
            source_provider="KOSIS",
            source_org_id="TEST_ORG",
            source_table_id="TEST_TABLE",
            source_table_name="Synthetic test table",
            geography_level="BASIC_LOCAL_GOVERNMENT",
            frequency="YEAR",
        )

    def test_only_one_active_version_per_dataset(self):
        DatasetVersion.objects.create(
            dataset=self.dataset, version=1, status="ACTIVE",
            metadata_checksum="a" * 64, metadata_snapshot={"source": "fixture"},
        )
        with self.assertRaises(IntegrityError), transaction.atomic():
            DatasetVersion.objects.create(
                dataset=self.dataset, version=2, status="ACTIVE",
                metadata_checksum="b" * 64, metadata_snapshot={"source": "fixture"},
            )

    def test_active_version_mapping_cannot_be_changed(self):
        version = DatasetVersion.objects.create(
            dataset=self.dataset, version=1, status="ACTIVE",
            metadata_checksum="a" * 64, metadata_snapshot={"source": "fixture"},
        )
        mapping = DatasetDimension.objects.create(
            dataset_version=version, source_dimension="C1",
            semantic_dimension="REGION", required=True,
            selection_strategy="ALL_MAPPED", ordinal=1,
        )
        mapping.semantic_dimension = "TAX_TYPE"
        with self.assertRaises(DatabaseError), transaction.atomic():
            mapping.save(update_fields=["semantic_dimension"])
```

- [ ] **Step 2: Run tests and confirm missing Registry classes**

Run: `py manage.py test explorer.tests.test_catalog_models -v 2`
Expected: FAIL on imports.

- [ ] **Step 3: Implement Registry tables, validity constraints, and immutability trigger**

Use the exact columns in design section 6.3. Add:

- unique provider/organization/table identity on Dataset;
- unique dataset/version and dataset/checksum on DatasetVersion;
- a partial unique constraint for one `ACTIVE` version per Dataset;
- exclusion constraints preventing overlapping item, region, tax, and authoritative-source mappings;
- checks requiring `default_value` for `FIXED` dimensions and a source dimension for `ALL_MAPPED`;
- FK indexes in the direction used by discovery and planning.

`0003_catalog.py` must install one shared trigger function that rejects `UPDATE` and `DELETE` on dimension, item, region, and tax mapping rows whenever their parent DatasetVersion is `ACTIVE`, `NEEDS_REVIEW`, or `RETIRED`. Status transitions remain allowed on DatasetVersion itself.

```sql
CREATE FUNCTION catalog.protect_approved_mapping() RETURNS trigger AS $$
DECLARE parent_status text;
BEGIN
  SELECT status INTO parent_status
  FROM catalog.dataset_version
  WHERE id = COALESCE(OLD.dataset_version_id, NEW.dataset_version_id);
  IF parent_status IN ('ACTIVE', 'NEEDS_REVIEW', 'RETIRED') THEN
    RAISE EXCEPTION 'approved dataset mappings are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 4: Register reviewable models in Django Admin and run tests**

Admin lists must show Dataset key, provider table identity, version, state, checksum, period, approval time, and mapping counts. Make approved mapping inlines read-only; do not create custom pages.

Run: `py manage.py test explorer.tests.test_catalog_models -v 2`
Expected: both invariants pass.

Run: `py manage.py makemigrations --check --dry-run`
Expected: no model drift.

- [ ] **Step 5: Commit**

```bash
git add explorer/models explorer/migrations/0003_catalog.py explorer/admin.py explorer/tests/test_catalog_models.py
git commit -m "feat: add versioned dataset registry"
```

### Task 4: Add ingestion and mart persistence invariants

**Files:**
- Create: `explorer/models/ingest.py`
- Create: `explorer/models/mart.py`
- Modify: `explorer/models/__init__.py`
- Create: `explorer/migrations/0004_ingest_mart.py`
- Create: `explorer/tests/factories.py`
- Create: `explorer/tests/test_ingest_mart_models.py`

**Interfaces:**
- Consumes: DatasetVersion, Region, Period, Indicator, Metric, TaxOwner, Unit, DerivedIndicator, and NormalizationRule.
- Produces: `IngestionJob`, `IngestionSlice`, `RawObservation`, `Observation`, and `ObservationInput`.

Exact field contract:

| Model | Required fields beyond `id` |
|---|---|
| IngestionJob | `dataset_version`, `job_type`, `status`, `idempotency_key`, nullable start/finish times, request/raw/normalized/failed counts, nullable source update/checksum/error, `created_at` |
| IngestionSlice | `ingestion_job`, `slice_key`, sanitized `request_parameters`, `status`, `attempts`, nullable `next_attempt_at`, start/finish times, response-row count, nullable error code/message |
| RawObservation | Job/Slice/DatasetVersion FKs; organization/table; C1–C8 code/name/object-name triplets; item/unit; period; `dt`; nullable symbol/update; `raw_payload`; `source_row_hash`; `quality_status`; `collected_at` |
| Observation | Region/Period/Indicator/Metric/TaxOwner; nullable exact numeric value; canonical unit; raw value/status/symbol/quality; source or derived lineage; normalization rule; Job; publish/supersede/create times |
| ObservationInput | `derived_observation`, `input_observation`, `input_role` |

- [ ] **Step 1: Write failing raw-idempotency and lineage tests**

```python
from django.db import IntegrityError, transaction
from django.test import TestCase
from explorer.models import RawObservation
from explorer.tests.factories import make_job_and_slice


class IngestMartModelTests(TestCase):
    def test_source_row_hash_is_unique_within_job(self):
        job, slice_row = make_job_and_slice()
        values = dict(
            ingestion_job=job,
            ingestion_slice=slice_row,
            dataset_version=job.dataset_version,
            org_id="TEST_ORG",
            tbl_id="TEST_TABLE",
            itm_id="TEST_ITEM",
            prd_se="Y",
            prd_de="2024",
            dt="0",
            source_row_hash="a" * 64,
            raw_payload={"DT": "0"},
            quality_status="UNVALIDATED",
        )
        RawObservation.objects.create(**values)
        with self.assertRaises(IntegrityError), transaction.atomic():
            RawObservation.objects.create(**values)
```

Add a second test creating an Observation with neither source lineage nor derived lineage and assert its check constraint rejects the insert. Add a third test proving two simultaneously active source observations for the same Region/Period/Indicator/Metric/TaxOwner/DatasetVersion are rejected.

- [ ] **Step 2: Run the tests and confirm persistence classes are absent**

Run: `py manage.py test explorer.tests.test_ingest_mart_models -v 2`
Expected: FAIL on imports.

- [ ] **Step 3: Implement ingestion and mart tables**

Use the exact column contracts from design sections 6.4 and 6.5. Store C1–C8 code, member name, and object name as grouped explicit fields on RawObservation. Use `DecimalField(max_digits=38, decimal_places=10)` for normalized values and `JSONField` for immutable source payloads.

Observation must enforce exactly one of:

```text
source_raw_observation and source_dataset_version are present, derived_indicator is null
derived_indicator is present, source_raw_observation and source_dataset_version are null
```

Create the two partial read indexes and separate partial active uniqueness constraints for source and derived rows. Use `PROTECT` for lineage FKs.

- [ ] **Step 4: Add the small shared test factory and verify constraints**

Create `explorer/tests/factories.py` with deterministic builders for synthetic Region, Period, Indicator, DatasetVersion, Job, and Slice rows. Factory identifiers must start with `TEST_` so they cannot be mistaken for official codes.

Run: `py manage.py test explorer.tests.test_ingest_mart_models -v 2`
Expected: raw uniqueness, lineage XOR, and active observation uniqueness pass.

Run: `py manage.py makemigrations --check --dry-run`
Expected: no model drift.

- [ ] **Step 5: Commit**

```bash
git add explorer/models explorer/migrations/0004_ingest_mart.py explorer/tests/factories.py explorer/tests/test_ingest_mart_models.py
git commit -m "feat: persist immutable raw and mart observations"
```

---

## Milestone B — KOSIS discovery and collection

### Task 5: Implement the KOSIS contract parser and sanitized client

**Files:**
- Create: `explorer/kosis/__init__.py`
- Create: `explorer/kosis/types.py`
- Create: `explorer/kosis/parser.py`
- Create: `explorer/kosis/client.py`
- Create: `explorer/tests/fixtures/kosis_success.json`
- Create: `explorer/tests/fixtures/kosis_error.xml`
- Create: `explorer/tests/fixtures/kosis_error.json`
- Create: `explorer/tests/fakes.py`
- Create: `explorer/tests/test_kosis_contract.py`

**Interfaces:**
- Consumes: KOSIS guide contract.
- Produces: `ParsedKosisRow`, `KosisResponse`, `KosisApiError`, `parse_kosis_response(content_type: str, body: bytes) -> KosisResponse`, `sanitize_params(params) -> dict[str, str]`, `KosisClient.fetch(params) -> KosisResponse`, and reusable test-only `FakeKosisClient`.

- [ ] **Step 1: Add sanitized fixtures and failing parser tests**

```json
[
  {
    "ORG_ID": "TEST_ORG",
    "TBL_ID": "TEST_TABLE",
    "TBL_NM": "Synthetic contract table",
    "C1": "TEST_REGION",
    "C1_OBJ_NM": "Synthetic region axis",
    "C1_NM": "Synthetic district",
    "ITM_ID": "TEST_ITEM",
    "ITM_NM": "Synthetic collected amount",
    "UNIT_ID": "TEST_UNIT",
    "UNIT_NM": "Synthetic currency unit",
    "PRD_SE": "Y",
    "PRD_DE": "2024",
    "DT": "0",
    "LST_CHN_DE": "20250101"
  }
]
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<error><err>41</err><errMsg>synthetic row limit</errMsg></error>
```

```json
{"err":"10","errMsg":"synthetic missing key"}
```

```python
from pathlib import Path
from django.test import SimpleTestCase
from explorer.kosis.parser import parse_kosis_response
from explorer.kosis.types import KosisApiError


FIXTURES = Path(__file__).parent / "fixtures"


class KosisContractTests(SimpleTestCase):
    def test_dt_zero_remains_raw_string(self):
        response = parse_kosis_response(
            "application/json", (FIXTURES / "kosis_success.json").read_bytes()
        )
        self.assertEqual(response.rows[0].dt, "0")

    def test_xml_error_is_detected_when_json_was_expected(self):
        with self.assertRaises(KosisApiError) as raised:
            parse_kosis_response(
                "application/xml", (FIXTURES / "kosis_error.xml").read_bytes()
            )
        self.assertEqual(raised.exception.code, "41")

    def test_json_error_object_is_not_parsed_as_a_data_row(self):
        with self.assertRaises(KosisApiError) as raised:
            parse_kosis_response(
                "application/json", (FIXTURES / "kosis_error.json").read_bytes()
            )
        self.assertEqual(raised.exception.code, "10")
```

- [ ] **Step 2: Verify parser tests fail**

Run: `py manage.py test explorer.tests.test_kosis_contract -v 2`
Expected: FAIL because parser modules do not exist.

- [ ] **Step 3: Implement typed parsing without numeric coercion**

`ParsedKosisRow` must expose all RAW fields, including arrays for the eight classification triplets, while retaining the original dictionary. Detect JSON by leading token as well as Content-Type; detect XML errors before JSON decoding. Reject unknown top-level structures with a typed parse error containing no credentials.

```python
@dataclass(frozen=True)
class KosisApiError(Exception):
    code: str
    message: str
    retryable: bool


@dataclass(frozen=True)
class KosisResponse:
    rows: tuple[ParsedKosisRow, ...]
    raw_body: bytes
```

- [ ] **Step 4: Add the standard-library HTTP client and limiter tests**

`KosisClient` uses `urllib.parse.urlencode` and `urllib.request.urlopen`. It accepts an injected opener, clock, and sleep function for deterministic tests. A process-local limiter enforces 0.35 seconds between request starts. `sanitize_params` removes keys matching `apiKey` case-insensitively before logging or persistence.

Add tests proving the second request sleeps for the remaining interval and sanitized parameters contain no API key.

`FakeKosisClient.from_fixture(name)` returns queued parsed responses, records sanitized calls, and can queue typed KosisApiErrors. `FakeKosisClient.success(rows)` is a convenience constructor for Collector tests. It belongs under tests and is never imported by production modules.

Run: `py manage.py test explorer.tests.test_kosis_contract -v 2`
Expected: JSON, XML error, limiter, and redaction tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/kosis explorer/tests/fixtures explorer/tests/fakes.py explorer/tests/test_kosis_contract.py
git commit -m "feat: parse and call kosis safely"
```

### Task 6: Implement metadata-first Discovery manifests

**Files:**
- Create: `explorer/kosis/discovery.py`
- Create: `explorer/management/__init__.py`
- Create: `explorer/management/commands/__init__.py`
- Create: `explorer/management/commands/discover_kosis.py`
- Create: `explorer/tests/fixtures/kosis_metadata_national.json`
- Create: `explorer/tests/fixtures/kosis_metadata_split_tables.json`
- Create: `explorer/tests/test_discovery.py`

**Interfaces:**
- Consumes: `KosisClient`, metadata responses, and semantic `DiscoveryIntent`.
- Produces: `DiscoveryCandidate`, `DimensionProposal`, `ItemProposal`, `CoverageSummary`, `DiscoveryManifest`, `metadata_checksum(snapshot)`, and `discover(intent, client) -> DiscoveryManifest`.

- [ ] **Step 1: Write failing discovery grouping and activation-safety tests**

```python
from django.test import SimpleTestCase
from explorer.kosis.discovery import DiscoveryIntent, discover
from explorer.tests.fakes import FakeKosisClient


class DiscoveryTests(SimpleTestCase):
    def test_split_city_and_district_tax_tables_share_family_but_not_dataset(self):
        manifest = discover(
            DiscoveryIntent(
                indicator_key="ACQUISITION_TAX",
                metric_keys=("COLLECTED",),
                geography_level="BASIC_LOCAL_GOVERNMENT",
                start_year=2010,
                end_year=2024,
                search_terms=("취득세", "기초자치단체별 부과징수"),
            ),
            client=FakeKosisClient.from_fixture("kosis_metadata_split_tables.json"),
        )
        self.assertEqual(len(manifest.dataset_families), 1)
        self.assertEqual(len(manifest.candidates), 2)
        self.assertNotEqual(manifest.candidates[0].source_table_id, manifest.candidates[1].source_table_id)
        self.assertTrue(all(candidate.registry_status == "DRAFT" for candidate in manifest.candidates))
```

- [ ] **Step 2: Run the test and confirm Discovery is absent**

Run: `py manage.py test explorer.tests.test_discovery -v 2`
Expected: FAIL on import.

- [ ] **Step 3: Implement deterministic metadata canonicalization and proposals**

Canonicalize relevant metadata by sorting dictionary keys and members, preserving organization/table/item/dimension/unit/period/comment fields, excluding credentials and transport timestamps, then SHA-256 hashing UTF-8 JSON.

The structure fingerprint contains frequency, dimension count/names, normalized item names, units, period range, fixed-region flag, and fixed-owner flag. It groups review candidates but never changes `registry_status` from `DRAFT`.

Dimension proposals must include evidence from metadata and sampled `C*_OBJ_NM`/`C*_NM`. Item proposals use labels only to recommend an Indicator/Metric; `human_confirmed` defaults to `False`.

- [ ] **Step 4: Implement the command and verify stable output**

Command:

```text
py manage.py discover_kosis --indicator ACQUISITION_TAX --metric COLLECTED --from-year 2010 --to-year 2024 --query 취득세 --query "기초자치단체별 부과징수" --output var/discovery/acquisition-tax.json
```

The command requires `KOSIS_API_KEY`, writes a sanitized JSON manifest atomically, and exits nonzero if metadata cannot establish period, unit, or dimension evidence. It does not write Registry rows.

Add a checksum-stability test that reorders input JSON keys and receives the same checksum.

Run: `py manage.py test explorer.tests.test_discovery -v 2`
Expected: grouping, draft-only, and checksum tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/kosis/discovery.py explorer/management explorer/tests/fixtures/kosis_metadata_national.json explorer/tests/fixtures/kosis_metadata_split_tables.json explorer/tests/test_discovery.py
git commit -m "feat: discover kosis dataset candidates"
```

### Task 7: Implement the idempotent Query Planner

**Files:**
- Create: `explorer/kosis/planner.py`
- Create: `explorer/tests/test_planner.py`

**Interfaces:**
- Consumes: `IngestionIntent`, active authoritative Registry assignments, and historical Region mappings.
- Produces: `PlannedSlice`, `CountSlice`, `estimate_cells(period_count: int, item_count: int, dimension_counts: tuple[int, ...]) -> int`, `split_counts(period_count: int, item_count: int, dimension_counts: tuple[int, ...], limit: int = 40000) -> tuple[CountSlice, ...]`, `split_request(selection: RequestSelection, limit: int = 40000) -> tuple[RequestSelection, ...]`, and `plan(intent: IngestionIntent) -> tuple[PlannedSlice, ...]`.

- [ ] **Step 1: Write failing limit, validity, and fixed-context tests**

```python
from django.test import TestCase
from explorer.kosis.planner import estimate_cells, split_counts


class PlannerTests(TestCase):
    def test_estimate_cells_multiplies_period_items_and_dimensions(self):
        self.assertEqual(estimate_cells(15, 2, (250, 1)), 7500)

    def test_split_counts_keeps_every_slice_within_limit(self):
        slices = split_counts(period_count=15, item_count=8, dimension_counts=(500,), limit=40000)
        self.assertTrue(slices)
        self.assertTrue(all(slice_row.estimated_cells <= 40000 for slice_row in slices))
        self.assertEqual(sum(slice_row.period_count * slice_row.item_count * slice_row.dimension_counts[0] for slice_row in slices), 60000)
```

Add database-backed tests proving a source assignment change at 2016 produces 2010–2015 and 2016–2024 plans, and a fixed Region with no source dimension appears only in `normalization_context`.

- [ ] **Step 2: Verify planner tests fail**

Run: `py manage.py test explorer.tests.test_planner -v 2`
Expected: FAIL on import.

- [ ] **Step 3: Implement exact estimation, deterministic splitting, and Registry resolution**

```python
def estimate_cells(period_count: int, item_count: int, dimension_counts: tuple[int, ...]) -> int:
    return period_count * item_count * math.prod(dimension_counts)
```

Resolve only `ACTIVE` DatasetVersions and `AUTHORITATIVE` assignments. Intersect source-assignment, item, region-mapping, DatasetVersion, and requested periods. Reject gaps and overlaps. Split contiguous periods first, region members second, and items third. A source dimension maps to `objL1`–`objL8`; semantic-only fixed values do not become request parameters.

Build `slice_key` from canonical sanitized parameters, DatasetVersion ID, metadata checksum, and normalization context. Persist all Slices before collection and reuse successful keys.

- [ ] **Step 4: Run planner tests and migration drift check**

Run: `py manage.py test explorer.tests.test_planner -v 2`
Expected: estimation, split conservation, validity split, and fixed-context tests pass.

Run: `py manage.py makemigrations --check --dry-run`
Expected: no model drift.

- [ ] **Step 5: Commit**

```bash
git add explorer/kosis/planner.py explorer/tests/test_planner.py
git commit -m "feat: plan bounded idempotent kosis requests"
```

### Task 8: Collect Slices into immutable RAW with retries and checkpoints

**Files:**
- Create: `explorer/pipeline/__init__.py`
- Create: `explorer/pipeline/collector.py`
- Create: `explorer/management/commands/ingest_dataset.py`
- Create: `explorer/tests/test_collector.py`

**Interfaces:**
- Consumes: persisted IngestionSlice rows and `KosisClient`.
- Produces: `collect_job(job_id: int, client: KosisClient) -> CollectionResult` and immutable RawObservation rows.

- [ ] **Step 1: Write failing restart, hash, and error-policy tests**

```python
from django.test import TestCase
from explorer.pipeline.collector import collect_job
from explorer.tests.fakes import FakeKosisClient
from explorer.tests.factories import make_planned_job


class CollectorTests(TestCase):
    def test_completed_slice_is_not_called_again(self):
        job = make_planned_job(slice_status="SUCCESS")
        client = FakeKosisClient.success([])
        result = collect_job(job.id, client)
        self.assertEqual(client.calls, [])
        self.assertEqual(result.skipped_slices, 1)
```

Add tests that error 41 creates child Slices instead of retrying the same request, error 10 fails the job without retry, error 50 retries at most three times, and two identical source rows create one RawObservation per job hash.

- [ ] **Step 2: Verify collector tests fail**

Run: `py manage.py test explorer.tests.test_collector -v 2`
Expected: FAIL on imports.

- [ ] **Step 3: Implement checkpointed Slice execution**

Lock one pending Slice with `select_for_update(skip_locked=True)`, mark it `RUNNING`, call the client, hash each canonical source row, bulk insert RAW with conflict avoidance on job/hash, and mark the Slice `SUCCESS` or `SUCCESS_EMPTY`.

Map errors exactly:

```python
NO_RETRY_CODES = frozenset({"10", "11", "20", "21"})
SPLIT_CODES = frozenset({"31", "41"})
BACKOFF_CODES = frozenset({"40", "42", "50"})
MAX_RETRIES = 3
```

Persist sanitized error code/message only. Retain successful RAW when another Slice fails. Aggregate final Job status as `SUCCESS`, `PARTIAL_SUCCESS`, or `FAILED`.

- [ ] **Step 4: Add `ingest_dataset` command and pass tests**

Command accepts one approved DatasetVersion ID, period range, and `FULL`, `REFRESH`, or `REPAIR`, creates/reuses an idempotent job, invokes the Planner, and calls the Collector. It refuses non-active versions before any network request.

Run: `py manage.py test explorer.tests.test_collector -v 2`
Expected: restart, split, retry, no-retry, idempotency, and partial-failure tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/pipeline explorer/management/commands/ingest_dataset.py explorer/tests/test_collector.py
git commit -m "feat: collect kosis slices into immutable raw"
```

---

## Milestone C — Normalization, derivation, and boundaries

### Task 9: Normalize RAW with explicit value and quality states

**Files:**
- Create: `explorer/pipeline/normalizer.py`
- Create: `explorer/management/commands/rebuild_mart.py`
- Create: `explorer/tests/test_normalizer.py`

**Interfaces:**
- Consumes: successful Job RAW, active DatasetVersion mappings, Periods, Regions, Units, and NormalizationRules.
- Produces: `ParsedValue`, `parse_stat_value(raw_value: str | None, symbol: str | None) -> ParsedValue`, `normalize_job(job_id: int) -> NormalizationResult`, and unpublished Observation rows.

- [ ] **Step 1: Write failing zero, symbol, historical Region, and unit tests**

```python
from decimal import Decimal
from django.test import TestCase
from explorer.pipeline.normalizer import parse_stat_value


class NormalizerTests(TestCase):
    def test_zero_is_present(self):
        parsed = parse_stat_value("0", None)
        self.assertEqual(parsed.numeric_value, Decimal("0"))
        self.assertEqual(parsed.value_status, "PRESENT")

    def test_dash_is_missing_not_zero(self):
        parsed = parse_stat_value("-", "-")
        self.assertIsNone(parsed.numeric_value)
        self.assertEqual(parsed.value_status, "MISSING")
```

Add tests proving a 2014 source region code selects the mapping valid in 2014, an unknown region creates a failed DQ result without an Observation, and a verified thousand-KRW conversion yields exact KRW Decimal output with a rule ID.

- [ ] **Step 2: Verify normalization tests fail**

Run: `py manage.py test explorer.tests.test_normalizer -v 2`
Expected: FAIL on import.

- [ ] **Step 3: Implement parsing, mapping, conversion, and DQ result types**

Recognize only symbols documented by each approved DatasetVersion; do not define one global meaning for every dash or letter. Numeric parsing removes approved grouping separators, uses `Decimal`, and rejects unexpected text.

For each RAW row:

1. locate the Period from `PRD_SE` and `PRD_DE`;
2. apply DatasetDimension and ItemMapping valid for that Period;
3. map the source region member through DatasetRegionMapping valid for that Period;
4. parse value and symbol;
5. convert the verified source unit through a versioned NormalizationRule;
6. create an unpublished source Observation or a structured DQ failure.

Required failure codes are `MISSING_DIMENSION`, `UNKNOWN_ITEM`, `UNKNOWN_REGION`, `UNKNOWN_UNIT`, `INVALID_PERIOD`, `INVALID_VALUE`, `DUPLICATE_SEMANTIC_KEY`, and `NOT_COMPARABLE`.

- [ ] **Step 4: Implement rebuild command and run tests**

`rebuild_mart --job-id N` deletes only unpublished observations for that Job, re-runs normalization from immutable RAW, and never calls KOSIS.

Run: `py manage.py test explorer.tests.test_normalizer -v 2`
Expected: value-state, historical Region, unit, failure, and rebuild tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/pipeline/normalizer.py explorer/management/commands/rebuild_mart.py explorer/tests/test_normalizer.py
git commit -m "feat: normalize raw statistics with data quality"
```

### Task 10: Publish atomically and calculate versioned derived indicators

**Files:**
- Create: `explorer/pipeline/publisher.py`
- Create: `explorer/pipeline/derived.py`
- Create: `explorer/tests/test_publish_derived.py`

**Interfaces:**
- Consumes: validated unpublished observations and active DerivedIndicator definitions.
- Produces: `publish_job(job_id: int) -> PublishResult`, `calculate_per_capita(tax, population)`, `calculate_yoy(current, previous)`, `calculate_cagr(first, last, year_distance)`, and derived Observation/Input rows.

- [ ] **Step 1: Write failing calculation and rollback tests**

```python
from decimal import Decimal
from django.test import TestCase
from explorer.pipeline.derived import calculate_cagr, calculate_per_capita, calculate_yoy


class DerivedCalculationTests(TestCase):
    def test_per_capita_uses_exact_decimal(self):
        self.assertEqual(calculate_per_capita(Decimal("1000"), Decimal("4")), Decimal("250"))

    def test_per_capita_missing_or_zero_denominator_is_missing(self):
        self.assertIsNone(calculate_per_capita(Decimal("1000"), Decimal("0")))
        self.assertIsNone(calculate_per_capita(Decimal("1000"), None))

    def test_yoy_and_cagr_require_positive_comparable_inputs(self):
        self.assertEqual(calculate_yoy(Decimal("110"), Decimal("100")), Decimal("10"))
        self.assertIsNone(calculate_cagr(Decimal("0"), Decimal("110"), 2))
```

Add a transaction test where one staged observation has failed quality: `publish_job` must leave every staged row unpublished and must not supersede the old active row.

- [ ] **Step 2: Verify tests fail**

Run: `py manage.py test explorer.tests.test_publish_derived -v 2`
Expected: FAIL on imports.

- [ ] **Step 3: Implement transactional publication**

Lock staged and conflicting active observations. Reject publication unless every required Slice succeeded and all required DQ checks passed. Supersede prior active rows, set `published_at` on new rows, and set the Job to `SUCCESS` in one transaction.

After source publication, evaluate active DerivedIndicators by exact matching Region/Period and required Metric/TaxOwner. Store evaluator key, formula checksum, and exact ObservationInput roles `TAX` and `POPULATION`.

- [ ] **Step 4: Run derivation and transaction tests**

Run: `py manage.py test explorer.tests.test_publish_derived -v 2`
Expected: calculations, input lineage, supersession, and rollback tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/pipeline/publisher.py explorer/pipeline/derived.py explorer/tests/test_publish_derived.py
git commit -m "feat: publish and derive regional observations"
```

### Task 11: Acquire and version SGIS yearly boundaries

**Files:**
- Create: `explorer/boundaries.py`
- Create: `explorer/management/commands/load_boundaries.py`
- Create: `explorer/tests/fixtures/sgis_boundary_2020.geojson`
- Create: `explorer/tests/test_boundaries.py`

**Interfaces:**
- Consumes: SGIS access token, explicit verified source CRS, yearly SGIS GeoJSON, and RegionIdentifier mappings for `SGIS_ADM_CD`.
- Produces: `BoundaryBuildResult`, `build_boundary_set(year, raw_geojson, source_crs, simplify_tolerance)`, BoundarySet/BoundaryFeature rows, and `explorer/static/geo/boundaries/{year}.geojson`.

- [ ] **Step 1: Add a synthetic projected fixture and failing boundary tests**

The fixture contains two Polygon features with `adm_cd` values `TEST_SGIS_A` and `TEST_SGIS_B`, declared by the test as `EPSG:5179`. It contains no real administrative code.

```python
from pathlib import Path
from django.test import TestCase
from explorer.boundaries import build_boundary_set


class BoundaryTests(TestCase):
    def test_build_maps_features_and_outputs_wgs84(self):
        result = build_boundary_set(
            year=2020,
            raw_geojson=(Path(__file__).parent / "fixtures" / "sgis_boundary_2020.geojson").read_bytes(),
            source_crs="EPSG:5179",
            simplify_tolerance=0,
        )
        self.assertEqual(result.reference_year, 2020)
        self.assertEqual(result.feature_count, 2)
        self.assertEqual(result.output_crs, "EPSG:4326")
```

Add tests rejecting a missing explicit source CRS, an unexpected feature code, duplicate features, unmapped in-scope Regions, and a response year that differs from the command year.

- [ ] **Step 2: Verify boundary tests fail**

Run: `py manage.py test explorer.tests.test_boundaries -v 2`
Expected: FAIL on import.

- [ ] **Step 3: Implement immutable raw capture and deterministic web assets**

Use `pyproj.Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)` and `shapely.ops.transform`. Simplify in the verified projected source CRS before converting to EPSG:4326. Preserve geometry validity; reject invalid output instead of silently repairing it.

Write the raw response to `var/boundaries/raw/{year}-{sha256}.geojson`. Write a canonical compact web FeatureCollection atomically to the static path. Each feature contains only `featureKey`, `regionId`, `name`, and comparison status; it contains no source token.

Create BoundarySet as `VALIDATING`, create BoundaryFeatures, compare coverage against Regions valid in that year, then activate only on a passing review.

- [ ] **Step 4: Implement the command and verify all 15 target years are addressable**

The command accepts only years 2010–2024, obtains child 시군구 boundaries server-side, and refuses to infer the CRS. Prove the command path with the synthetic fixture using:

```text
py manage.py load_boundaries --year 2020 --fixture explorer/tests/fixtures/sgis_boundary_2020.geojson --source-crs EPSG:5179 --simplify-tolerance 0
```

For a live run, the operator must supply the actual CRS and simplification tolerance recorded by the source-review gate rather than copying the synthetic fixture values.

Run: `py manage.py test explorer.tests.test_boundaries -v 2`
Expected: transformation, validation, mapping, and rejection tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/boundaries.py explorer/management/commands/load_boundaries.py explorer/tests/fixtures/sgis_boundary_2020.geojson explorer/tests/test_boundaries.py
git commit -m "feat: version yearly administrative boundaries"
```

---

## Milestone D — Semantic API, dashboard, and end-to-end operation

### Task 12: Implement source-independent series and ranking APIs

**Files:**
- Create: `explorer/queries.py`
- Create: `explorer/api.py`
- Modify: `explorer/urls.py`
- Create: `explorer/tests/test_api.py`

**Interfaces:**
- Consumes: published non-superseded Observation rows, Region validity, Indicator definitions, BoundarySets, DatasetVersion, RAW lineage, and coverage state.
- Produces: `query_series(region_keys: tuple[str, ...], indicator_key: str, metric_key: str | None, tax_owner_key: str | None, start_year: int, end_year: int) -> dict[str, object]`, `query_rankings(indicator_key: str, metric_key: str | None, tax_owner_key: str | None, year: int) -> dict[str, object]`, and JSON endpoints `/api/regions`, `/api/indicators`, `/api/series`, and `/api/rankings`.

- [ ] **Step 1: Write failing API contract and source-separation tests**

```python
from django.test import TestCase
from explorer.tests.factories import make_published_series


class ApiTests(TestCase):
    def test_series_returns_values_and_lineage_without_kosis_request_fields(self):
        region, indicator = make_published_series()
        response = self.client.get(
            "/api/series",
            {"regionId": region.region_key, "indicatorId": indicator.indicator_key, "from": "2020", "to": "2024"},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("values", payload)
        self.assertIn("source", payload)
        self.assertNotIn("objL1", response.content.decode())
        self.assertNotIn("apiKey", response.content.decode())
```

Add tests for invalid year/Indicator/Region allowlist values, rankings with `boundaryVersion` and `featureKey`, missing values remaining null, zero ranking as zero, and incomplete coverage warning.

- [ ] **Step 2: Verify API tests fail**

Run: `py manage.py test explorer.tests.test_api -v 2`
Expected: FAIL because query and endpoint modules do not exist.

- [ ] **Step 3: Implement compact mart queries**

Use the partial-index predicates exactly: `published_at IS NOT NULL` and `superseded_at IS NULL`. Validate period range 2010–2024 for the MVP. Preserve Decimal values as JSON numbers only when safely representable; currency values may be serialized as decimal strings with an explicit `valueEncoding` to avoid JavaScript precision loss.

Series response contains Region, Indicator, Metric, TaxOwner, unit, values with status/symbol, source table/organization/original unit/update/collection information, formula lineage for derived values, and coverage.

Ranking response contains period, boundary version/URL, coverage, and ordered values with `featureKey`, Region, value, status, and rank. Null values have no rank.

- [ ] **Step 4: Route endpoints and run API tests**

Use function-based Django views and `JsonResponse`; no serializer framework. Add cache headers for immutable boundary URLs but not for mutable API responses.

Run: `py manage.py test explorer.tests.test_api -v 2`
Expected: contracts, input rejection, precision, coverage, and source-separation tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/queries.py explorer/api.py explorer/urls.py explorer/tests/test_api.py explorer/tests/factories.py
git commit -m "feat: expose semantic series and rankings api"
```

### Task 13: Build the accessible trend and historical-map page

**Files:**
- Modify: `explorer/views.py`
- Create: `explorer/templates/explorer/index.html`
- Create: `explorer/static/explorer/app.js`
- Create: `explorer/static/explorer/styles.css`
- Modify: `explorer/urls.py`
- Create: `explorer/tests/test_ui.py`

**Interfaces:**
- Consumes: the four semantic APIs and yearly static boundary assets.
- Produces: `GET /`, independent trend charts, choropleth, ranking table, data table, source panel, and visible coverage/missing-state indicators.

- [ ] **Step 1: Write failing HTML/accessibility tests**

```python
from django.test import TestCase


class UiTests(TestCase):
    def test_index_contains_labeled_filters_separate_charts_and_map(self):
        response = self.client.get("/")
        content = response.content.decode()
        self.assertContains(response, 'label for="region-select"')
        self.assertContains(response, 'canvas id="tax-chart"')
        self.assertContains(response, 'canvas id="population-chart"')
        self.assertContains(response, 'div id="map"')
        self.assertContains(response, 'table id="ranking-table"')
        self.assertNotIn("KOSIS_API_KEY", content)
        self.assertNotIn("objL1", content)
```

- [ ] **Step 2: Verify the page test fails**

Run: `py manage.py test explorer.tests.test_ui -v 2`
Expected: FAIL because the template does not exist.

- [ ] **Step 3: Implement the summary-first template and styles**

The default page order is filters, distinct KPI cards, aligned trend charts, historical map/ranking, yearly data table, then definition/source/caveats. Use native labels, buttons, selects, table markup, keyboard focus styles, and an `aria-live="polite"` status region.

Pin official stable Leaflet 1.9.4 using:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js"
        crossorigin="anonymous"></script>
```

Do not add a Node build system. Restrict production Content Security Policy to self plus these exact pinned asset origins until the files are vendored.

Keep tax, population, and per-capita lines in separate chart containers. Do not use a dual Y axis. Missing map values use neutral gray; out-of-scope features use a visibly different pattern; use one sequential color scale for present values.

- [ ] **Step 4: Implement client-side data loading and reconciliation checks**

`app.js` must:

1. load Region and Indicator options;
2. fetch series for the selected Region and period;
3. render separate Chart.js line charts and one semantic data table from the same response;
4. fetch ranking and its exact `boundaryUrl` for the selected year;
5. join GeoJSON and values only by `featureKey` using `new Map(values.map(row => [row.featureKey, row]))`;
6. show tooltip, rank, legend, coverage, freshness, source, and errors;
7. abort superseded fetches with `AbortController`.

The API and boundary-build tests enforce unique `featureKey` values; Task 14 verifies that every ranking key exists in the matching static GeoJSON. Do not add a JavaScript test dependency for this direct lookup.

Run: `py manage.py test explorer.tests.test_ui -v 2`
Expected: template, accessibility, and secret-separation tests pass.

- [ ] **Step 5: Commit**

```bash
git add explorer/views.py explorer/urls.py explorer/templates explorer/static/explorer explorer/tests/test_ui.py
git commit -m "feat: add regional trend and historical map dashboard"
```

### Task 14: Add the fixture-backed vertical slice and operator runbook

**Files:**
- Create: `explorer/management/commands/sync_mvp.py`
- Create: `explorer/tests/fixtures/mvp_acquisition_tax.json`
- Create: `explorer/tests/fixtures/mvp_population.json`
- Create: `explorer/tests/scenarios.py`
- Create: `explorer/tests/test_mvp_vertical_slice.py`
- Create: `README.md`

**Interfaces:**
- Consumes: approved Registry rows, Planner, Collector, Normalizer, Publisher, Derived calculator, boundary assets, and semantic API.
- Produces: one command for an approved live refresh and one repeatable fixture-backed end-to-end proof.

- [ ] **Step 1: Write the failing end-to-end acceptance test**

```python
from django.test import TestCase
from explorer.tests.scenarios import load_synthetic_mvp


class MvpVerticalSliceTests(TestCase):
    def test_raw_to_series_ranking_and_per_capita_lineage(self):
        scenario = load_synthetic_mvp(years=range(2010, 2025))
        scenario.run_pipeline()

        series = self.client.get(
            "/api/series",
            {"regionId": "TEST_REGION_A", "indicatorId": "ACQUISITION_TAX_PER_CAPITA", "from": "2010", "to": "2024"},
        ).json()
        ranking = self.client.get(
            "/api/rankings",
            {"indicatorId": "ACQUISITION_TAX", "metric": "COLLECTED", "year": "2024"},
        ).json()

        self.assertEqual(len(series["values"]), 15)
        self.assertTrue(series["source"]["derived"])
        self.assertEqual(len(series["source"]["inputs"]), 2)
        self.assertEqual(ranking["boundaryVersion"], "2024")
        self.assertEqual(ranking["values"][0]["featureKey"], "TEST_FEATURE_A")
```

Add assertions for zero versus missing, city/province-owner separation, coverage warning, raw-row lineage, and absence of credentials in every serialized response.

- [ ] **Step 2: Verify the end-to-end test fails**

Run: `py manage.py test explorer.tests.test_mvp_vertical_slice -v 2`
Expected: FAIL because scenario helpers and orchestration command do not exist.

- [ ] **Step 3: Implement the deterministic synthetic scenario and `sync_mvp` command**

Synthetic fixtures must use only `TEST_` source identifiers and two Regions over all 15 target years. The scenario creates approved Registry rows, plans fixture requests, collects RAW, normalizes, publishes, derives, activates synthetic BoundarySets, and exercises APIs.

`sync_mvp` accepts approved DatasetVersion IDs and performs metadata check, refresh planning, collection, normalization, publication, and derivation. It exits before network access if either DatasetVersion is not active or coverage/mapping prerequisites fail.

- [ ] **Step 4: Write the operator runbook**

README sections and exact commands:

1. Python/PostgreSQL prerequisites and environment variables.
2. `py -m venv .venv` and editable installation.
3. `py manage.py migrate` and `py manage.py check`.
4. KOSIS acquisition-tax and population Discovery commands.
5. Human review checklist and Django Admin activation gate.
6. SGIS yearly boundary acquisition with explicit verified CRS.
7. `sync_mvp` full refresh and `REPAIR` procedure.
8. `py manage.py runserver`.
9. Source-key rotation and log-redaction verification.
10. Backup rule: preserve PostgreSQL and `var/` RAW before replacing any source version.

Do not place real credentials or unverified source identifiers in README examples.

- [ ] **Step 5: Run the complete verification suite**

Run: `py manage.py test -v 2`
Expected: all unit, contract, integration, DQ, API, UI, and vertical-slice tests pass.

Run: `py manage.py check`
Expected: no system-check issues.

Run: `py manage.py makemigrations --check --dry-run`
Expected: no migration drift.

Run: `git grep -n -E "(KOSIS_API_KEY|accessToken)[=:][^[:space:]]+" -- ':!docs/superpowers/*'`
Expected: no credential value matches.

- [ ] **Step 6: Commit**

```bash
git add explorer/management/commands/sync_mvp.py explorer/tests/fixtures/mvp_acquisition_tax.json explorer/tests/fixtures/mvp_population.json explorer/tests/test_mvp_vertical_slice.py explorer/tests/scenarios.py README.md
git commit -m "feat: complete regional data explorer mvp slice"
```

---

## Live-data approval gates

Implementation can complete and pass fixture-backed tests without live keys. A production-like MVP is not declared complete until an operator performs these explicit gates:

1. Run Discovery with a server-side KOSIS key for acquisition tax and resident population.
2. Review official organization/table/item/dimension/unit/comment metadata and sample rows.
3. Confirm the acquisition-tax Metric and TaxOwner without summing owner categories.
4. Confirm the resident-population reference semantics from metadata comments.
5. Map every in-scope source Region member for each applicable year and document every exclusion.
6. Activate one authoritative DatasetVersion per semantic series and validity range.
7. Verify the SGIS source CRS from official evidence and a known control point before boundary activation.
8. Run full 2010–2024 collection, DQ, publication, derivation, and boundary coverage.
9. Compare displayed values for at least one Region/year against the original KOSIS table manually.
10. Record the approved checksums and review note in the Registry.

Failure at any gate leaves the affected DatasetVersion or BoundarySet non-active; the UI must not present it as complete coverage.

## Final verification

Before claiming implementation completion, run in this order:

```text
py manage.py test -v 2
py manage.py check
py manage.py makemigrations --check --dry-run
git status --short
```

The expected state is all tests passing, no Django issues, no migration drift, and only intentionally untracked operator RAW under ignored `var/`.

## Version references

- [Django 5.2 tutorial and Python support](https://docs.djangoproject.com/en/5.2/intro/tutorial01/)
- [Leaflet 1.9.4 official download and integrity hashes](https://leafletjs.com/download.html)
- [Chart.js 4.5.1 API documentation](https://www.chartjs.org/docs/latest/api/)
- [KOSIS official error format and codes](https://kosis.kr/openapi/file/openApi_manual_v1.0.pdf)
