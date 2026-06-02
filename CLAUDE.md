# DeskPulse — Master Context

## What This Project Is
DeskPulse — a real-time operations intelligence dashboard for co-working space chains. Operations managers get live visibility across all locations: who is present right now, revenue today, anomalies, and analytics. Built as a production-grade SaaS product targeting small co-working chains (3–15 locations).

## Absolute Hard Requirements
- `docker compose up` must start the ENTIRE stack with zero manual steps
- No npm install on host, no manual migrations, no external dependencies
- All critical PostgreSQL queries must return under 1ms on a seeded 90-day dataset
- A sequential scan on `checkins` or `payments` is an automatic failure
- WebSocket only — no polling anywhere
- The UI must use a dark theme — no white backgrounds

---

## Tech Stack

| Layer | Technology |
|---|---|
| Database | PostgreSQL 15 (Docker) |
| Backend | Node.js 20 + Express 4 + ws (WebSocket library) |
| Frontend | React 18 + Vite |
| Charts | Recharts |
| Styling | TailwindCSS |
| State | Zustand |
| WebSocket client | Native browser WebSocket API or ws npm package (no socket.io client) |
| Infra | Docker Compose (3 services: db, backend, frontend) |

---

## Required Folder Structure (follow exactly)

```
wtf-livepulse/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── src/
│   │   ├── routes/             # locations, members, analytics, anomalies
│   │   ├── services/           # anomalyService, simulatorService, statsService
│   │   ├── db/
│   │   │   ├── migrations/     # 001_initial.sql, 002_indexes.sql, ...
│   │   │   ├── seeds/          # seed data scripts
│   │   │   └── pool.js         # pg Pool singleton
│   │   ├── jobs/               # anomalyDetector.js, simulator.js
│   │   ├── websocket/          # WebSocket server + broadcast logic
│   │   └── app.js
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/              # Dashboard, Analytics, Anomalies
│   │   ├── hooks/              # useWebSocket, useLocationData, useAnomalies
│   │   ├── store/
│   │   └── main.jsx
│   ├── tests/                  # Playwright E2E
│   └── package.json
└── benchmarks/
    └── screenshots/            # EXPLAIN ANALYZE output for all 6 queries
```

---

## Database Schema

### Tables (use exact column names and constraints)

**locations** — id (UUID PK), name (TEXT), city (TEXT), address (TEXT), total_hot_desks (INTEGER), total_dedicated_desks (INTEGER), total_private_offices (INTEGER), total_meeting_rooms (INTEGER), opens_at (TIME DEFAULT '08:00'), closes_at (TIME DEFAULT '22:00'), status (TEXT CHECK IN ('active','inactive','maintenance') DEFAULT 'active'), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)

**resources** — id (UUID PK), location_id (FK → locations), type (TEXT CHECK IN ('hot_desk','dedicated_desk','private_office','meeting_room')), name (TEXT), capacity (INTEGER DEFAULT 1), status (TEXT CHECK IN ('available','maintenance') DEFAULT 'available')

**companies** — id (UUID PK), name (TEXT), contact_name (TEXT), contact_email (TEXT), contact_phone (TEXT), location_id (FK → locations), created_at (TIMESTAMPTZ)

**members** — id (UUID PK), company_id (UUID nullable FK → companies), location_id (FK → locations), name (TEXT), email (TEXT UNIQUE), phone (TEXT), status (TEXT CHECK IN ('active','inactive','frozen') DEFAULT 'active'), created_at (TIMESTAMPTZ)

**memberships** — id (UUID PK), member_id (FK → members), location_id (FK → locations), plan_type (TEXT CHECK IN ('day_pass','hot_desk','dedicated_desk','private_office')), start_date (TIMESTAMPTZ), end_date (TIMESTAMPTZ), status (TEXT CHECK IN ('active','expired','cancelled','paused') DEFAULT 'active'), member_type (TEXT CHECK IN ('new','renewal') DEFAULT 'new'), created_at (TIMESTAMPTZ)

