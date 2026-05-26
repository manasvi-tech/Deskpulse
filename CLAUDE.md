# WTF LivePulse — Master Context

## What This Project Is
A real-time gym operations dashboard for WTF Gyms (Witness The Fitness), a fitness-tech chain with 50+ locations and 26,000+ members. This is a production-grade assignment to be completed in 3 hours. It is an execution test — not a prototype. Every feature must be production-ready.

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
│   │   ├── routes/             # gyms, members, analytics, anomalies
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
│   │   ├── hooks/              # useWebSocket, useGymData, useAnomalies
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

**gyms** — id (UUID PK), name, city, address, capacity (INTEGER > 0), status ('active'|'inactive'|'maintenance'), opens_at (TIME default 06:00), closes_at (TIME default 22:00), created_at, updated_at

**members** — id (UUID PK), gym_id (FK → gyms), name, email, phone, plan_type ('monthly'|'quarterly'|'annual'), member_type ('new'|'renewal'), status ('active'|'inactive'|'frozen'), joined_at, plan_expires_at, last_checkin_at, created_at

**checkins** — id (BIGSERIAL PK), member_id (FK), gym_id (FK), checked_in (TIMESTAMPTZ), checked_out (TIMESTAMPTZ nullable), duration_min (GENERATED ALWAYS as epoch diff in minutes, STORED)

**payments** — id (UUID PK), member_id (FK), gym_id (FK), amount (NUMERIC(10,2) > 0), plan_type, payment_type ('new'|'renewal'), paid_at (TIMESTAMPTZ), notes

**anomalies** — id (UUID PK), gym_id (FK), type ('zero_checkins'|'capacity_breach'|'revenue_drop'), severity ('warning'|'critical'), message, resolved (BOOLEAN default false), dismissed (BOOLEAN default false), detected_at, resolved_at

### Required Indexes (never skip, reviewers run EXPLAIN ANALYZE)

```sql
-- Members churn risk (partial index — active only)
CREATE INDEX idx_members_churn_risk ON members (last_checkin_at) WHERE status = 'active';
CREATE INDEX idx_members_gym_id ON members (gym_id);

-- Checkins (BRIN for time-series, composite for live occupancy — most frequent query)
CREATE INDEX idx_checkins_time_brin ON checkins USING BRIN (checked_in);
CREATE INDEX idx_checkins_live_occupancy ON checkins (gym_id, checked_out) WHERE checked_out IS NULL;
CREATE INDEX idx_checkins_member ON checkins (member_id, checked_in DESC);

-- Payments
CREATE INDEX idx_payments_gym_date ON payments (gym_id, paid_at DESC);
CREATE INDEX idx_payments_date ON payments (paid_at DESC);

-- Anomalies (partial index — active only)
CREATE INDEX idx_anomalies_active ON anomalies (gym_id, detected_at DESC) WHERE resolved = FALSE;
```

### Required Materialized View

```sql
CREATE MATERIALIZED VIEW gym_hourly_stats AS
  SELECT
    gym_id,
    EXTRACT(DOW FROM checked_in)::INTEGER AS day_of_week,
    EXTRACT(HOUR FROM checked_in)::INTEGER AS hour_of_day,
    COUNT(*) AS checkin_count
  FROM checkins
  WHERE checked_in >= NOW() - INTERVAL '7 days'
  GROUP BY gym_id, day_of_week, hour_of_day;

CREATE UNIQUE INDEX ON gym_hourly_stats (gym_id, day_of_week, hour_of_day);
-- Refresh every 15 minutes: REFRESH MATERIALIZED VIEW CONCURRENTLY gym_hourly_stats;
```

---

## REST API Endpoints

