# WTF LivePulse — Real-time Gym Operations Dashboard

> Production-grade operations dashboard for WTF Gyms (Witness The Fitness) — 50+ locations, 26,000+ members, live WebSocket updates.

---

## 1. Quick Start

**Prerequisite:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) — nothing else.

```bash
docker compose up
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| Backend API | http://localhost:3001/api |
| WebSocket | ws://localhost:3001 |

The first boot seeds the database automatically (gyms → members → 270,000 check-ins → payments → anomaly scenarios). Seed progress is printed to Docker logs. All three anomaly scenarios (Velachery zero check-ins, Bandra West capacity breach, Salt Lake revenue drop) are detectable within 30 seconds of startup.

To reset to a clean state:

```bash
docker compose down -v   # removes the postgres volume
docker compose up        # re-seeds from scratch
```

---

## 2. Architecture Decisions

### Why BRIN on `checkins.checked_in`

`checkins` is a purely append-only time-series table — rows are inserted in roughly chronological order and never updated on the `checked_in` column. BRIN (Block Range INdex) stores only the min/max `checked_in` timestamp per disk page block rather than one entry per row. With ~270,000 historical rows this keeps the index under 50 KB compared to several MB for a B-Tree, and date-range queries still eliminate the vast majority of blocks in one pass. A B-Tree on a monotonically increasing column in an append-only table is pure waste; BRIN is the textbook answer.

### Why a partial index for live occupancy (`idx_checkins_live_occupancy`)

```sql
CREATE INDEX idx_checkins_live_occupancy
    ON checkins (gym_id, checked_out)
    WHERE checked_out IS NULL;
```

Live occupancy (`COUNT(*) WHERE gym_id = $1 AND checked_out IS NULL`) is the single most frequent query in the system — fired every time the simulator generates a check-in or checkout, and on every `/api/gyms` request. At any given moment only a few hundred rows are "open" out of 270,000+. The partial index covers only those open rows, making it orders of magnitude smaller than a full index. PostgreSQL keeps this index almost entirely in shared memory, so every live-occupancy query is an index-only scan with sub-millisecond latency regardless of historical table size.

### Why a partial index for churn risk (`idx_members_churn_risk`)

```sql
CREATE INDEX idx_members_churn_risk
    ON members (last_checkin_at)
    WHERE status = 'active';
```

Churn risk queries only care about active members. Inactive and frozen members are irrelevant and would bloat a full index. The partial predicate reduces the index to roughly 85% of the member table (active members only), and `last_checkin_at` ordering lets PostgreSQL satisfy the `< NOW() - INTERVAL '45 days'` filter with a single range scan rather than a full table read.

### Why a partial index for active anomalies (`idx_anomalies_active`)

```sql
CREATE INDEX idx_anomalies_active
    ON anomalies (gym_id, detected_at DESC)
    WHERE resolved = FALSE;
```

At any point in time the number of active (unresolved) anomalies is tiny — typically 2–4 rows across all 10 gyms. The partial index covers only that tiny subset. It fits entirely in PostgreSQL's buffer cache, making anomaly queries effectively free (< 0.2ms). Resolved anomalies, which accumulate over time, are excluded entirely.

### Why a composite index for payments (`idx_payments_gym_date`)

```sql
CREATE INDEX idx_payments_gym_date
    ON payments (gym_id, paid_at DESC);
```

The today's-revenue query pattern is always `WHERE gym_id = $1 AND paid_at >= CURRENT_DATE`. A composite index with `gym_id` first lets PostgreSQL jump directly to one gym's rows, then use the `paid_at DESC` ordering to scan only today's entries — covering both the equality filter and the date range in a single index scan with no heap reads for the `SUM`. A separate index on just `gym_id` or just `paid_at` would force a two-step filter, which is slower.

### Why a materialized view for the heatmap (`gym_hourly_stats`)

```sql
CREATE MATERIALIZED VIEW gym_hourly_stats AS
  SELECT gym_id,
         EXTRACT(DOW  FROM checked_in)::int AS day_of_week,
         EXTRACT(HOUR FROM checked_in)::int AS hour_of_day,
         COUNT(*)                           AS checkin_count
  FROM checkins
  WHERE checked_in >= NOW() - INTERVAL '7 days'
  GROUP BY gym_id, day_of_week, hour_of_day;
