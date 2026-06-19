# DeskPulse — Master Context

## What This Project Is
DeskPulse — a real-time operations intelligence dashboard for co-working space chains. Operations managers get live visibility across all locations: who is present right now, revenue today, anomalies, and analytics. Built as a production-grade SaaS product targeting small co-working chains (3–15 locations).

## Absolute Hard Requirements
- `docker compose up` must start the ENTIRE stack with zero manual steps
- No npm install on host, no manual migrations, no external dependencies
- All critical PostgreSQL queries must return under 1ms on a seeded 90-day dataset
- A sequential scan on `checkins` or `payments` is an automatic failure
- WebSocket only — no polling anywhere

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

- Seed: 10 co-working locations, 1,500 members, 90 days of historical data
- Realistic patterns: peak volume 9–12am and 2–5pm (business hours), low mornings and evenings, minimal weekends
- New events generated every 2 seconds when running
- Writes directly to PostgreSQL (not mocked)
- UI control panel: Start/Pause button, Speed multiplier (1x/5x/10x), Reset to baseline

---

## UI Design Rules

**Theme: Light**

**Color Palette**
- Page background: #F8F9FA
- Card background: #FFFFFF
- Card border: #E2E8F0
- Sidebar/nav background: #1E293B (only dark element)
- Sidebar text and icons: #FFFFFF
- Primary text: #0F172A
- Secondary text: #64748B
- Accent: #0EA5E9 (sky-500) — used sparingly on interactive elements only
- Success/healthy: #16A34A
- Warning: #D97706
- Critical: #DC2626
- Muted label text: #94A3B8

**Typography**
- Font: Inter throughout
- Page titles: text-xl font-semibold
- Card titles: text-sm font-medium text-slate-500
- KPI numbers: text-4xl font-bold text-slate-900
- Body: text-sm text-slate-700
- Labels: text-xs font-medium uppercase text-slate-400