| Method | Endpoint | Notes |
|---|---|---|
| GET | /api/gyms | All gyms with current occupancy + today's revenue |
| GET | /api/gyms/:id/live | Single gym snapshot — must complete < 5ms total |
| GET | /api/gyms/:id/analytics | Heatmap + revenue chart + churn + ratio. Query param: dateRange (7d/30d/90d) |
| GET | /api/anomalies | All active anomalies. Query params: gym_id, severity |
| PATCH | /api/anomalies/:id/dismiss | Warning only. Returns 403 if critical |
| GET | /api/analytics/cross-gym | Revenue comparison, all gyms, last 30 days. Must complete < 2ms |
| POST | /api/simulator/start | Body: { speed: 1 \| 5 \| 10 } |
| POST | /api/simulator/stop | Pauses simulation |
| POST | /api/simulator/reset | Clears open check-ins, returns to seeded baseline |

All endpoints must return proper HTTP status codes and validate query params.

---

## WebSocket Event Protocol

All events are broadcast as structured JSON. Frontend handles them without page refresh.

| Event | Key Payload Fields | Frontend Action |
|---|---|---|
| CHECKIN_EVENT | gym_id, member_name, timestamp, current_occupancy, capacity_pct | Update occupancy + activity feed + summary bar |
| CHECKOUT_EVENT | gym_id, member_name, timestamp, current_occupancy, capacity_pct | Decrement occupancy + activity feed |
| PAYMENT_EVENT | gym_id, amount, plan_type, member_name, today_total | Update revenue ticker + all-gym total |
| ANOMALY_DETECTED | anomaly_id, gym_id, gym_name, anomaly_type, severity, message | Add to anomaly log + flash badge + toast |
| ANOMALY_RESOLVED | anomaly_id, gym_id, resolved_at | Mark resolved in log + decrement badge |

---

## Anomaly Detection Engine (runs every 30 seconds)

| Type | Trigger | Severity | Auto-Resolve |
|---|---|---|---|
| zero_checkins | Active gym, no check-ins in last 2 hours during 6am–10pm | WARNING | Any check-in recorded |
| capacity_breach | Current occupancy > 90% of capacity | CRITICAL | Occupancy drops below 85% |
| revenue_drop | Today's revenue ≥ 30% below same day last week | WARNING | Revenue recovers within 20% of last week |

- Resolved anomalies stay visible for 24 hours marked 'Resolved', then auto-archived
- Warning anomalies can be manually dismissed with a confirmation click
- Critical anomalies cannot be dismissed
- Unread anomaly count badge updates via WebSocket

---

## Data Simulation Engine

- Seed: 10 gym locations (capacity 80–300), 5,000 members, 90 days of historical data
- Realistic patterns: peak volume 6–9am and 5–8pm, low midday, minimal overnight
- New events generated every 2 seconds when running
- Writes directly to PostgreSQL (not mocked)
- UI control panel: Start/Pause button, Speed multiplier (1x/5x/10x), Reset to baseline

---

## UI Design Rules

**Color Palette**
- Background: #0D0D1A
- Cards: #1A1A2E
- Accent: pick ONE of red, teal, or orange — use it consistently
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
| Live occupancy (checkins where checked_out IS NULL, by gym) | < 1ms |
| Today's revenue per gym | < 1ms |
| Peak hours heatmap (via materialized view) | < 0.3ms |
| Churn risk members (45+ days no check-in, active only) | < 1ms |
| Cross-gym revenue comparison (last 30 days) | < 2ms |
| Single gym live snapshot (/api/gyms/:id/live) | < 5ms total |

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

- DB credentials: POSTGRES_DB=wtf_livepulse, POSTGRES_USER=wtf, POSTGRES_PASSWORD=wtf_secret
- Backend: DATABASE_URL=postgres://wtf:wtf_secret@db:5432/wtf_livepulse, PORT=3001
- Frontend served on port 3000
- Backend depends on db with health check condition
- Migrations auto-run via docker-entrypoint-initdb.d volume mount

---

## Seed Data Specification (reviewers verify these exact values)

### 10 Gyms — Exact Values (do not invent different gyms)