**payments** — id (UUID PK), member_id (FK → members), membership_id (FK → memberships), location_id (FK → locations), amount (NUMERIC(10,2) CHECK > 0), payment_type (TEXT CHECK IN ('new','renewal') DEFAULT 'new'), paid_at (TIMESTAMPTZ DEFAULT NOW()), notes (TEXT)

**checkins** — id (BIGSERIAL PK), member_id (FK → members), location_id (FK → locations), checked_in (TIMESTAMPTZ DEFAULT NOW()), checked_out (TIMESTAMPTZ nullable), duration_min (INTEGER GENERATED ALWAYS AS (CASE WHEN checked_out IS NOT NULL THEN EXTRACT(EPOCH FROM (checked_out - checked_in))/60 ELSE NULL END) STORED)

**bookings** — id (UUID PK), member_id (FK → members), location_id (FK → locations), resource_id (FK → resources), starts_at (TIMESTAMPTZ), ends_at (TIMESTAMPTZ), status (TEXT CHECK IN ('confirmed','cancelled','no_show') DEFAULT 'confirmed'), amount (NUMERIC(10,2)), created_at (TIMESTAMPTZ DEFAULT NOW())

**anomalies** — id (UUID PK), location_id (FK → locations), type (TEXT CHECK IN ('no_activity','overbooking','revenue_drop','high_no_show')), severity (TEXT CHECK IN ('warning','critical')), message (TEXT), resolved (BOOLEAN DEFAULT FALSE), dismissed (BOOLEAN DEFAULT FALSE), detected_at (TIMESTAMPTZ DEFAULT NOW()), resolved_at (TIMESTAMPTZ)

### Required Indexes (never skip, reviewers run EXPLAIN ANALYZE)

```sql
-- Checkins (BRIN for time-series, composite for live occupancy — most frequent query)
CREATE INDEX idx_checkins_live_occupancy ON checkins (location_id, checked_out) WHERE checked_out IS NULL;
CREATE INDEX idx_checkins_time_brin ON checkins USING BRIN (checked_in);
CREATE INDEX idx_checkins_member ON checkins (member_id, checked_in DESC);

-- Payments
CREATE INDEX idx_payments_location_date ON payments (location_id, paid_at DESC);
CREATE INDEX idx_payments_date ON payments (paid_at DESC);

-- Members
CREATE INDEX idx_members_location_id ON members (location_id);

-- Memberships (churn/expiry risk — partial index, active only)
CREATE INDEX idx_memberships_churn_risk ON memberships (end_date) WHERE status = 'active';
CREATE INDEX idx_memberships_member ON memberships (member_id);
CREATE INDEX idx_memberships_location ON memberships (location_id);

-- Anomalies (partial index — unresolved only)
CREATE INDEX idx_anomalies_active ON anomalies (location_id, detected_at DESC) WHERE resolved = FALSE;

-- Bookings
CREATE INDEX idx_bookings_location ON bookings (location_id, starts_at DESC);
CREATE INDEX idx_bookings_resource ON bookings (resource_id, starts_at DESC);
```

### Required Materialized View

```sql
CREATE MATERIALIZED VIEW location_hourly_stats AS
  SELECT
    location_id,
    EXTRACT(DOW FROM checked_in)::INTEGER AS day_of_week,
    EXTRACT(HOUR FROM checked_in)::INTEGER AS hour_of_day,
    COUNT(*) AS checkin_count
  FROM checkins
  WHERE checked_in >= NOW() - INTERVAL '7 days'
  GROUP BY location_id, day_of_week, hour_of_day;

CREATE UNIQUE INDEX ON location_hourly_stats (location_id, day_of_week, hour_of_day);
-- Refresh every 15 minutes: REFRESH MATERIALIZED VIEW CONCURRENTLY location_hourly_stats;
```

---

## REST API Endpoints

