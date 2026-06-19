# DeskPulse

> Real-time operations intelligence dashboard for co-working space chains.

![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-live-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## What is DeskPulse

DeskPulse gives operations managers of co-working space chains live visibility across every location simultaneously — who is present right now, revenue for the day, active anomalies, peak hour patterns, and member churn risk. It is built for small-to-mid co-working chains (3–15 locations) who currently rely on end-of-day reports, WhatsApp updates, and manual spreadsheets to understand what is happening across their portfolio.

The dashboard updates in real time via WebSocket — no polling, no page refreshes. A check-in at any location appears in the activity feed and increments the occupancy counter within one second. A payment updates the revenue ticker immediately. An anomaly — overbooking, revenue drop, no-show spike, or an idle location — surfaces as a badge and a toast notification the moment it is detected.

DeskPulse runs entirely in Docker. A single `docker compose up` starts the database, seeds 90 days of realistic historical data across 10 locations and 5,000 members, starts the backend with the anomaly detector and simulation engine, and serves the frontend — no manual steps, no host dependencies.

---

## ✨ Features

- **Live occupancy counter** per location with capacity percentage and colour-coded thresholds (green / yellow / red)
- **Real-time revenue ticker** that updates as payments arrive via WebSocket
- **Automated anomaly detection** — no activity, overbooking, revenue drop, and high no-show rate, running every 30 seconds
- **7-day peak hours heatmap** per location, served from a pre-computed materialized view
- **Member churn risk panel** showing expiring memberships (≤ 7 days) and inactive members (no check-in in 30+ days)
- **Cross-location revenue comparison** chart across all locations for the last 30 days
- **Data simulation engine** with start / pause controls and 1×, 5×, 10× speed multipliers for realistic load testing
- **WebSocket-powered activity feed** showing live check-ins, check-outs, and payments without any polling

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js 20, Express 4, ws (WebSocket), node-cron |
| **Database** | PostgreSQL 15 — BRIN indexes, partial indexes, materialized views |
| **Frontend** | React 18, Vite, TailwindCSS, Zustand, Recharts |
| **Infrastructure** | Docker Compose, nginx |

---

## 🚀 Quick Start

**Prerequisite:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) — nothing else.

```bash
docker compose up
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| Backend API | http://localhost:3001/api |
| WebSocket | ws://localhost:3001 |

The first boot seeds the database automatically — 10 co-working locations across 6 Indian cities, 1,500 members with realistic plan distribution, 90 days of check-in history (~90,000 records), and 4 pre-built anomaly scenarios that are detectable within 30 seconds of startup.

Seed progress is printed to Docker logs. Watch with:

```bash
docker compose logs -f db
```

To reset to a clean state:

```bash
docker compose down -v   # removes the postgres volume
docker compose up        # re-seeds from scratch
```

---

## 🏗 Architecture

### Database Design Decisions

#### BRIN on `checkins.checked_in`

`checkins` is a purely append-only time-series table — rows are inserted in roughly chronological order and never updated on the `checked_in` column. BRIN (Block Range INdex) stores only the min/max `checked_in` timestamp per disk page block rather than one entry per row. With ~90,000 historical rows, this keeps the index under 20 KB compared to several MB for a B-Tree, and date-range queries still eliminate the vast majority of blocks in one pass. A B-Tree on a monotonically increasing column in an append-only table is pure waste; BRIN is the correct choice.

#### Partial index for live occupancy (`idx_checkins_live_occupancy`)

```sql
CREATE INDEX idx_checkins_live_occupancy
    ON checkins (location_id, checked_out)
    WHERE checked_out IS NULL;
```

Live occupancy (`COUNT(*) WHERE location_id = $1 AND checked_out IS NULL`) is the most frequent query in the system — fired on every check-in event, every check-out event, and every `/api/locations` request. At any given moment only a few hundred rows are open out of 90,000+. The partial index covers only those open rows, making it orders of magnitude smaller than a full index. PostgreSQL keeps it almost entirely in shared memory, so every live-occupancy query is an index-only scan with sub-millisecond latency regardless of how large the historical table grows.

#### Partial index for membership churn risk (`idx_memberships_churn_risk`)

```sql
CREATE INDEX idx_memberships_churn_risk
    ON memberships (end_date)
    WHERE status = 'active';
```

Churn risk queries only care about active memberships. Expired, cancelled, and paused memberships are irrelevant and would bloat a full index. The partial predicate excludes those rows entirely, and the `end_date` ordering lets PostgreSQL satisfy the `end_date <= NOW() + INTERVAL '7 days'` filter with a single forward range scan rather than a full table read.

#### Partial index for active anomalies (`idx_anomalies_active`)

```sql
CREATE INDEX idx_anomalies_active
    ON anomalies (location_id, detected_at DESC)
    WHERE resolved = FALSE;