| # | Name | City | Capacity | Opens | Closes |
|---|---|---|---|---|---|
| 1 | WTF Gyms — Lajpat Nagar | New Delhi | 220 | 05:30 | 22:30 |
| 2 | WTF Gyms — Connaught Place | New Delhi | 180 | 06:00 | 22:00 |
| 3 | WTF Gyms — Bandra West | Mumbai | 300 | 05:00 | 23:00 |
| 4 | WTF Gyms — Powai | Mumbai | 250 | 05:30 | 22:30 |
| 5 | WTF Gyms — Indiranagar | Bengaluru | 200 | 05:30 | 22:00 |
| 6 | WTF Gyms — Koramangala | Bengaluru | 180 | 06:00 | 22:00 |
| 7 | WTF Gyms — Banjara Hills | Hyderabad | 160 | 06:00 | 22:00 |
| 8 | WTF Gyms — Sector 18 Noida | Noida | 140 | 06:00 | 21:30 |
| 9 | WTF Gyms — Salt Lake | Kolkata | 120 | 06:00 | 21:00 |
| 10 | WTF Gyms — Velachery | Chennai | 110 | 06:00 | 21:00 |

All gyms status = 'active'. Use gen_random_uuid() for IDs — never hardcode UUIDs. Store gym UUIDs in memory after insertion to use for members and check-ins.

### Member Distribution (exactly 5,000 total)

| Gym | Count | Monthly | Quarterly | Annual | Active % |
|---|---|---|---|---|---|
| Lajpat Nagar | 650 | 50% | 30% | 20% | 88% |
| Connaught Place | 550 | 40% | 40% | 20% | 85% |
| Bandra West | 750 | 40% | 40% | 20% | 90% |
| Powai | 600 | 40% | 40% | 20% | 87% |
| Indiranagar | 550 | 40% | 40% | 20% | 89% |
| Koramangala | 500 | 40% | 40% | 20% | 86% |
| Banjara Hills | 450 | 50% | 30% | 20% | 84% |
| Sector 18 Noida | 400 | 60% | 25% | 15% | 82% |
| Salt Lake | 300 | 60% | 30% | 10% | 80% |
| Velachery | 250 | 60% | 30% | 10% | 78% |

- 80% new joiners, 20% renewals at seed time
- Inactive members: 8% of each gym's total. Frozen: 4%
- Names: realistic Indian full names (Rahul Sharma, Priya Mehta, Ankit Verma etc.)
- Emails: firstname.lastname+random@gmail.com — no duplicates
- Phone: 10-digit starting with 9, 8, or 7
- joined_at: random date within last 90 days for active members, 91–180 days ago for inactive
- plan_expires_at: monthly = joined_at + 30d, quarterly = +90d, annual = +365d

### Churn Risk Members — Mandatory (analytics panel must have data)

| Tier | last_checkin_at | Minimum Count | Risk Level Shown |
|---|---|---|---|
| High Risk | 45–60 days ago | 150 active members | HIGH |
| Critical Risk | 60+ days ago | 80 active members | CRITICAL |
| Healthy | Within last 44 days | Remaining | Not shown |

**Critical:** last_checkin_at on members table must always equal their most recent row in checkins table. If last_checkin_at = 50 days ago, there must be an actual checkins row with that timestamp.

### Check-in Volume
- Total: ~270,000 records across all 10 gyms over 90 days
- ~300 check-ins per gym per day average

### Hourly Distribution (weight check-in generation by these multipliers)

| Hour Block | Time | Multiplier |
|---|---|---|
| Dead Night | 00:00–05:29 | 0.00× (gym closed) |
| Early Morning | 05:30–06:59 | 0.60× |
| Morning Rush | 07:00–09:59 | 1.00× ← PEAK |
| Mid Morning | 10:00–11:59 | 0.40× |
| Lunch Slot | 12:00–13:59 | 0.30× |
| Afternoon | 14:00–16:59 | 0.20× |
| Evening Rush | 17:00–20:59 | 0.90× ← PEAK |
| Late Evening | 21:00–22:30 | 0.35× |
| After Closing | 22:31–23:59 | 0.00× (gym closed) |

### Day-of-Week Multipliers

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| 1.00× | 0.95× | 0.90× | 0.95× | 0.85× | 0.70× | 0.45× |

### Check-out Rules
- All historical check-ins (older than 2 hours): checked_out = checked_in + random(45–90 minutes)
- Open check-ins (checked_out IS NULL): only for current day / simulator-managed records
- Churn risk members: their last check-in is closed, they have not returned since