**Layout**
- Left sidebar: w-56, bg-slate-800, fixed height, white text and icons
- Main content: bg-slate-50 (#F8F9FA), p-6
- Cards: bg-white, border border-slate-200, rounded-xl, p-5
- No heavy shadows — border only on cards
- No gradients anywhere

**Tailwind classes to use**
- Page background: `bg-slate-50`
- Cards: `bg-white border border-slate-200 rounded-xl`
- Sidebar: `bg-slate-800`
- Accent buttons: `bg-sky-500 hover:bg-sky-600 text-white`
- KPI numbers: `text-4xl font-bold text-slate-900`
- Secondary text: `text-slate-500`
- Skeleton loaders: `animate-pulse bg-slate-200 rounded`

**Occupancy colour coding**
- < 60%: `text-green-600` (light theme needs darker greens)
- 60–85%: `text-amber-600`
- > 85%: `text-red-600`

**Live Indicators**
- WebSocket connected: small pulsing green dot (`bg-green-500 animate-ping`)
- WebSocket disconnected: grey dot — never show 'live' when connection is lost

**States**
- Skeleton loaders: `animate-pulse bg-slate-200 rounded` on all panels while fetching
- Error states: show inline in the relevant card with a warning icon — not just console.log
- No undefined visible anywhere in the UI

**Responsiveness**
- Functional at 1280px minimum width

**What NOT to do (UI)**
- No dark backgrounds except the sidebar
- No neon or bright teal anywhere
- No card shadows heavier than the border
- No gradients
- No Bootstrap or MUI defaults
- No rounded corners larger than rounded-xl

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

## Authentication & RBAC

### Users Table
Separate from members table. A user is a staff account. A member is a customer. Never mix these.

**users** — id (UUID PK), email (TEXT UNIQUE), password_hash (TEXT), role (TEXT CHECK IN ('super_admin','frontdesk')), location_id (UUID nullable FK → locations — NULL for super_admin, required for frontdesk), name (TEXT), is_active (BOOLEAN DEFAULT TRUE), created_at (TIMESTAMPTZ), updated_at (TIMESTAMPTZ)

### Roles and Access

| Feature | Super Admin | Frontdesk |
|---|---|---|
| All locations dashboard | ✅ | ❌ |
| Their location only | ✅ | ✅ |
| Switch between locations | ✅ | ❌ locked to their location |
| Analytics | ✅ all locations | ✅ their location only |
| Anomalies | ✅ all locations | ✅ their location only |
| Register new member | ✅ | ✅ their location only |
| Delete/deactivate member | ✅ | ✅ their location only |
| Simulator | ✅ | ❌ |
| User management page | ✅ | ❌ |
| Revenue data | ✅ | ✅ their location only |
| Cross-location comparison | ✅ | ❌ |

### Auth Implementation
- httpOnly cookie — no localStorage for tokens
- JWT stored in httpOnly cookie, signed with JWT_SECRET
- Cookie expiry: 3 days (JWT_EXPIRY=3d)
- Password hashing: bcryptjs with saltRounds=12
- All protected routes require valid JWT cookie
- Frontdesk routes additionally check location_id matches their assigned location

### Middleware
- `authMiddleware` — verifies JWT cookie, attaches user to req.user
- `requireRole(role)` — checks req.user.role matches required role
- `requireLocation` — for frontdesk, ensures they only access their own location_id data

### New API Endpoints

```
POST   /api/auth/login    — { email, password } → httpOnly cookie + { user: { id, name, role, location_id } }
POST   /api/auth/logout   — clears httpOnly cookie
GET    /api/auth/me       — returns current user from cookie

GET    /api/users         — list all staff accounts (super_admin only)
POST   /api/users         — create staff account { name, email, password, role, location_id } (super_admin only)
PATCH  /api/users/:id     — update staff account name/role/location_id/is_active (super_admin only)
DELETE /api/users/:id     — soft delete, sets is_active=false (super_admin only)

POST   /api/members       — register new member { name, email, phone, plan_type, location_id }
PATCH  /api/members/:id   — update member status
DELETE /api/members/:id   — soft delete: status=inactive, cascades memberships to cancelled
```

### Demo Mode
Controlled by `DEMO_MODE=true` environment variable.

When `DEMO_MODE=true`:
- All write operations (POST/PATCH/DELETE except login/logout) return `403` with `{ demo: true, message: "Not allowed in demo mode" }`
- Frontend checks `VITE_DEMO_MODE=true` and shows "Not allowed. Demo purposes only." modal instead of executing write actions
- Read operations work normally
- Simulator start/stop/reset is allowed even in demo mode
- Anomaly dismiss is allowed even in demo mode

### Seeded Users (auto-seeded on docker compose up)

**Super Admin**
- name: Arjun Mehta
- email: admin@deskpulse.io
- password: demo1234
- role: super_admin
- location_id: NULL

**Frontdesk staff (one per location) — all password: demo1234**

| Name | Email | Location |
|---|---|---|
| Priya Sharma | staff.koramangala@deskpulse.io | Awfis — Koramangala |
| Rahul Verma | staff.indiranagar@deskpulse.io | Awfis — Indiranagar |
| Neha Patel | staff.bandrawest@deskpulse.io | CoWrks — Bandra West |
| Vikram Singh | staff.powai@deskpulse.io | CoWrks — Powai |
| Ananya Krishnan | staff.connaughtplace@deskpulse.io | Innov8 — Connaught Place |
| Rohan Gupta | staff.lajpatnagar@deskpulse.io | Innov8 — Lajpat Nagar |
| Sneha Reddy | staff.banjarahills@deskpulse.io | 91Springboard — Banjara Hills |
| Amit Joshi | staff.noida@deskpulse.io | 91Springboard — Sector 18 Noida |
| Kavya Nair | staff.saltlake@deskpulse.io | BHive — Salt Lake |
| Deepak Iyer | staff.velachery@deskpulse.io | BHIVE — Velachery |

All passwords hashed with bcrypt, saltRounds=12.

### New Environment Variables

```
DEMO_MODE=true
SESSION_SECRET=deskpulse_dev_secret_change_in_production
JWT_SECRET=deskpulse_jwt_secret_change_in_production
JWT_EXPIRY=3d
VITE_DEMO_MODE=true
```

### New Indexes

```sql
CREATE INDEX idx_users_email    ON users (email);
CREATE INDEX idx_users_location ON users (location_id) WHERE role = 'frontdesk';
CREATE INDEX idx_users_role     ON users (role);
```

### Frontend Auth Pages

**Login page (`/login`)**
- Clean centered card on light background
- DeskPulse logo at top
- Email + password fields
- Login button (sky-500)
- Demo credentials shown below form in a subtle info box:
  - Super Admin: admin@deskpulse.io / demo1234
  - Frontdesk (Bandra West): staff.bandrawest@deskpulse.io / demo1234
- On successful login redirect to dashboard
- On error show inline error message

**Demo banner**
- Shown at top of every page after login
- Light amber background, subtle
- Text: "You are viewing a live demo. Write operations are disabled."
- Not dismissable

**Demo modal (shown when write action attempted)**
- Small centered modal
- Icon: 🔒
- Title: "Not Available in Demo"
- Body: "This action is disabled in the demo environment. In production, you would be able to [action description]."
- Single button: "Got it"

**User Management page (super_admin only, 5th nav item)**
- Table of all staff accounts: Name, Email, Role, Location, Status, Actions
- Create new staff button (disabled in demo)
- Deactivate button per row (disabled in demo)
- Not visible in frontdesk nav at all

**Member Registration (both roles)**
- Modal or slide-over panel
- Fields: Full Name, Email, Phone, Plan Type (dropdown), Start Date
- Submit button (disabled in demo — shows modal instead)

---

## Seed Data Specification (reviewers verify these exact values)

### 10 Locations — Exact Values (do not invent different locations)

| # | Name | City | Hot Desks | Ded. Desks | Priv. Offices | Mtg. Rooms | Opens | Closes |
|---|---|---|---|---|---|---|---|---|
| 1 | Awfis — Koramangala | Bengaluru | 60 | 30 | 8 | 4 | 08:00 | 22:00 |
| 2 | Awfis — Indiranagar | Bengaluru | 45 | 20 | 6 | 3 | 08:00 | 22:00 |
| 3 | CoWrks — Bandra West | Mumbai | 80 | 40 | 12 | 6 | 07:00 | 23:00 |
| 4 | CoWrks — Powai | Mumbai | 65 | 30 | 10 | 4 | 07:30 | 22:30 |
| 5 | Innov8 — Connaught Place | New Delhi | 55 | 25 | 8 | 4 | 08:00 | 22:00 |
| 6 | Innov8 — Lajpat Nagar | New Delhi | 40 | 20 | 6 | 3 | 08:00 | 21:30 |
| 7 | 91Springboard — Banjara Hills | Hyderabad | 50 | 25 | 8 | 3 | 08:00 | 22:00 |
| 8 | 91Springboard — Sector 18 Noida | Noida | 35 | 15 | 5 | 2 | 08:00 | 21:30 |
| 9 | BHive — Salt Lake | Kolkata | 30 | 12 | 4 | 2 | 08:00 | 21:00 |
| 10 | BHIVE — Velachery | Chennai | 25 | 10 | 3 | 2 | 08:00 | 21:00 |

All locations status = 'active'. Use gen_random_uuid() for IDs — never hardcode UUIDs. Store location UUIDs in variables after insertion to use as foreign keys downstream.

**Occupancy capacity** (used for overbooking detection) = total_hot_desks + total_dedicated_desks + total_private_offices:

| Location | Occupancy Capacity |
|---|---|
| Awfis — Koramangala | 98 |
| Awfis — Indiranagar | 71 |
| CoWrks — Bandra West | 132 |
| CoWrks — Powai | 105 |
| Innov8 — Connaught Place | 88 |
| Innov8 — Lajpat Nagar | 66 |
| 91Springboard — Banjara Hills | 83 |
| 91Springboard — Sector 18 Noida | 55 |
| BHive — Salt Lake | 46 |
| BHIVE — Velachery | 38 |

### Member Distribution (exactly 1,500 total)

| Location | Count | day_pass% | hot_desk% | dedicated_desk% | private_office% | Active % |
|---|---|---|---|---|---|---|
| Awfis — Koramangala | 180 | 40% | 30% | 20% | 10% | 86% |
| Awfis — Indiranagar | 140 | 40% | 30% | 20% | 10% | 89% |
| CoWrks — Bandra West | 220 | 35% | 30% | 25% | 10% | 90% |
| CoWrks — Powai | 180 | 35% | 30% | 25% | 10% | 87% |
| Innov8 — Connaught Place | 160 | 35% | 30% | 25% | 10% | 85% |
| Innov8 — Lajpat Nagar | 120 | 40% | 30% | 20% | 10% | 88% |
| 91Springboard — Banjara Hills | 150 | 45% | 30% | 17% | 8% | 84% |
| 91Springboard — Sector 18 Noida | 110 | 50% | 30% | 15% | 5% | 82% |
| BHive — Salt Lake | 130 | 55% | 30% | 12% | 3% | 80% |
| BHIVE — Velachery | 110 | 55% | 30% | 12% | 3% | 78% |

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
| Expiring Soon | Active membership, end_date within 7 days, no newer active membership | 20 members |
| Inactive | Active membership, no check-in for 30+ days | 40 members |

**Critical:** Inactive members must have an actual checkins row whose checked_in timestamp matches their last known visit. If a member's last check-in was 35 days ago, there must be a real row in checkins with that timestamp. Seed this intentionally by setting start_date ≥ 45 days ago and inserting their last check-in 35+ days ago with no subsequent check-ins.

### Check-in Volume
- Total: ~90,000 records across all 10 locations over 90 days
- ~100 check-ins per location per day average

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
| Large (100+ capacity) | CoWrks — Bandra West, CoWrks — Powai | 20–30 open check-ins |
| Medium (65–99 capacity) | Awfis — Koramangala, Innov8 — Connaught Place, 91Springboard — Banjara Hills, Awfis — Indiranagar, Innov8 — Lajpat Nagar | 10–18 open check-ins |
| Small (<65 capacity) | 91Springboard — Sector 18 Noida, BHive — Salt Lake, BHIVE — Velachery | 5–10 open check-ins |

**Exception:** BHIVE — Velachery gets 0 open check-ins (see Anomaly Scenario A below). CoWrks — Bandra West gets 120–130 open check-ins (see Anomaly Scenario B below).

### Payment Data

- Every member gets at least 1 payment matching their current plan at the plan price
- Renewal members (member_type = 'renewal') get 2 payments — original + renewal
- paid_at = membership start_date (±5 minutes)
- No future-dated payments
- payment_type matches member_type ('new' or 'renewal')

### Anomaly Test Scenarios — Must be pre-built in seed (reviewers check within 60 seconds of docker compose up)

**Scenario A — No Activity (BHIVE — Velachery)**
- 0 open check-ins for BHIVE — Velachery
- Most recent checkins row for BHIVE — Velachery must have checked_in ≥ 2 hours 10 minutes before seed execution time
- Detector must fire: type = 'no_activity', severity = 'warning'
- Auto-resolves when any new check-in is recorded for BHIVE — Velachery

**Scenario B — Overbooking (CoWrks — Bandra West)**
- Seed 120–130 open check-ins (checked_out = NULL) for CoWrks — Bandra West (occupancy capacity = 132)
- All checked_in within the last 90 minutes
- Occupancy = 120–130 / 132 = 91–99% → above 90% threshold
- Detector must fire: type = 'overbooking', severity = 'critical'
- Must auto-resolve when occupancy drops below 85% (< 112 open check-ins) as simulator runs

**Scenario C — Revenue Drop (BHive — Salt Lake)**
- Same weekday 7 days ago: seed 8–10 payments totalling ≥ ₹15,000 for BHive — Salt Lake
- Today: seed 0–2 payments totalling ≤ ₹3,000 for BHive — Salt Lake
- Detector must fire: type = 'revenue_drop', severity = 'warning'
- Do not manipulate payment history for any other location

**Scenario D — High No-Show (Awfis — Koramangala)**
- Today: seed 12 confirmed bookings for Awfis — Koramangala in the bookings table, where 5 of them have status = 'no_show' (41.7% no-show rate, above 30% threshold)
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

Run against seeded data (1,500 members, 90 days, ~90,000+ check-in records). Screenshots go in `/benchmarks/screenshots/`.

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



## README Structure (all 5 sections mandatory)

| Section | What to Write |
|---|---|
| 1. Quick Start | `docker compose up` — nothing else. List Docker Desktop as only prerequisite. |
| 2. Architecture Decisions | Explain BRIN vs B-Tree vs partial index choices. Why materialized view for heatmap. Why memberships is a separate table from members. Any non-obvious decisions. |
| 3. AI Tools Used | List every AI tool used and exactly what each was used for. Hiding this = disqualification. Being thorough here = advantage. |
| 4. Query Benchmarks | Table of all 6 queries with measured execution time from EXPLAIN ANALYZE. Reference screenshots in /benchmarks. |
| 5. Known Limitations | Honest list of anything incomplete or not working. Silence is penalised more than honesty. |

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
- No class components in React
- No Redux unless genuinely needed (will be penalised as overengineering)
- No manual steps required after `docker compose up`
- No sequential scans on checkins or payments tables
- No hardcoded database credentials in source code
- Never store JWT in localStorage — httpOnly cookie only
- Never expose password_hash in any API response
- Never allow frontdesk to access another location's data
- Never allow self-registration — all user accounts created by super_admin only
- Never hard-delete members — always soft delete (status=inactive)
- Never hard-delete users — always soft delete (is_active=false)