| Method | Endpoint | Notes |
|---|---|---|
| GET | /api/locations | All locations with current occupancy + today's revenue |
| GET | /api/locations/:id/live | Single location snapshot — must complete < 5ms total |
| GET | /api/locations/:id/analytics | Heatmap + revenue chart + churn + utilisation. Query param: dateRange (7d/30d/90d) |
| GET | /api/anomalies | All active anomalies. Query params: location_id, severity |
| PATCH | /api/anomalies/:id/dismiss | Warning only. Returns 403 if critical |
| GET | /api/analytics/cross-location | Revenue comparison, all locations, last 30 days. Must complete < 2ms |
| POST | /api/simulator/start | Body: { speed: 1 \| 5 \| 10 } |
| POST | /api/simulator/stop | Pauses simulation |
| POST | /api/simulator/reset | Clears open check-ins, returns to seeded baseline |

All endpoints must return proper HTTP status codes and validate query params.

---

## WebSocket Event Protocol

All events are broadcast as structured JSON. Frontend handles them without page refresh.

| Event | Key Payload Fields | Frontend Action |
|---|---|---|
| CHECKIN_EVENT | location_id, member_name, timestamp, current_occupancy, capacity_pct | Update occupancy + activity feed + summary bar |
| CHECKOUT_EVENT | location_id, member_name, timestamp, current_occupancy, capacity_pct | Decrement occupancy + activity feed |
| PAYMENT_EVENT | location_id, amount, plan_type, member_name, today_total | Update revenue ticker + all-location total |
| ANOMALY_DETECTED | anomaly_id, location_id, location_name, anomaly_type, severity, message | Add to anomaly log + flash badge + toast |
| ANOMALY_RESOLVED | anomaly_id, location_id, resolved_at | Mark resolved in log + decrement badge |

---

## Anomaly Detection Engine (runs every 30 seconds)

| Type | Trigger | Severity | Auto-Resolve |
|---|---|---|---|
| no_activity | Active location, no check-ins in last 2 hours during opens_at–closes_at | WARNING | Any check-in recorded |
| overbooking | Current occupancy > 90% of (total_hot_desks + total_dedicated_desks + total_private_offices) | CRITICAL | Occupancy drops below 85% |
| revenue_drop | Today's revenue ≥ 30% below same weekday last week | WARNING | Revenue recovers within 20% of last week |
| high_no_show | >30% of today's confirmed bookings are no_show status | WARNING | no_show rate drops below 20% |

- Resolved anomalies stay visible for 24 hours marked 'Resolved', then auto-archived
- Warning anomalies can be manually dismissed with a confirmation click
- Critical anomalies cannot be dismissed
- Unread anomaly count badge updates via WebSocket

---

## Plan Pricing

| Plan | Amount | Duration |
|---|---|---|
| day_pass | ₹499 | 1 day |
| hot_desk | ₹3,999 | 30 days |
| dedicated_desk | ₹7,999 | 30 days |
| private_office | ₹24,999 | 30 days |

---

## Churn Risk (shown in Analytics panel — two tiers)

| Tier | Condition | Minimum Count | Label Shown |
|---|---|---|---|
| Expiring Soon | Active membership with end_date within 7 days and no newer active membership | 60 members | EXPIRING SOON |
| Inactive | Active membership but no check-in in last 30+ days | 120 members | INACTIVE |

Both tiers shown separately in the Analytics panel. Clicking a member shows their membership plan and last check-in date.

---

## Data Simulation Engine

- Seed: 10 co-working locations, 5,000 members, 90 days of historical data
- Realistic patterns: peak volume 9–12am and 2–5pm (business hours), low mornings and evenings, minimal weekends
- New events generated every 2 seconds when running
- Writes directly to PostgreSQL (not mocked)
- UI control panel: Start/Pause button, Speed multiplier (1x/5x/10x), Reset to baseline

---

## UI Design Rules

**Color Palette**
- Background: #0D0D1A
- Cards: #1A1A2E
- Accent: teal — use `teal-400` / `teal-500` consistently everywhere
- Primary text: #E2E8F0
- Secondary text: #64748B

**Typography**
- Font: Inter, Sora, or JetBrains Mono for data
- Body minimum: 13px
- KPI values (occupancy, revenue): 32–48px large numerals
- No serif fonts

**Live Indicators**
- Pulsing green dot next to occupancy when WebSocket is connected
- Red dot when disconnected — never show 'live' when connection is lost