### Pre-seeded Open Check-ins (dashboard must show live data on first load)

| Tier | Gyms | Open Check-ins to Seed |
|---|---|---|
| Large (250–300 capacity) | Bandra West, Powai | 25–35 open check-ins |
| Medium (160–220 capacity) | Lajpat Nagar, CP, Indiranagar, Koramangala, Banjara Hills | 15–25 open check-ins |
| Small (110–140 capacity) | Noida, Salt Lake, Velachery | 8–15 open check-ins |

**Exception:** Velachery gets 0 open check-ins (see Anomaly Scenario A below). Bandra West gets 275–295 open check-ins (see Anomaly Scenario B below).

### Payment Data

| Plan | Amount | Duration |
|---|---|---|
| monthly | ₹1,499 | 30 days |
| quarterly | ₹3,999 | 90 days |
| annual | ₹11,999 | 365 days |

- Every member gets at least 1 payment matching their plan
- Renewal members (member_type = 'renewal') get 2 payments — original + renewal
- paid_at = member's joined_at (±5 minutes)
- No future-dated payments

### Anomaly Test Scenarios — Must be pre-built in seed (reviewers check within 60 seconds of docker compose up)

**Scenario A — Zero Check-ins (Velachery)**
- 0 open check-ins for Velachery
- Most recent checkins row for Velachery must be 2 hours 10+ minutes before seed execution time
- Detector must fire: type = 'zero_checkins', severity = 'warning'

**Scenario B — Capacity Breach (Bandra West)**
- Seed 275–295 open check-ins (checked_out = NULL) for Bandra West (capacity = 300)
- All checked_in within the last 90 minutes
- Detector must fire: type = 'capacity_breach', severity = 'critical'
- Must auto-resolve when occupancy drops below 85% as simulator runs

**Scenario C — Revenue Drop (Salt Lake)**
- Same weekday 7 days ago: seed 8–10 payments totalling ≥ ₹15,000 for Salt Lake
- Today: seed 0–2 payments totalling ≤ ₹3,000 for Salt Lake
- Detector must fire: type = 'revenue_drop', severity = 'warning'
- Do not manipulate payment history for any other gym

### Seed Script Technical Requirements
- **Idempotent**: use INSERT ... ON CONFLICT DO NOTHING — running twice must not duplicate records
- **Auto-runs**: place SQL migration files in /docker-entrypoint-initdb.d/ — Postgres runs them on first init
- **Must complete within 120 seconds** — backend starts after db healthcheck passes
- **Insert order**: gyms → members → check-ins → payments (foreign key order)
- **Batch inserts**: insert in batches of 500–1000 rows. Never insert 270,000 rows one-by-one — use INSERT INTO checkins SELECT ... FROM generate_series() for maximum speed
- **Print progress to stdout**: 'Seeding gyms... done', 'Seeding 5000 members... done', etc. Reviewers watch Docker logs
- **Preferred approach**: PostgreSQL generate_series() inside SQL for check-ins — fastest and stays inside DB
- After bulk insert of checkins, run a single batch UPDATE on members to set last_checkin_at from checkins table

---

## Indexing Design Decisions (be ready to explain these)

