# 2010–2024 Regional Data Explorer MVP (Korea Local Governments)

A resilient, reproducible, fixture-backed Regional Data Explorer for Korean local governments (시·군·구), integrating local tax revenue (취득세), resident population (주민등록인구), and derived per-capita indicators with historical SGIS administrative boundaries from 2010 to 2024.

---

## 1. Prerequisites and System Requirements

- **Python**: 3.12+ (tested on Python 3.14)
- **PostgreSQL**: 16 with `btree_gist` extension enabled
- **Environment Variables**:
  - `DATABASE_URL`: PostgreSQL connection URI (e.g. `postgresql://postgres@localhost:5433/kosis`)
  - `KOSIS_API_KEY`: Official KOSIS OpenAPI key for discovery and live ingestion (keep secure; never commit or leak)
  - `DJANGO_SECRET_KEY`: Standard Django secret key for session/security protection
  - `DEBUG`: Set to `True` for development, `False` for production

---

## 2. Installation and Setup

```bash
# 1. Create and activate virtual environment
python -m venv .venv
# On Windows:
.\.venv\Scripts\Activate.ps1
# On Linux/macOS:
# source .venv/bin/activate

# 2. Install dependencies
pip install -e .
```

---

## 3. Database Migration and Health Check

Ensure PostgreSQL is running and credentials match `DATABASE_URL`:

```bash
# Run Django database migrations
python manage.py migrate

# Validate Django configuration and schema consistency
python manage.py check
```

---

## 4. Metadata Discovery Workflow

Before ingesting datasets, operators run discovery to fetch and canonicalize official metadata without modifying production Registry tables.

```bash
# Discover Acquisition Tax candidates
python manage.py discover_kosis \
  --indicator ACQUISITION_TAX \
  --metric COLLECTED \
  --from-year 2010 \
  --to-year 2024 \
  --query "취득세" \
  --query "기초자치단체별 부과징수" \
  --output var/discovery/acquisition-tax.json

# Discover Resident Population candidates
python manage.py discover_kosis \
  --indicator POPULATION \
  --metric POPULATION_COUNT \
  --from-year 2010 \
  --to-year 2024 \
  --query "주민등록인구" \
  --output var/discovery/population.json
```

---

## 5. Human Review Checklist & Django Admin Activation Gate

To guarantee semantic integrity, automated discovery candidates default to `DRAFT`. Activation requires human confirmation via the Django Admin (`/admin/`):

1. **Verify Metadata**: Confirm organization ID, table ID, items, dimension semantics, and units.
2. **Review Tax Owner**: Ensure city/province vs. district local government tax distinctions are preserved without double-counting.
3. **Approve Region Mappings**: Ensure each source region code (`C1`) correctly maps to a valid `Region` without overlapping valid date ranges.
4. **Approve Item Mappings**: Check that item codes (e.g. `TAX_COL`, `POP_TOTAL`) map to authoritative `Indicator` and `Metric`.
5. **Activate Dataset Version**: Change status to `ACTIVE` only after completing all mapping confirmations.

---

## 6. SGIS Yearly Boundary Acquisition & Loading

Historical boundaries change over time (e.g. 2014 Cheongju/Cheongwon consolidation, Masan integration). Load official SGIS boundary GeoJSON per reference year:

```bash
python manage.py load_boundaries \
  --year 2024 \
  --geojson-file /path/to/sgis_2024.geojson \
  --source-crs "EPSG:5179"
```

*Note: Explicit verified CRS (such as `EPSG:5179`) is required. Boundaries are reprojected to `EPSG:4326` (WGS84) and saved statically at `explorer/static/geo/boundaries/{year}.geojson`.*

---

## 7. Synchronization & Repair Procedures

### Full Live Sync
Once dataset versions are marked `ACTIVE`, run the unified orchestrator:

```bash
# Sync all active dataset versions from 2010 to 2024
python manage.py sync_mvp

# Or sync specific dataset version(s)
python manage.py sync_mvp --dataset-version 1 --dataset-version 2
```

### Repair Mode
If network disruptions or rate limits cause slice failures, invoke repair mode:

```bash
python manage.py sync_mvp --repair
```

---

## 8. Running the Web Application

Start the local development server:

```bash
python manage.py runserver 127.0.0.1:8000
```

Open your browser to:
- **Dashboard**: `http://127.0.0.1:8000/`
- **Admin**: `http://127.0.0.1:8000/admin/`
- **Health Check**: `http://127.0.0.1:8000/health`
- **Semantic APIs**:
  - `GET /api/regions`: Active regions
  - `GET /api/indicators`: Available indicators
  - `GET /api/series?regionId=...&indicatorId=...&from=2010&to=2024`: Time-series data
  - `GET /api/rankings?indicatorId=...&year=2024`: Cross-sectional choropleth map and ranking data

---

## 9. Security & Credential Isolation Guidelines

- **Zero Credential Exposure**: Client-side code and API endpoints **never** receive `KOSIS_API_KEY`, access tokens, or internal credentials.
- **Log Masking**: All query parameter logging redacts `apiKey`, `accessToken`, and authorization headers.
- **Rate Limiting**: Built-in 350ms per-request delay strictly observes KOSIS public API rate limits.
- **Verification**: Run `git grep -n -E "(KOSIS_API_KEY|accessToken)[=:][^[:space:]]+" -- ':!docs/superpowers/*'` before any release.

---

## 10. Backup & Operational Safeguards

- **Immutable RAW Observations**: The `raw_observation` table is insert-only. Re-normalizing or publishing creates audit trails and supersedes rows without destructive deletes.
- **PostgreSQL Data Directory**: Back up PostgreSQL databases (`pg_dump` or filesystem volume snapshots) before any major catalog re-mapping.
- **Local Cache**: The `var/` directory holds discovery manifests and local temporary files; it is ignored by git to protect environment-specific state.