**Animations**
- KPI numbers must animate smoothly on change (count-up, 300–500ms) — no jumping

**States**
- All panels must show skeleton loaders while fetching
- No empty boxes, no 'undefined' visible anywhere
- Failed API/WebSocket calls must show a meaningful error in the relevant panel — not just console.log

**Occupancy colour coding**
- < 60% = green
- 60–85% = yellow
- > 85% = red

**Responsiveness**
- Functional at 1280px minimum width
- Mobile not required but broken layout at 1280px is marked down

---

## Query Performance Targets (reviewers will verify with EXPLAIN ANALYZE)

| Query | Target |
|---|---|
| Live occupancy (checkins where checked_out IS NULL, by location) | < 1ms |
| Today's revenue per location | < 1ms |
| Peak hours heatmap (via materialized view) | < 0.3ms |
| Expiring memberships (active, end_date ≤ NOW() + 7 days) | < 1ms |
| Cross-location revenue comparison (last 30 days) | < 2ms |
| Single location live snapshot (/api/locations/:id/live) | < 5ms total |

A sequential scan on checkins or payments = automatic failure regardless of query correctness.

---

## Coding Rules

- React: functional components and hooks only — no class components
- All backend logic in services/, route handlers only call services
- Background jobs in jobs/ directory
- Migration files numbered: 001_initial.sql, 002_indexes.sql, etc.
- Database seeds auto-run on first Docker launch via /docker-entrypoint-initdb.d
- Backend must run a seed check on startup
- All environment variables pre-configured in docker-compose.yml for local dev
- .env.example must document every variable
- Never hardcode secrets or connection strings outside environment variables
- WebSocket: use ws npm package (not socket.io)

---

## Docker Compose Services

Three services only: db (postgres:15-alpine), backend (Node 20), frontend (React/Vite built to nginx)

- DB credentials: POSTGRES_DB=deskpulse, POSTGRES_USER=deskpulse, POSTGRES_PASSWORD=deskpulse_secret
- Backend: DATABASE_URL=postgres://deskpulse:deskpulse_secret@db:5432/deskpulse, PORT=3001
- Frontend served on port 3000
- Backend depends on db with health check condition
- Migrations auto-run via docker-entrypoint-initdb.d volume mount

---

## Seed Data Specification (reviewers verify these exact values)

### 10 Locations — Exact Values (do not invent different locations)

| # | Name | City | Hot Desks | Ded. Desks | Priv. Offices | Mtg. Rooms | Opens | Closes |
|---|---|---|---|---|---|---|---|---|
| 1 | DeskPulse — Lajpat Nagar | New Delhi | 80 | 40 | 12 | 4 | 08:00 | 22:00 |
| 2 | DeskPulse — Connaught Place | New Delhi | 60 | 30 | 10 | 3 | 07:30 | 22:00 |
| 3 | DeskPulse — Bandra West | Mumbai | 100 | 50 | 15 | 5 | 07:00 | 23:00 |
| 4 | DeskPulse — Powai | Mumbai | 90 | 45 | 12 | 4 | 07:30 | 22:00 |
| 5 | DeskPulse — Indiranagar | Bengaluru | 80 | 40 | 10 | 4 | 07:30 | 22:00 |
| 6 | DeskPulse — Koramangala | Bengaluru | 70 | 35 | 8 | 3 | 08:00 | 22:00 |
| 7 | DeskPulse — Banjara Hills | Hyderabad | 60 | 30 | 8 | 3 | 08:00 | 21:00 |
| 8 | DeskPulse — Sector 18 Noida | Noida | 50 | 25 | 6 | 2 | 08:00 | 21:00 |
| 9 | DeskPulse — Salt Lake | Kolkata | 40 | 20 | 5 | 2 | 08:00 | 21:00 |
| 10 | DeskPulse — Velachery | Chennai | 35 | 18 | 4 | 2 | 08:00 | 21:00 |

All locations status = 'active'. Use gen_random_uuid() for IDs — never hardcode UUIDs. Store location UUIDs in variables after insertion to use as foreign keys downstream.