```

At any point in time the number of unresolved anomalies is tiny — typically 2–4 rows across all 10 locations. The partial index covers only that subset and fits entirely in PostgreSQL's buffer cache, making anomaly queries effectively free (< 0.2ms). Resolved anomalies, which accumulate over time, are excluded entirely from the index.

#### Composite index for payments (`idx_payments_location_date`)

```sql
CREATE INDEX idx_payments_location_date
    ON payments (location_id, paid_at DESC);
```

The today's-revenue query pattern is always `WHERE location_id = $1 AND paid_at >= CURRENT_DATE`. A composite index with `location_id` first lets PostgreSQL jump directly to one location's rows, then use the `paid_at DESC` ordering to scan only today's entries — covering both the equality filter and the date range in a single index scan with no additional heap reads for the `SUM`. A separate index on just `location_id` or just `paid_at` would require a two-step filter.

#### Materialized view for peak hours heatmap (`location_hourly_stats`)

```sql
CREATE MATERIALIZED VIEW location_hourly_stats AS
  SELECT
    location_id,
    EXTRACT(DOW  FROM checked_in)::INTEGER AS day_of_week,
    EXTRACT(HOUR FROM checked_in)::INTEGER AS hour_of_day,
    COUNT(*)                               AS checkin_count
  FROM checkins
  WHERE checked_in >= NOW() - INTERVAL '7 days'
  GROUP BY location_id, day_of_week, hour_of_day;