| Index | Type | Why |
|---|---|---|
| `idx_checkins_live_occupancy` | B-Tree partial (`WHERE checked_out IS NULL`) | Live occupancy is the most frequent query. Partial index keeps it tiny — only open check-ins are indexed, not 270k+ historical rows. Extremely fast COUNT(*). |
| `idx_checkins_time_brin` | BRIN | checkins is an append-only time-series table. BRIN stores min/max per page block — tiny index size, perfect for range queries on `checked_in`. Never use B-Tree on a massive append-only time column. |
| `idx_checkins_member` | B-Tree composite | Member-level history lookups. DESC order matches query pattern. |
| `idx_payments_gym_date` | B-Tree composite (gym_id, paid_at DESC) | Today's revenue is the most frequent analytics query. Composite covers both the WHERE gym_id = $1 and the paid_at >= CURRENT_DATE filter in one index scan. |
| `idx_payments_date` | B-Tree (paid_at DESC) | Cross-gym revenue comparison groups by gym_id over a date range. Covers the date filter; PostgreSQL handles the GROUP BY separately. |
| `idx_members_churn_risk` | B-Tree partial (`WHERE status = 'active'`) | Churn query only cares about active members. Partial index excludes inactive/frozen — keeps index small and fast on a 5,000 member table. |
| `idx_anomalies_active` | B-Tree partial (`WHERE resolved = FALSE`) | Active anomalies are a tiny subset. Partial index is nearly always in memory — sub-millisecond lookups. |
| `gym_hourly_stats` unique index | B-Tree on (gym_id, day_of_week, hour_of_day) | Enables CONCURRENT refresh of the materialized view. Also makes heatmap lookups by gym instant. |

**Key principle**: A sequential scan on `checkins` or `payments` = automatic rejection. Every query touching these tables must use an index scan. Run `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` to verify — execution time must be visible in output.

---

## Benchmark Queries (all 6 must pass)

Run against seeded data (5,000 members, 90 days, ~270,000+ check-in records). Screenshots go in `/benchmarks/screenshots/`.

| # | Query Name | SQL Pattern | Target | Index Used |
|---|---|---|---|---|
| Q1 | Live Occupancy | `SELECT COUNT(*) FROM checkins WHERE gym_id = $1 AND checked_out IS NULL` | < 0.5ms | idx_checkins_live_occupancy |
| Q2 | Today's Revenue | `SELECT SUM(amount) FROM payments WHERE gym_id = $1 AND paid_at >= CURRENT_DATE` | < 0.8ms | idx_payments_gym_date |
| Q3 | Churn Risk Members | `SELECT id, name, last_checkin_at FROM members WHERE status='active' AND last_checkin_at < NOW() - INTERVAL '45 days'` | < 1ms | idx_members_churn_risk |
| Q4 | Peak Hour Heatmap | `SELECT * FROM gym_hourly_stats WHERE gym_id = $1` | < 0.3ms | Materialized view unique index |
| Q5 | Cross-Gym Revenue | `SELECT gym_id, SUM(amount) FROM payments WHERE paid_at >= NOW() - INTERVAL '30 days' GROUP BY gym_id ORDER BY SUM DESC` | < 2ms | idx_payments_date |
| Q6 | Active Anomalies | `SELECT * FROM anomalies WHERE resolved = FALSE ORDER BY detected_at DESC` | < 0.3ms | idx_anomalies_active |

Always run as: `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` — execution time must be visible.

---

## Testing Requirements

### Layer 1 — Unit Tests (Jest), minimum 10, all must pass
- zero_checkins anomaly fires when active gym has no check-ins for 2+ hours during 6am–10pm
- capacity_breach fires when occupancy > 90% of capacity
- revenue_drop fires when today's revenue < 70% of same day last week
- All 3 anomaly types auto-resolve when conditions clear
- Simulator generates check-in events with realistic time distribution (peak 6–9am and 5–8pm)

### Layer 2 — Integration Tests (Jest + Supertest), minimum 12, all must pass
- GET /api/gyms returns 10 gyms after seeding with correct structure
- GET /api/gyms/:id/live returns all required fields
- GET /api/anomalies returns empty array when no anomalies exist
- PATCH /api/anomalies/:id/dismiss returns 403 when severity is 'critical'
- POST /api/simulator/start returns `{ status: 'running' }`
- All endpoints return correct HTTP status codes on invalid input (400, 404, 403)
- Coverage report must be included. Target: 80%+ (below 60% = 0 points)

### Layer 3 — E2E Tests (Playwright), minimum 3, all must run headless
- Dashboard loads and displays gym list without errors
- Switching gym in dropdown updates occupancy count correctly
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
| 2. Architecture Decisions | Explain BRIN vs B-Tree vs partial index choices. Why materialized view for heatmap. Any non-obvious decisions. |
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
| 9 | Anomaly engine — all 3 types + auto-resolve | Test each type manually before submitting |
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