**Occupancy capacity** (used for overbooking detection) = total_hot_desks + total_dedicated_desks + total_private_offices:

| Location | Occupancy Capacity |
|---|---|
| Lajpat Nagar | 132 |
| Connaught Place | 100 |
| Bandra West | 165 |
| Powai | 147 |
| Indiranagar | 130 |
| Koramangala | 113 |
| Banjara Hills | 98 |
| Sector 18 Noida | 81 |
| Salt Lake | 65 |
| Velachery | 57 |

### Member Distribution (exactly 5,000 total)

| Location | Count | day_pass% | hot_desk% | dedicated_desk% | private_office% | Active % |
|---|---|---|---|---|---|---|
| Lajpat Nagar | 650 | 40% | 30% | 20% | 10% | 88% |
| Connaught Place | 550 | 35% | 30% | 25% | 10% | 85% |
| Bandra West | 750 | 35% | 30% | 25% | 10% | 90% |
| Powai | 600 | 35% | 30% | 25% | 10% | 87% |
| Indiranagar | 550 | 40% | 30% | 20% | 10% | 89% |
| Koramangala | 500 | 40% | 30% | 20% | 10% | 86% |
| Banjara Hills | 450 | 45% | 30% | 17% | 8% | 84% |
| Sector 18 Noida | 400 | 50% | 30% | 15% | 5% | 82% |
| Salt Lake | 300 | 55% | 30% | 12% | 3% | 80% |
| Velachery | 250 | 55% | 30% | 12% | 3% | 78% |

- 80% new members, 20% renewals at seed time
- Inactive members: 8% of each location's total. Frozen: 4%
- Names: realistic Indian full names (Rahul Sharma, Priya Mehta, Ankit Verma etc.)
- Emails: firstname.lastname+random@gmail.com — no duplicates
- Phone: 10-digit starting with 9, 8, or 7
- start_date on membership: random date within last 90 days for active members, 91–180 days ago for inactive
- end_date: day_pass = start_date + 1d, hot_desk = +30d, dedicated_desk = +30d, private_office = +30d

### Churn Risk Members — Mandatory (analytics panel must have data)

| Tier | Condition | Minimum Count |
|---|---|---|
| Expiring Soon | Active membership, end_date within 7 days, no newer active membership | 60 members |
| Inactive | Active membership, no check-in for 30+ days | 120 members |

**Critical:** Inactive members must have an actual checkins row whose checked_in timestamp matches their last known visit. If a member's last check-in was 35 days ago, there must be a real row in checkins with that timestamp. Seed this intentionally by setting start_date ≥ 45 days ago and inserting their last check-in 35+ days ago with no subsequent check-ins.

### Check-in Volume
- Total: ~270,000 records across all 10 locations over 90 days
- ~300 check-ins per location per day average

### Hourly Distribution (weight check-in generation by these multipliers)

| Hour Block | Time | Multiplier |
|---|---|---|
| Closed Night | 00:00–07:59 | 0.00× (location closed) |
| Early Arrival | 08:00–08:59 | 0.40× |
| Morning Peak | 09:00–11:59 | 1.00× ← PEAK |
| Lunch Dip | 12:00–13:59 | 0.50× |
| Afternoon Work | 14:00–17:59 | 0.90× ← PEAK |
| Evening Wind-down | 18:00–19:59 | 0.40× |
| Late Evening | 20:00–22:00 | 0.15× |
| After Closing | 22:01–23:59 | 0.00× (location closed) |

### Day-of-Week Multipliers

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| 0.85× | 0.95× | 1.00× | 0.95× | 0.80× | 0.40× | 0.20× |

### Check-out Rules
- All historical check-ins (older than 2 hours): checked_out = checked_in + random(120–480 minutes) — co-working sessions are longer than gym visits
- Open check-ins (checked_out IS NULL): only for current day / simulator-managed records
- Churn-risk inactive members: their last check-in is closed, they have not returned since

### Pre-seeded Open Check-ins (dashboard must show live data on first load)