```

A `GROUP BY` aggregation over 90,000 rows on every heatmap request would be expensive — sequential scan territory. The materialized view pre-computes the result into ~700 rows (10 locations × 7 days × up to 10 active hours). Heatmap queries become a simple `SELECT * WHERE location_id = $1` on a tiny pre-aggregated relation. The view is refreshed `CONCURRENTLY` every 15 minutes by a background cron job, which requires the unique index on `(location_id, day_of_week, hour_of_day)`.

#### Note on Seq Scan in Q4 and Q6 — intentional, not a bug

PostgreSQL's planner correctly chooses a sequential scan for `location_hourly_stats` (Q4, ~700 rows) and `anomalies WHERE resolved = FALSE` (Q6, typically 2–4 rows). At these sizes a seq scan is faster than an index scan because the entire relation fits in a single buffer page. The sub-millisecond execution times confirm this is optimal. Sequential scans on `checkins` and `payments` — the hard performance criterion — do not occur.

---

### Anomaly Detection

The anomaly detector runs as a background cron job every 30 seconds and checks all active locations simultaneously.

| Type | Trigger | Severity | Auto-Resolves When |
|---|---|---|---|
| `no_activity` | No check-ins in 2+ hours during operating hours | `warning` | Any new check-in recorded |
| `overbooking` | Occupancy > 90% of desk + office capacity | `critical` | Occupancy drops below 85% |
| `revenue_drop` | Today's revenue ≥ 30% below same weekday last week | `warning` | Revenue recovers to within 20% |
| `high_no_show` | > 30% of today's bookings have `no_show` status | `warning` | No-show rate drops below 20% |

Critical anomalies cannot be manually dismissed. Warning anomalies can be dismissed after a confirmation click. Resolved anomalies remain visible for 24 hours with a "Resolved" badge, then archive automatically.

---

### WebSocket Architecture

All live updates flow over a single persistent WebSocket connection per client. The backend broadcasts structured JSON events to all connected clients whenever state changes — no client-initiated polling, no HTTP long-polling.

| Event | Trigger | Frontend Action |
|---|---|---|
| `CHECKIN_EVENT` | Member checks in at any location | Increment occupancy, add to activity feed |
| `CHECKOUT_EVENT` | Member checks out | Decrement occupancy, update activity feed |
| `PAYMENT_EVENT` | Payment recorded | Update revenue ticker and daily total |
| `ANOMALY_DETECTED` | Detector fires a new anomaly | Add to anomaly log, flash badge, show toast |
| `ANOMALY_RESOLVED` | Anomaly auto-resolves | Mark resolved in log, decrement badge |

The frontend uses a `useWebSocket` custom hook that handles reconnection automatically. A pulsing green indicator is shown when connected; it turns red immediately on disconnect.

---

## 📊 Query Benchmarks

All results from `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` against the seeded dataset (1,500 members, ~90,000 check-in rows, 90 days of history). Screenshots are in [`/benchmarks/screenshots/`](benchmarks/screenshots/).

| # | Query | Measured Time | Index Used |
|---|---|---|---|
| Q1 | Live occupancy — `COUNT(*) WHERE location_id=$1 AND checked_out IS NULL` | **0.141 ms** | `idx_checkins_live_occupancy` (partial B-Tree) |
| Q2 | Today's revenue — `SUM(amount) WHERE location_id=$1 AND paid_at >= CURRENT_DATE` | **0.380 ms** | `idx_payments_location_date` (composite B-Tree) |
| Q3 | Expiring memberships — `WHERE status='active' AND end_date <= NOW() + INTERVAL '7 days'` | **0.552 ms** | `idx_memberships_churn_risk` (partial B-Tree) |
| Q4 | Peak hour heatmap — `SELECT * FROM location_hourly_stats WHERE location_id=$1` | **0.129 ms** | Materialized view seq scan (~700 rows — optimal) |
| Q5 | Cross-location revenue — `SUM(amount) GROUP BY location_id WHERE paid_at >= NOW()-'30 days'` | **1.774 ms** | `idx_payments_date` (B-Tree on `paid_at DESC`) |
| Q6 | Active anomalies — `SELECT * FROM anomalies WHERE resolved=FALSE` | **0.138 ms** | `idx_anomalies_active` seq scan (2–4 rows — optimal) |

All six queries are within target. No sequential scan occurs on `checkins` or `payments`.

---

## 📁 Project Structure

```
wtf-livepulse/
├── docker-compose.yml          # Three-service stack: db, backend, frontend
├── .env.example                # All required environment variables documented
├── backend/
│   ├── src/
│   │   ├── routes/             # Express route handlers (thin — delegate to services)
│   │   ├── services/           # Business logic: statsService, anomalyService, simulatorService
│   │   ├── db/
│   │   │   ├── migrations/     # Numbered SQL files auto-run by Postgres on first init
│   │   │   ├── seeds/          # Seed data: locations, members, 90-day check-in history
│   │   │   └── pool.js         # pg Pool singleton
│   │   ├── jobs/               # anomalyDetector.js (30s cron), simulator.js
│   │   ├── websocket/          # WebSocket server + broadcast helpers
│   │   └── app.js
│   ├── tests/
│   │   ├── unit/               # Jest unit tests — anomaly logic, simulator distribution
│   │   └── integration/        # Jest + Supertest — all API endpoints
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Dashboard, Analytics, Anomalies
│   │   ├── hooks/              # useWebSocket, useLocationData, useAnomalies
│   │   ├── store/              # Zustand stores
│   │   └── main.jsx
│   ├── tests/                  # Playwright E2E tests
│   └── package.json
└── benchmarks/
    └── screenshots/            # EXPLAIN ANALYZE output for all 6 benchmark queries
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/locations` | All locations with live occupancy and today's revenue |
| `GET` | `/api/locations/:id/live` | Single location snapshot (< 5ms) |
| `GET` | `/api/locations/:id/analytics` | Heatmap, revenue chart, churn risk. Query param: `dateRange=7d\|30d\|90d` |
| `GET` | `/api/anomalies` | Active anomalies. Query params: `location_id`, `severity` |
| `PATCH` | `/api/anomalies/:id/dismiss` | Dismiss a warning anomaly. Returns `403` if severity is `critical` |
| `GET` | `/api/analytics/cross-location` | Revenue comparison across all locations, last 30 days |
| `POST` | `/api/simulator/start` | Start simulation. Body: `{ "speed": 1 \| 5 \| 10 }` |
| `POST` | `/api/simulator/stop` | Pause simulation |
| `POST` | `/api/simulator/reset` | Clear open check-ins, return to seeded baseline |

---

## 🤖 AI Tools Used

**Claude Code (Anthropic)** was used throughout this project. Full disclosure of what it contributed:

| Area | What Claude Code generated |
|---|---|
| Folder & file scaffolding | `docker-compose.yml`, `Dockerfile` for both services, `.env.example`, initial `package.json` files |
| SQL migrations | `001_initial.sql` (all 9 tables with constraints), `002_indexes.sql` (all indexes), `003_materialized_view.sql` |
| Seed script | Bulk insert via `generate_series()`, member name pools, anomaly scenario seeding, churn-risk member seeding |
| Backend Express app | Route files, service files, WebSocket server, broadcast layer, anomaly detector cron job |
| Anomaly detection | Detection and auto-resolve logic for all four anomaly types |
| React frontend | Component scaffolding, Zustand store, `useWebSocket` hook, Recharts charts, Tailwind dark-theme layout |
| Test boilerplate | Unit test structure, mock patterns, integration test skeleton with Supertest |

All architecture decisions — index type selection (BRIN vs B-Tree vs partial), materialized view strategy, WebSocket event schema, anomaly thresholds, churn risk tiers — were designed and verified manually. Claude Code accelerated implementation; every generated file was reviewed, corrected where needed, and adapted to the production requirements of this project.

---

## 🗺 Roadmap

- [ ] Member check-in mobile app (QR code based)
- [ ] Membership expiry email notifications
- [ ] Booking UI for meeting rooms and private offices
- [ ] Multi-tenant authentication per chain
- [ ] ML-based demand forecasting using `location_hourly_stats` as feature source
- [ ] CI/CD pipeline with GitHub Actions
- [ ] One-click Railway deployment

---

## License

MIT