```

A `GROUP BY` aggregation over 270,000 rows on every heatmap request would be expensive (tens of milliseconds, sequential scan territory). The materialized view pre-computes the result into ~97 rows (10 gyms × 7 days × ~1.4 non-zero hour slots). Heatmap queries become a simple `SELECT * WHERE gym_id = $1` on a 97-row relation. The view is refreshed `CONCURRENTLY` every 15 minutes via a background cron job, which requires the unique index on `(gym_id, day_of_week, hour_of_day)`.

### Seq Scan on the materialized view and anomalies — intentional, not a bug

PostgreSQL's query planner correctly chose a sequential scan for `gym_hourly_stats` (Q4, ~97 rows) and `anomalies WHERE resolved = FALSE` (Q6, typically 2–4 rows). At these table sizes a seq scan is faster than an index scan because the entire relation fits in a single buffer page. The execution times of 0.129ms and 0.138ms respectively confirm this is optimal. No fix is needed; the planner is doing the right thing. Sequential scans on `checkins` and `payments` — the hard rejection criteria — do not occur.

---

## 3. AI Tools Used

**Claude Code (Anthropic)** was used throughout this project. Full disclosure of what it contributed:

| Area | What Claude Code generated |
|---|---|
| Folder & file scaffolding | `docker-compose.yml`, `Dockerfile` for both services, `.env.example`, initial `package.json` files |
| SQL migrations | `001_initial.sql` (all 5 tables with constraints), `002_indexes.sql` (all 8 indexes), `003_materialized_view.sql` |
| Seed script | `seed.sql` — gym rows, `generate_series()`-based bulk check-in insert (~270k rows), member name pools, churn-risk seeding logic, all three anomaly scenarios |
| Backend Express app | `app.js`, all four route files (`gyms`, `anomalies`, `analytics`, `simulator`), all three service files (`statsService`, `anomalyService`, `simulatorService`), WebSocket server and broadcast layer, cron jobs |
| Anomaly detection | Detection logic for all three types (`zero_checkins`, `capacity_breach`, `revenue_drop`) and auto-resolve conditions |
| React frontend | Component scaffolding, Zustand store structure, `useWebSocket` hook, Recharts integration, Tailwind dark-theme layout |
| Test boilerplate | Unit test file structure, mock setup patterns, integration test skeleton with Supertest |

All **architecture decisions** — which index type to use, why BRIN vs B-Tree, the partial index strategy, the materialized view refresh interval, the WebSocket event schema, anomaly thresholds — were designed and verified manually. Claude Code was the implementation accelerator; every generated file was reviewed, corrected where needed, and adapted to the specific production requirements of this assignment.

---

## 4. Query Benchmarks

All results from `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` against the seeded dataset (5,000 members, ~270,000 check-in rows, 90 days of history). Screenshots are in [`/benchmarks/screenshots/`](benchmarks/screenshots/).

| # | Query | Measured Time | Index Used |
|---|---|---|---|
| Q1 | Live occupancy — `COUNT(*) WHERE gym_id=$1 AND checked_out IS NULL` | **0.141 ms** | `idx_checkins_live_occupancy` (partial B-Tree) |
| Q2 | Today's revenue — `SUM(amount) WHERE gym_id=$1 AND paid_at >= CURRENT_DATE` | **0.380 ms** | `idx_payments_gym_date` (composite B-Tree) |
| Q3 | Churn risk members — `WHERE status='active' AND last_checkin_at < NOW()-'45 days'` | **0.552 ms** | `idx_members_churn_risk` (partial B-Tree) |
| Q4 | Peak hour heatmap — `SELECT * FROM gym_hourly_stats WHERE gym_id=$1` | **0.129 ms** | Materialized view seq scan (97 rows — optimal) |
| Q5 | Cross-gym revenue — `SUM(amount) GROUP BY gym_id WHERE paid_at >= NOW()-'30 days'` | **1.774 ms** | `idx_payments_date` (B-Tree on `paid_at DESC`) |
| Q6 | Active anomalies — `SELECT * FROM anomalies WHERE resolved=FALSE` | **0.138 ms** | `idx_anomalies_active` seq scan (2–4 rows — optimal) |

All six queries are within their CLAUDE.md targets. No sequential scan occurs on `checkins` or `payments`.

---

## 5. Known Limitations


**Q4 and Q6 show Seq Scan in EXPLAIN output — this is correct behaviour, not a failure.** `gym_hourly_stats` has ~97 rows after seeding and `anomalies WHERE resolved=FALSE` typically has 2–4 rows. PostgreSQL's planner correctly determines that reading the entire (tiny) relation from one buffer page is faster than traversing a B-Tree. The 0.129ms and 0.138ms execution times confirm there is no performance problem. The automatic-failure criterion in the spec ("sequential scan on checkins or payments") does not apply to these two relations.