| Tier | Locations | Open Check-ins to Seed |
|---|---|---|
| Large (130+ capacity) | Bandra West, Powai, Lajpat Nagar, Indiranagar | 25–35 open check-ins |
| Medium (80–129 capacity) | Connaught Place, Koramangala, Banjara Hills | 15–25 open check-ins |
| Small (<80 capacity) | Noida, Salt Lake, Velachery | 8–15 open check-ins |

**Exception:** Velachery gets 0 open check-ins (see Anomaly Scenario A below). Bandra West gets 150–160 open check-ins (see Anomaly Scenario B below).

### Payment Data

- Every member gets at least 1 payment matching their current plan at the plan price
- Renewal members (member_type = 'renewal') get 2 payments — original + renewal
- paid_at = membership start_date (±5 minutes)
- No future-dated payments
- payment_type matches member_type ('new' or 'renewal')

### Anomaly Test Scenarios — Must be pre-built in seed (reviewers check within 60 seconds of docker compose up)

**Scenario A — No Activity (Velachery)**
- 0 open check-ins for Velachery
- Most recent checkins row for Velachery must have checked_in ≥ 2 hours 10 minutes before seed execution time
- Detector must fire: type = 'no_activity', severity = 'warning'
- Auto-resolves when any new check-in is recorded for Velachery

**Scenario B — Overbooking (Bandra West)**
- Seed 150–160 open check-ins (checked_out = NULL) for Bandra West (occupancy capacity = 165)
- All checked_in within the last 90 minutes
- Occupancy = 150–160 / 165 = 91–97% → above 90% threshold
- Detector must fire: type = 'overbooking', severity = 'critical'
- Must auto-resolve when occupancy drops below 85% (< 140 open check-ins) as simulator runs

**Scenario C — Revenue Drop (Salt Lake)**
- Same weekday 7 days ago: seed 8–10 payments totalling ≥ ₹15,000 for Salt Lake
- Today: seed 0–2 payments totalling ≤ ₹3,000 for Salt Lake
- Detector must fire: type = 'revenue_drop', severity = 'warning'
- Do not manipulate payment history for any other location

**Scenario D — High No-Show (Koramangala)**
- Today: seed 12 confirmed bookings for Koramangala in the bookings table, where 5 of them have status = 'no_show' (41.7% no-show rate, above 30% threshold)
- Detector must fire: type = 'high_no_show', severity = 'warning'
- Auto-resolves when no_show rate drops below 20%

### Seed Script Technical Requirements
- **Idempotent**: use INSERT ... ON CONFLICT DO NOTHING — running twice must not duplicate records
- **Auto-runs**: place SQL migration files in /docker-entrypoint-initdb.d/ — Postgres runs them on first init
- **Must complete within 120 seconds** — backend starts after db healthcheck passes
- **Insert order**: locations → resources → companies → members → memberships → checkins → payments → bookings (foreign key order)
- **Batch inserts**: insert in batches of 500–1000 rows. Never insert 270,000 rows one-by-one — use INSERT INTO checkins SELECT ... FROM generate_series() for maximum speed
- **Print progress to stdout**: 'Seeding locations... done', 'Seeding 5000 members... done', etc. Reviewers watch Docker logs
- **Preferred approach**: PostgreSQL generate_series() inside SQL for check-ins — fastest and stays inside DB
- After bulk insert of checkins, there is no last_checkin_at column on members — the analytics query derives last check-in from the checkins table directly

---

## Indexing Design Decisions (be ready to explain these)

