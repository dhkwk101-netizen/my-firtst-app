# Regional Data Explorer — Architecture Design

Date: 2026-08-31  
Status: Approved through PHASE 8; awaiting written-spec review  
Primary KOSIS source: [KOSIS 공유서비스 개발가이드](../../../KOSIS%20공유서비스%20개발가이드.pdf)

## 1. Product goal

Regional Data Explorer normalizes heterogeneous regional statistics into one semantic model:

```text
Region × Period × Indicator
```

Users select a region, period, indicator, metric, and—where relevant—tax owner. They never need to know KOSIS `orgId`, `tblId`, `itmId`, or `objL1`–`objL8` values.

The first complete vertical slice covers:

- acquisition-tax collections;
- resident population;
- acquisition tax per capita;
- all basic local governments that existed in each year from 2010 through 2024;
- the administrative boundaries for each corresponding year;
- source lineage from every published value to the KOSIS response row.

The system is a regional statistical data platform, not a live proxy or a generic KOSIS table viewer.

## 2. Scope and deliberate exclusions

### 2.1 MVP scope

- PostgreSQL-backed normalized regional data mart.
- Metadata-first KOSIS dataset discovery and human approval.
- Immutable raw KOSIS responses.
- Annual 2010–2024 acquisition-tax collection and resident-population observations.
- A versioned per-capita derived indicator.
- Region trend, national ranking, and historical-boundary choropleth views.
- Source definitions, coverage, freshness, missing-value state, and lineage in the UI.
- A Django modular monolith with separate web and ingestion processes from the same codebase.

### 2.2 MVP non-goals

- All KOSIS statistics.
- Property tax, local income tax, or other indicators beyond the two source series.
- Current-boundary rebasing of historical observations.
- Automatic semantic approval of newly discovered tables.
- A custom registry administration UI; Django Admin is sufficient initially.
- PostGIS, a spatial database service, or live boundary API calls from browsers.
- React, Django REST Framework, Celery, Redis, a message broker, Airflow, Kubernetes, or a data warehouse.
- Authentication, memberships, predictive analytics, AI analysis, or a mobile application.
- Scatter plots, correlations, peer groups, or a general BI engine.

## 3. Source contracts

### 3.1 KOSIS contract

The attached KOSIS guide is the controlling source for KOSIS behavior. Implementation must not infer source codes from labels or examples.

Primary APIs:

| Purpose | API |
|---|---|
| Standard parameter data | `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList` |
| Registered statistics data | `https://kosis.kr/openapi/statisticsData.do?method=getList` |
| Integrated search | `https://kosis.kr/openapi/statisticsSearch.do?method=getList` |
| Statistics-list traversal | `https://kosis.kr/openapi/statisticsList.do?method=getList` |
| Metadata | `https://kosis.kr/openapi/statisticsData.do?method=getMeta` |
| Big-data fallback | `https://kosis.kr/openapi/statisticsBigData.do?method=getList` |

The standard request uses `apiKey`, `orgId`, `tblId`, `objL1`, `itmId`, `prdSe`, and `format`; optional dimensions extend through `objL8`. A ranged request uses `startPrdDe` and `endPrdDe`; a latest-period request uses `newEstPrdCnt`. The adapter requests `smblChk=Y` so statistical symbols remain distinguishable from numbers.

The raw response contract includes:

- organization and table: `ORG_ID`, `TBL_ID`, `TBL_NM`;
- classifications: `C1`–`C8`, their object names, and member names;
- item and unit: `ITM_ID`, `ITM_NM`, `UNIT_ID`, `UNIT_NM`;
- period: `PRD_SE`, `PRD_DE`;
- value: string field `DT`;
- update field: `LST_CHN_DE`.

Metadata types used during discovery are `TBL`, `ORG`, `PRD`, `ITM`, `CMMT`, and `UNIT`, with `SOURCE`, `WGT`, and `NCD` retained when available and relevant.

Operational limits and error behavior:

- no more than 200 calls per minute; the application limits itself to one request start per 350 ms;
- no more than 40,000 cells per standard request;
- big-data mode is a fallback, not the default, and has separate SDMX/XLS limits;
- an error body can be XML even when JSON was requested, so parsing must inspect content rather than assume the requested format;
- authentication errors 10/11 stop the job;
- parameter errors 20/21 require a registry or request correction;
- no-result error 30 becomes an explicit empty result subject to coverage checks;
- result/row-limit errors 31/41 cause request splitting;
- call/user-limit errors 40/42 cause delayed retry;
- server error 50 receives bounded retry.

### 3.2 Intentionally unbound KOSIS identifiers

No concrete value is specified in this design for:

- `orgId`;
- `tblId`;
- `itmId`;
- the semantic meaning or member codes of `objL1`–`objL8`;
- source region codes;
- source unit codes.

These values are `UNKNOWN` until PHASE 6 discovery reads official metadata and a sample response. A DatasetVersion cannot become `ACTIVE` while any required source identifier, dimension, item, unit, region mapping, or tax-owner meaning remains unverified.

### 3.3 Historical-boundary contract

The primary historical-boundary source is the official SGIS administrative-boundary API described in the [SGIS OpenAPI definition](https://sgis.kostat.go.kr/developer/upload/doc/SGIS_OpenAPI_%EC%A0%95%EC%9D%98%EC%84%9C.pdf):

```text
https://sgisapi.mods.go.kr/OpenAPI3/boundary/hadmarea.geojson
```

The API takes `year`, `adm_cd`, and `low_search`, requires an access token, and documents boundary years 2000–2025. This covers the target 2010–2024 range.

SGIS `adm_cd` is treated as its own external code system. It is never assumed to equal a KOSIS or administrative code. The source exposes a reference year, not a guaranteed calendar-day reference date; the platform must not invent one.

## 4. Architecture

```text
Browser
  │
  ▼
Django Web / Application API
  │
  ▼
Semantic Query Service
  │
  ▼
PostgreSQL Regional Mart

Operator or OS Scheduler
  │
  ▼
Django Ingestion Command
  ├─ Metadata Discovery ──► Dataset Registry review
  ├─ Query Planner
  ├─ KOSIS Adapter
  ├─ Immutable RAW
  ├─ Normalizer + Data Quality
  ├─ Atomic observation publish
  └─ Derived Indicator Calculator

SGIS Boundary Acquisition
  ├─ immutable source GeoJSON
  └─ validated, transformed, simplified yearly web GeoJSON
```

### 4.1 Layer rules

- The frontend and application API know only semantic identifiers.
- Only the KOSIS adapter knows KOSIS request and response field names.
- Browser queries read PostgreSQL; they do not call KOSIS or SGIS.
- Source credentials are injected server-side immediately before requests.
- Discovery proposes mappings; a human activates them.
- RAW is insert-only and sufficient for re-normalization without another KOSIS call.
- The mart exposes only published observations.

### 4.2 Process boundaries

The web process and ingestion worker are separate OS processes but share one Django codebase and PostgreSQL database. The MVP uses a single ingestion worker and the OS scheduler. No queue infrastructure is introduced until measured concurrency requires it.

## 5. Domain model

### 5.1 Region

`Region` is a stable internal identity, not an official-code string. Codes, names, parents, and geometry can change independently over time.

- `RegionIdentifier` stores a code system, code, source, and valid period.
- `RegionName` stores official and alternate names with valid periods.
- `RegionRelation` records hierarchy and historical relationships.
- `BoundaryFeature` links a region to a yearly BoundarySet feature.

Supported relation types are `PARENT_OF`, `RENAMED_TO`, `RECODED_TO`, `SPLIT_TO`, `MERGED_TO`, and `ABSORBED_INTO`.

Comparison geography is `BASIC_LOCAL_GOVERNMENT`: city, county, or autonomous district. General districts and administrative cities can remain in the region catalog for display and mapping but are not silently mixed into rankings. Historical data is not reassigned to current regions.

### 5.2 Period

`Period` has a type, key, start, end, and reference date when the source provides one. It supports annual, quarterly, monthly, daily, half-year, multi-year, and irregular periods. The MVP publishes annual observations only.

Monthly or quarterly values are never automatically aggregated to annual values. An Indicator's aggregation method must authorize any later conversion.

### 5.3 Indicator and tax semantics

`Indicator` is source-independent. `Metric`, `Unit`, `TaxOwner`, and `TaxType` are separate concepts.

MVP semantic series:

| Indicator | Metric | Tax owner | Canonical unit |
|---|---|---|---|
| `ACQUISITION_TAX` | `COLLECTED` | metadata-confirmed owner | `KRW` |
| `RESIDENT_POPULATION` | `COUNT` | `NOT_APPLICABLE` | `PERSON` |
| `ACQUISITION_TAX_PER_CAPITA` | derived | inherited and documented | `KRW_PER_PERSON` |

`ASSESSED`, `COLLECTED`, `ARREARS`, `REFUND`, and count values are distinct metrics. Collection agency and tax-revenue owner are not treated as the same concept. A source tax name and canonical TaxType are mapped through a versioned, period-bound TaxMappingRule.

### 5.4 Observation and values

An Observation contains semantic keys, the normalized numeric value, raw value, value status, symbol, quality state, lineage, and publication state.

Value states include at least `PRESENT`, `MISSING`, `NOT_APPLICABLE`, `UNKNOWN`, and `SUPPRESSED`. Zero is a real number and never represents missingness.

Source values and source units are preserved. Unit conversion is a versioned normalization rule, and currency amounts use exact numeric arithmetic.

### 5.5 Derived indicators

Derived indicators use named evaluator implementations and versioned parameters rather than arbitrary stored SQL.

```text
ACQUISITION_TAX_PER_CAPITA
  = ACQUISITION_TAX:COLLECTED / RESIDENT_POPULATION:COUNT
```

Both inputs must have the same Region and Period, be present and comparable, and use compatible canonical units. A zero or missing denominator yields a missing derived value. Each derived Observation records its exact input observations and formula version.

## 6. PostgreSQL design

Schemas separate responsibility:

```text
geo       region identities, history, boundary versions
semantic indicators, units, periods, derivations
catalog   Dataset Registry and authoritative-source assignments
ingest    jobs, slices, immutable KOSIS RAW
mart      published source and derived observations
```

Common conventions:

- `bigint generated always as identity` primary keys;
- `text` for strings;
- `timestamptz` for timestamps;
- `numeric(38,10)` for normalized exact values;
- `text` plus check constraints for controlled statuses;
- `daterange` for validity;
- an index on every foreign-key lookup path;
- `btree_gist` exclusion constraints where validity ranges must not overlap;
- no early table partitioning, GIN, BRIN, or broad speculative indexes.

### 6.1 `geo`

| Table | Role and key rules |
|---|---|
| `region` | Stable identity. Unique `region_key`; indexed by level/status; GiST validity index. |
| `region_identifier` | External code with valid period. No overlapping period for the same code system and code. |
| `region_name` | Official/alternate names with validity. Lowercase name search is for discovery only, never joins. |
| `region_relation` | Source/target region, relation type, validity, and reason. Both region FKs indexed. |
| `boundary_set` | Source, reference year, optional source-provided reference date, asset URI, checksum, status. One active set per year. |
| `boundary_feature` | BoundarySet-to-Region mapping and feature checksum. Unique by set/region and set/feature key. |

### 6.2 `semantic`

| Table | Role and key rules |
|---|---|
| `period` | Unique period key, type, start/end/reference date, and optional BoundarySet. |
| `unit` | Unique semantic unit key, name, dimension, and symbol. |
| `metric` | Unique metric key, name, and description. |
| `tax_owner` | Unique owner key; initial values include `NOT_APPLICABLE`, `UPPER_LOCAL_GOVERNMENT`, and `BASIC_LOCAL_GOVERNMENT`. Source labels such as 시세 and 도세 remain separately traceable. |
| `indicator` | Unique semantic key plus definition, category, unit, value type, aggregation, geography, frequency, source/derived type, and status. |
| `derived_indicator` | Indicator, formula version, evaluator key, JSON parameters, output unit, status, and checksum. One active version per indicator. |
| `derived_indicator_input` | Formula role to source indicator/metric/owner. Primary key is derived indicator plus role. |
| `tax_type` | Canonical tax type with Indicator and valid period. |

### 6.3 `catalog`

| Table | Role and key rules |
|---|---|
| `dataset_family` | Groups tables that express one logical source family. Unique family key. |
| `dataset` | Physical KOSIS table identity. Unique provider/organization/table and dataset key. |
| `dataset_version` | Immutable approved metadata snapshot, validity, checksum, and lifecycle. Unique dataset/version and dataset/checksum; one active version per Dataset. |
| `dataset_dimension` | Maps a discovered source classification to a semantic dimension with `ALL_MAPPED` or `FIXED` strategy. |
| `dataset_item_mapping` | Period-bound source item to Indicator/Metric/TaxOwner mapping with source unit and comparability. |
| `dataset_region_mapping` | Period-bound source region member to internal Region. Overlapping mappings are prohibited. |
| `tax_mapping_rule` | Period-bound source tax code/name to canonical TaxType and comparability. |
| `indicator_source_assignment` | Period-bound authoritative DatasetVersion for Indicator/Metric/Owner/geography. Overlapping authoritative assignments are prohibited. |
| `normalization_rule` | Versioned named conversion or parsing rule, parameters, checksum, and status. |

### 6.4 `ingest`

| Table | Role and key rules |
|---|---|
| `ingestion_job` | DatasetVersion, job type/status, idempotency key, timestamps, counts, metadata checksum, and error. Unique idempotency key. |
| `ingestion_slice` | Sanitized request parameters, slice key, status, attempts, next attempt, counts, and errors. Unique job/slice key; pending/retry partial index. |
| `raw_observation` | Insert-only KOSIS row containing organization/table, C1–C8 and names/object names, item, unit, period, `DT`, symbol, update value, full payload, source-row hash, and collection time. Unique job/source-row hash. |

### 6.5 `mart`

| Table | Role and key rules |
|---|---|
| `observation` | Region, Period, Indicator, Metric, TaxOwner, exact value, canonical unit, value state, symbol, quality, source or derived lineage, normalization rule, publication/supersession times. Exactly one source lineage or derived lineage is required. |
| `observation_input` | Derived observation to exact input observation and role. Primary key is derived observation plus role; self-links prohibited. |

Active source and derived observations have separate partial unique constraints. Primary read indexes are:

- `(region_id, indicator_id, metric_id, period_id)` for series;
- `(indicator_id, metric_id, period_id, region_id)` for maps and rankings;
- both limited to published, non-superseded rows.

The API database role is read-only, the worker can write ingestion and publication data, and only migrations can change DDL. Material rows are superseded rather than hard-deleted.

## 7. Dataset Registry

### 7.1 Registry lifecycle

```text
DRAFT → VALIDATING → ACTIVE → NEEDS_REVIEW → RETIRED
```

An activated version's mappings are immutable. On metadata drift, collection pauses, a new DatasetVersion is created and reviewed, and activation retires the previous version atomically. Existing published observations and lineage remain valid.

### 7.2 Source-shape patterns

Pattern A is a national table containing a source geography dimension. One Dataset maps that classification's members to Regions.

Pattern B is a family of region- or tax-owner-specific tables, like the observed `중구(시세)` and `중구(구세)` labels. Each physical table remains a Dataset, while DatasetFamily groups them. Region and TaxOwner can be fixed semantic dimensions when no source axis exists. City-tax and district-tax observations are never automatically summed.

### 7.3 Activation checks

- Official organization, table, item, classification, and unit identifiers are confirmed.
- Every required C1–C8 role is known; no classification position is assumed.
- Source region mapping reaches 100% for the intended scope or every exclusion is explicit.
- Region level, period coverage, frequency, tax owner, unit, value/symbol behavior, and comments are verified.
- Sample rows contain no unresolved semantic duplicate.
- The authoritative assignment does not overlap another assignment.
- Metadata snapshot and checksum are present.

## 8. KOSIS discovery workflow

The recommended approach is search-first, sibling expansion, metadata fingerprinting, and human approval. Manual table-by-table registration is a fallback; a complete KOSIS catalog crawl is out of scope.

```text
semantic discovery intent
  → integrated search for anchor tables
  → statistics-list traversal for sibling tables
  → metadata retrieval
  → dimension and item analysis
  → structural fingerprint groups
  → minimal sample request
  → annual region coverage matrix
  → human authoritative-source review
  → ACTIVE DatasetVersion
```

Search terms help locate candidates but never prove meaning. Titles may group candidates for review, but metadata and sample responses control mappings.

For each candidate, discovery retains the search/list response, metadata response, canonicalized metadata checksum, dimension analysis, item suggestions, coverage results, warnings, and proposed Registry manifest. Credentials are stripped.

Sample validation covers the earliest target year, 2024, a normal region, a boundary-change case, and an ambiguous-name case. For table-per-region families, structurally identical candidates share a review batch but retain individual table IDs and checksums.

For every year, source region members are compared with the Regions valid in that year. The report separates mapped, missing, duplicate, total, general-district, administrative-city, and otherwise out-of-scope members. Names are never the production join key.

Candidate ranking prefers a single official national table with complete coverage, then a structurally consistent table family, then partial auxiliary tables. Ranking orders review; only a human makes the authoritative selection.

## 9. Query Planner

Browser queries never produce KOSIS requests. The planner consumes a server-side IngestionIntent:

- indicators and metrics;
- optional tax owners;
- region level or Region set;
- period range and frequency;
- `FULL`, `REFRESH`, or `REPAIR` mode.

Planning resolves authoritative assignments and intersects DatasetVersion, item mapping, region mapping, and source-assignment validity. A source change inside the requested period creates multiple requests rather than a fabricated continuous source.

Source classifications with source dimensions become `objL1`–`objL8` selections from the Registry. Fixed semantic context without a source axis is carried to normalization and is not sent to KOSIS.

Estimated cells are:

```text
period count × item count × product(selected member counts for C1–C8)
```

The planner keeps requests at or below 40,000 cells. It splits contiguous period ranges first, then region members, then items. If KOSIS still returns a size error, the Slice is bisected rather than retried unchanged.

All Slices are persisted before collection. A sanitized normalized request, DatasetVersion, and metadata checksum form a SHA-256 `slice_key`; the API key is excluded. Statuses are `PENDING`, `RUNNING`, `SUCCESS`, `SUCCESS_EMPTY`, `RETRY`, and `FAILED`. Restart resumes pending/retry Slices and skips successful keys.

The MVP uses one worker and at least 350 ms between request starts. Authentication and parameter errors are not retried; limit and transport/server errors receive bounded backoff. Successful RAW rows remain even if sibling Slices fail. Publication is a later Data Quality decision.

Before refresh, the worker compares source update information and the metadata checksum. No change means skip. A source update with the same structure causes a full 2010–2024 refresh; the small fixed range makes this safer and simpler than row-diff inference. A structural change moves the DatasetVersion to `NEEDS_REVIEW` and blocks collection.

## 10. Normalization, quality, publication, and lineage

Normalization reads RAW and an immutable Registry version. It:

1. resolves source classification members to semantic dimensions;
2. resolves the historical Region for the observation period;
3. parses `DT` without equating symbols or empty values to zero;
4. retains source value, source unit, and symbol;
5. applies a versioned unit conversion when authorized;
6. creates a staged Observation with exact RAW and rule lineage.

Required quality checks include dimension presence, period parsing, region and unit mapping, numeric parsing, duplicate semantic keys, expected coverage, unexpected row-count decline, comparability, and source checksum consistency. Errors are recorded; they are never silently dropped.

Publication is transactional: insert validated new observations, supersede replaced active rows, mark the new rows published, and close the job successfully. A failed Slice cannot be normalized as if it succeeded. Rankings include coverage state, and incomplete nationwide coverage is either withheld or explicitly warned.

Lineage for a source value is:

```text
Observation
  → RawObservation
  → DatasetVersion and mappings
  → KOSIS organization/table/item/classifications
  → source unit and period
  → ingestion job and collection time
  → normalization rule
```

Derived lineage adds formula version and exact input Observation IDs.

## 11. Historical boundaries

For each year 2010–2024, the server acquires SGIS source GeoJSON, preserves it immutably with a checksum, validates its year and code properties, transforms it to a web-compatible GeoJSON coordinate system after source-CRS verification, performs topology-preserving simplification, and writes a versioned static asset.

```text
/geo/boundaries/2010.geojson
...
/geo/boundaries/2024.geojson
```

Each feature has a platform `featureKey` mapped through `boundary_feature` to the Region valid in that year. `/api/rankings` returns the same key, value state, Region, and value. Missing observations are gray, out-of-scope regions are visibly distinct, and zero remains a valid mapped value.

An annual Observation uses the BoundarySet for the same reference year. Exact calendar-day semantics are not inferred from SGIS. Historical polygons and observations are not reprojected onto present-day administrative units.

## 12. Application API and UI

Minimal APIs:

| Endpoint | Contract |
|---|---|
| `GET /api/regions?year=YYYY` | Regions valid for the selected year and comparison status. |
| `GET /api/indicators` | Published indicators, metrics, tax-owner choices, units, and definitions. |
| `GET /api/series` | One or more semantic series for Region(s) and period range, with lineage summary. |
| `GET /api/rankings` | One indicator/metric/owner/year, coverage, boundary version/URL, ranked values, and feature keys. |
| `GET /geo/boundaries/{year}.geojson` | Static historical boundary asset. |

KOSIS parameters are absent from client input. Source organization, table, original unit, update time, collection time, comments, and quality/coverage are included in response metadata.

The MVP has two views:

1. Region trend: region and period filters, latest value, year-over-year change, CAGR when comparable, coverage, separate aligned charts for incompatible units, a raw-value table, definition, and source.
2. National map/ranking: year, Indicator, Metric, and TaxOwner filters; historical choropleth; clear missing/out-of-scope encoding; tooltip; ranking; coverage and freshness.

Tax and population do not share one Y axis. Cards, charts, maps, and tables use the same semantic query and metric definitions so they reconcile.

## 13. Security and operations

- `KOSIS_API_KEY` and the SGIS credential exist only in server environment configuration.
- Credentials are redacted from logs, persisted request parameters, hashes, fixtures, and errors.
- The API database role is read-only.
- Trust-boundary inputs use explicit allowlists for indicators, metrics, periods, and region IDs.
- Source payload size and content type are checked before parsing.
- Ingestion logs contain job/slice IDs, sanitized source identity, attempts, latency, row counts, normalization failures, and terminal error codes.
- Required operational summaries are last successful ingestion, last source update, coverage, retry count, and unresolved quality failures.
- No external observability stack is required for the MVP; structured application logs and database job records are sufficient.

## 14. Testing strategy

Tests rely primarily on versioned fixtures, not live KOSIS or SGIS calls.

### 14.1 Unit tests

- KOSIS JSON and XML-error parsing.
- Value/symbol/missing-state parsing.
- Dimension, item, unit, tax, and Region mapping.
- Valid-period source selection.
- Request cell estimation and splitting.
- Idempotency key stability.
- Per-capita, year-over-year, and CAGR calculations.
- Boundary feature-to-Region mapping.

### 14.2 Contract tests

- Sanitized real sample response fixtures for each approved Dataset shape.
- A national geography-axis table fixture.
- A fixed-region/fixed-tax-owner table fixture.
- A KOSIS XML error fixture returned to a nominal JSON request.
- SGIS yearly boundary fixtures for at least one unchanged year and one changed-boundary case.

### 14.3 Integration tests

- Discovery metadata to proposed Registry manifest.
- Planner to persisted Slice checkpoint.
- RAW to normalized published Observation.
- Re-normalization from RAW after a rule-version change.
- Derived input lineage.
- Series and ranking API reconciliation.
- Yearly ranking values joining only to the matching BoundarySet.

### 14.4 Data-quality tests

- Duplicate Region/Period/Indicator/Metric/Owner observations.
- Unknown Region or unit.
- Missing required source classification.
- Coverage loss versus the expected historical Region set.
- Zero versus missing.
- Incompatible tax mapping across a reform period.
- Metadata checksum drift blocking collection.

Live-source smoke tests are explicit operator actions and are not required for every test run.

## 15. MVP delivery and acceptance

Delivery order:

1. one common pipeline proven with Seongbuk-gu for 2010–2024;
2. the same Registry and code expanded nationwide;
3. yearly boundaries and national ranking/map connected through `featureKey`.

Acceptance requires:

- Seongbuk-gu acquisition-tax collections for 2010–2024;
- resident population for the same Region and periods;
- reproducible acquisition tax per capita;
- the same code path for every basic local government valid in each year;
- map-year changes loading the matching 2010–2024 boundary set;
- explicit missing, zero, and out-of-scope states;
- no automatic city-tax/district-tax summation;
- value-to-RAW lineage;
- visible dataset, organization, unit, update time, collection time, and caveats;
- API/ranking coverage reporting;
- no KOSIS or SGIS credential in the browser or logs;
- fixture-based repeatability without live source access.

## 16. Explicit architecture answers

**Q1. How are different geography dimensions connected?**  
Source member codes map through period-bound DatasetRegionMapping to a stable Region. Names are review aids only.

**Q2. How are different `objL1`–`objL8` meanings handled?**  
DatasetDimension records the discovered source axis and semantic role for each DatasetVersion. Only the adapter consumes the resulting source selections.

**Q3. How are unknown items such as acquisition tax and population found?**  
Integrated search finds candidates; list traversal finds siblings; metadata and sample calls expose dimensions/items/units; a human approves the mapping.

**Q4. How is one authoritative source selected?**  
Coverage, semantic clarity, frequency, consistency, update information, and directness rank candidates. A human approves a period-bound IndicatorSourceAssignment, with non-overlap enforced in PostgreSQL.

**Q5. What happens after an administrative-code change?**  
The stable Region, period-bound identifiers, relations, and yearly BoundarySets preserve the historical state. Old data is not overwritten with current codes.

**Q6. How are annual, quarterly, and monthly data stored?**  
The Period model stores explicit types and boundaries. Different frequencies remain separate unless an Indicator-authorized versioned aggregation is later added.

**Q7. How is chart lineage traced?**  
Published Observation → RAW row → DatasetVersion/mappings → KOSIS table/item/classifications/unit → job/time → normalization rule. Derived rows also point to exact inputs and formula version.

**Q8. How are tax reforms represented?**  
Source tax and canonical TaxType are period-bound through TaxMappingRule with an explicit comparability state and reason. Name equality never proves continuity.

**Q9. How are KOSIS request limits handled?**  
The Planner estimates cells, splits period/region/item deterministically, persists idempotent Slices, rate-limits one worker, and bisects actual size failures.

**Q10. How is metadata drift detected?**  
Canonical metadata snapshots are checksummed. Structural drift marks the active DatasetVersion `NEEDS_REVIEW`, blocks collection, and requires a new approved version.

## 17. Implementation gate

This document authorizes no production implementation by itself. The next artifact, after user review, is PHASE 9: a file-by-file implementation plan with a runnable check for each non-trivial step. Actual KOSIS identifiers enter that plan only after Discovery has verified them; they are never fabricated to make an example executable.