| Index | Type | Why |
|---|---|---|
| `idx_checkins_live_occupancy` | B-Tree partial (`WHERE checked_out IS NULL`) | Live occupancy is the most frequent query. Partial index keeps it tiny — only open check-ins are indexed, not 270k+ historical rows. Extremely fast COUNT(*). |
| `idx_checkins_time_brin` | BRIN | checkins is an append-only time-series table. BRIN stores min/max per page block — tiny index size, perfect for range queries on `checked_in`. Never use B-Tree on a massive append-only time column. |
| `idx_checkins_member` | B-Tree composite | Member-level history lookups. DESC order matches query pattern. |
| `idx_payments_location_date` | B-Tree composite (location_id, paid_at DESC) | Today's revenue is the most frequent analytics query. Composite covers both the WHERE location_id = $1 and the paid_at >= CURRENT_DATE filter in one index scan. |
| `idx_payments_date` | B-Tree (paid_at DESC) | Cross-location revenue comparison groups by location_id over a date range. Covers the date filter; PostgreSQL handles the GROUP BY separately. |
| `idx_memberships_churn_risk` | B-Tree partial on end_date (`WHERE status = 'active'`) | Expiry churn query only cares about active memberships. Partial index excludes expired/cancelled — keeps index small and fast. |
| `idx_anomalies_active` | B-Tree partial (`WHERE resolved = FALSE`) | Active anomalies are a tiny subset. Partial index is nearly always in memory — sub-millisecond lookups. |
| `location_hourly_stats` unique index | B-Tree on (location_id, day_of_week, hour_of_day) | Enables CONCURRENT refresh of the materialized view. Also makes heatmap lookups by location instant. |

**Key principle**: A sequential scan on `checkins` or `payments` = automatic rejection. Every query touching these tables must use an index scan. Run `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` to verify — execution time must be visible in output.

---

## Benchmark Queries (all 6 must pass)

Run against seeded data (5,000 members, 90 days, ~270,000+ check-in records). Screenshots go in `/benchmarks/screenshots/`.

| # | Query Name | SQL Pattern | Target | Index Used |
|---|---|---|---|---|
| Q1 | Live Occupancy | `SELECT COUNT(*) FROM checkins WHERE location_id = $1 AND checked_out IS NULL` | < 0.5ms | idx_checkins_live_occupancy |
| Q2 | Today's Revenue | `SELECT SUM(amount) FROM payments WHERE location_id = $1 AND paid_at >= CURRENT_DATE` | < 0.8ms | idx_payments_location_date |
| Q3 | Expiring Memberships | `SELECT id, member_id, end_date FROM memberships WHERE status = 'active' AND end_date <= NOW() + INTERVAL '7 days'` | < 1ms | idx_memberships_churn_risk |
| Q4 | Peak Hour Heatmap | `SELECT * FROM location_hourly_stats WHERE location_id = $1` | < 0.3ms | Materialized view unique index |
| Q5 | Cross-Location Revenue | `SELECT location_id, SUM(amount) FROM payments WHERE paid_at >= NOW() - INTERVAL '30 days' GROUP BY location_id ORDER BY SUM DESC` | < 2ms | idx_payments_date |
| Q6 | Active Anomalies | `SELECT * FROM anomalies WHERE resolved = FALSE ORDER BY detected_at DESC` | < 0.3ms | idx_anomalies_active |

Always run as: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` — execution time must be visible.

---

## Testing Requirements

### Layer 1 — Unit Tests (Jest), minimum 10, all must pass
- no_activity anomaly fires when active location has no check-ins for 2+ hours during opens_at–closes_at
- overbooking fires when occupancy > 90% of (total_hot_desks + total_dedicated_desks + total_private_offices)
- revenue_drop fires when today's revenue < 70% of same weekday last week
- high_no_show fires when >30% of today's bookings are no_show
- All 4 anomaly types auto-resolve when conditions clear
- Simulator generates check-in events with realistic time distribution (peak 9–12am and 2–5pm)

### Layer 2 — Integration Tests (Jest + Supertest), minimum 12, all must pass
- GET /api/locations returns 10 locations after seeding with correct structure
- GET /api/locations/:id/live returns all required fields
- GET /api/anomalies returns empty array when no anomalies exist
- PATCH /api/anomalies/:id/dismiss returns 403 when severity is 'critical'
- POST /api/simulator/start returns `{ status: 'running' }`
- All endpoints return correct HTTP status codes on invalid input (400, 404, 403)
- Coverage report must be included. Target: 80%+ (below 60% = 0 points)

### Layer 3 — E2E Tests (Playwright), minimum 3, all must run headless
- Dashboard loads and displays location list without errors
- Switching location in dropdown updates occupancy count correctly
- Triggering a check-in via simulator causes activity feed to update within 2 seconds
- Anomaly appearing in DB causes badge count to increment

**How reviewers run tests:**
```bash
cd backend && npm test
cd frontend && npx playwright test
```
Both must work with zero additional configuration.

---

## Styling — Tailwind CSS Only

- Use Tailwind utility classes throughout — no custom CSS files except for animations
- Dark theme enforced: bg-[#0D0D1A] for page, bg-[#1A1A2E] for cards
- Accent color is teal — use `teal-400` / `teal-500` consistently everywhere
- KPI numbers: `text-4xl` or `text-5xl font-bold`
- Secondary text: `text-slate-400`
- Primary text: `text-slate-200`
- Skeleton loaders: use `animate-pulse bg-slate-700 rounded` divs
- Pulsing WebSocket indicator: `animate-ping` on a green/red dot
- Number count-up animations: use a custom hook with `requestAnimationFrame`
- Occupancy color: `text-green-400` (<60%), `text-yellow-400` (60–85%), `text-red-400` (>85%)

---

## README Structure (all 5 sections mandatory)

| Section | What to Write |
|---|---|
| 1. Quick Start | `docker compose up` — nothing else. List Docker Desktop as only prerequisite. |
| 2. Architecture Decisions | Explain BRIN vs B-Tree vs partial index choices. Why materialized view for heatmap. Why memberships is a separate table from members. Any non-obvious decisions. |
| 3. AI Tools Used | List every AI tool used and exactly what each was used for. Hiding this = disqualification. Being thorough here = advantage. |
| 4. Query Benchmarks | Table of all 6 queries with measured execution time from EXPLAIN ANALYZE. Reference screenshots in /benchmarks. |
| 5. Known Limitations | Honest list of anything incomplete or not working. Silence is penalised more than honesty. |

---

## Scoring Cheatsheet (100 points total, pass = 65)

| Points | Criterion | How to nail it |
|---|---|---|
| 15 | docker compose up cold start | Test `docker compose down -v && docker compose up` before submitting |
| 15 | WebSocket live updates | All 5 event types handled, UI updates < 1 second |
| 15 | Query benchmarks (2.5 per query) | EXPLAIN ANALYZE screenshots in /benchmarks, no seq scans |
| 12 | All 4 UI modules complete (3 each) | Dashboard, Analytics, Anomaly Log, Simulator Controls |
| 9 | Anomaly engine — all 4 types + auto-resolve | Test each type manually before submitting |
| 8 | Backend test coverage 80%+ | Run coverage report, include it in repo |
| 6 | Playwright E2E — check-in → UI update | Must run headless, must pass |
| 10 | Code quality — MVC, no secrets, no N+1 | Services layer, env vars only, eager-load relations |
| 6 | UI visual quality — dark, custom, no broken layout | Tailwind custom colors, test at 1280px |
| 4 | README — all 5 sections | Write it last, be honest about AI tools |

### Automatic Rejection Triggers (any one = instant fail)
- Sequential scan on checkins or payments
- No test files in repo
- docker compose up fails on first attempt
- WebSocket replaced with setInterval polling
- Default UI template with zero customization
- Hardcoded database password or credential committed
- AI tool usage omitted from README when AI was clearly used

---

## Future Scope (Phase 2 — do not implement now, schema must not conflict)

- Membership expiry email notifications (end_date already in memberships table — no schema change needed)
- Booking UI for members (bookings table already seeded)
- ML demand forecasting using location_hourly_stats as feature source
- Multi-tenant auth per chain (locations table can gain a chain_id FK)

---

## What NOT To Do

- No polling — WebSocket only for live data
- No socket.io client on the frontend
- No D3 directly for charts
- No Bootstrap or default MUI theme
- No white or light backgrounds
- No class components in React
- No Redux unless genuinely needed (will be penalised as overengineering)
- No manual steps required after `docker compose up`
- No sequential scans on checkins or payments tables
- No hardcoded database credentials in source code
