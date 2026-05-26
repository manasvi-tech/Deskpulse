-- =============================================================================
-- WTF LivePulse — Master Seed Script
-- Auto-runs via /docker-entrypoint-initdb.d on first Postgres init
-- Idempotent: INSERT ... ON CONFLICT DO NOTHING throughout
-- Insert order: gyms → members → churn-risk checkins → bulk checkins
--               → open checkins → anomaly scenarios → last_checkin_at UPDATE
--               → payments → anomaly scenario C → refresh MV
-- =============================================================================

-- ============================================================
-- 1. GYMS (10 exact locations)
-- ============================================================
\echo 'Seeding gyms...'

INSERT INTO gyms (id, name, city, address, capacity, status, opens_at, closes_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'WTF Gyms - Lajpat Nagar',    'New Delhi',  'Lajpat Nagar, New Delhi',      220, 'active', '05:30', '22:30', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Connaught Place',  'New Delhi',  'Connaught Place, New Delhi',   180, 'active', '06:00', '22:00', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Bandra West',      'Mumbai',     'Bandra West, Mumbai',          300, 'active', '05:00', '23:00', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Powai',             'Mumbai',     'Powai, Mumbai',                250, 'active', '05:30', '22:30', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Indiranagar',      'Bengaluru',  'Indiranagar, Bengaluru',       200, 'active', '05:30', '22:00', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Koramangala',      'Bengaluru',  'Koramangala, Bengaluru',       180, 'active', '06:00', '22:00', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Banjara Hills',    'Hyderabad',  'Banjara Hills, Hyderabad',     160, 'active', '06:00', '22:00', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Sector 18 Noida',  'Noida',      'Sector 18, Noida',             140, 'active', '06:00', '21:30', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Salt Lake',        'Kolkata',    'Salt Lake, Kolkata',           120, 'active', '06:00', '21:00', NOW(), NOW()),
  (gen_random_uuid(), 'WTF Gyms - Velachery',        'Chennai',    'Velachery, Chennai',           110, 'active', '06:00', '21:00', NOW(), NOW())
ON CONFLICT DO NOTHING;

\echo 'Seeding gyms... done'

-- ============================================================
-- Name pools (100 first names × 100 last names)
-- ============================================================
CREATE TEMP TABLE IF NOT EXISTS _fn (idx INT PRIMARY KEY, v TEXT);
INSERT INTO _fn VALUES
  (1,'Rahul'),(2,'Priya'),(3,'Ankit'),(4,'Neha'),(5,'Amit'),(6,'Pooja'),
  (7,'Rohit'),(8,'Sneha'),(9,'Vikram'),(10,'Divya'),(11,'Sanjay'),(12,'Kavya'),
  (13,'Arjun'),(14,'Anjali'),(15,'Karan'),(16,'Ritu'),(17,'Manish'),(18,'Shweta'),
  (19,'Deepak'),(20,'Nidhi'),(21,'Gaurav'),(22,'Preeti'),(23,'Varun'),(24,'Shruti'),
  (25,'Nitin'),(26,'Riya'),(27,'Tarun'),(28,'Smita'),(29,'Akash'),(30,'Meena'),
  (31,'Suresh'),(32,'Geeta'),(33,'Ramesh'),(34,'Lata'),(35,'Manoj'),(36,'Sunita'),
  (37,'Vinod'),(38,'Rekha'),(39,'Harish'),(40,'Usha'),(41,'Girish'),(42,'Sarita'),
  (43,'Dinesh'),(44,'Pushpa'),(45,'Ashish'),(46,'Manju'),(47,'Rajesh'),(48,'Anita'),
  (49,'Naresh'),(50,'Kamla'),(51,'Mukesh'),(52,'Savita'),(53,'Sunil'),(54,'Saroj'),
  (55,'Sachin'),(56,'Archana'),(57,'Arun'),(58,'Sudha'),(59,'Vivek'),(60,'Seema'),
  (61,'Ajay'),(62,'Vandana'),(63,'Sushil'),(64,'Bindu'),(65,'Naveen'),(66,'Radha'),
  (67,'Praveen'),(68,'Meera'),(69,'Shyam'),(70,'Kusum'),(71,'Dev'),(72,'Nisha'),
  (73,'Rajan'),(74,'Gita'),(75,'Aditya'),(76,'Sonal'),(77,'Yash'),(78,'Ruchi'),
  (79,'Mohit'),(80,'Payal'),(81,'Aarav'),(82,'Ishita'),(83,'Kabir'),(84,'Trisha'),
  (85,'Nikhil'),(86,'Simran'),(87,'Rohan'),(88,'Tanya'),(89,'Aryan'),(90,'Poonam'),
  (91,'Ishan'),(92,'Kratika'),(93,'Shivam'),(94,'Palak'),(95,'Kunal'),(96,'Divyanka'),
  (97,'Pranav'),(98,'Komal'),(99,'Ritesh'),(100,'Swati')
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE IF NOT EXISTS _ln (idx INT PRIMARY KEY, v TEXT);
INSERT INTO _ln VALUES
  (1,'Sharma'),(2,'Verma'),(3,'Mehta'),(4,'Singh'),(5,'Kumar'),(6,'Gupta'),
  (7,'Patel'),(8,'Shah'),(9,'Joshi'),(10,'Agarwal'),(11,'Mishra'),(12,'Tiwari'),
  (13,'Yadav'),(14,'Nair'),(15,'Pillai'),(16,'Reddy'),(17,'Rao'),(18,'Iyer'),
  (19,'Krishnan'),(20,'Menon'),(21,'Das'),(22,'Roy'),(23,'Bose'),(24,'Sen'),
  (25,'Mukherjee'),(26,'Chatterjee'),(27,'Banerjee'),(28,'Ghosh'),(29,'Sinha'),(30,'Pandey'),
  (31,'Dubey'),(32,'Shukla'),(33,'Tripathi'),(34,'Srivastava'),(35,'Dwivedi'),(36,'Chaturvedi'),
  (37,'Kapoor'),(38,'Malhotra'),(39,'Khanna'),(40,'Ahuja'),(41,'Bhatia'),(42,'Chopra'),
  (43,'Arora'),(44,'Grover'),(45,'Sethi'),(46,'Taneja'),(47,'Wadhwa'),(48,'Mehra'),
  (49,'Sabharwal'),(50,'Anand'),(51,'Jain'),(52,'Soni'),(53,'Bansal'),(54,'Mittal'),
  (55,'Goel'),(56,'Aggarwal'),(57,'Rastogi'),(58,'Saxena'),(59,'Mathur'),(60,'Bhatnagar'),
  (61,'Kulkarni'),(62,'Desai'),(63,'Naik'),(64,'Pawar'),(65,'Jadhav'),(66,'Patil'),
  (67,'Shinde'),(68,'More'),(69,'Kadam'),(70,'Gaikwad'),(71,'Bhosale'),(72,'Deshpande'),
  (73,'Gokhale'),(74,'Apte'),(75,'Kelkar'),(76,'Karnik'),(77,'Shetty'),(78,'Kamath'),
  (79,'Nayak'),(80,'Hegde'),(81,'Bhat'),(82,'Pai'),(83,'George'),(84,'Thomas'),
  (85,'Mathew'),(86,'Joseph'),(87,'Philip'),(88,'Cherian'),(89,'Abraham'),(90,'Simon'),
  (91,'Jacob'),(92,'Alex'),(93,'Paul'),(94,'John'),(95,'Iyer'),(96,'Pillai'),
  (97,'Rajan'),(98,'Nambiar'),(99,'Varma'),(100,'Menon')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. MEMBERS (5,000 total)
-- ============================================================
\echo 'Seeding 5000 members...'

-- Gym config: distribution, plan percentages, status percentages
CREATE TEMP TABLE IF NOT EXISTS _gcfg AS
SELECT
  g.id                                                               AS gym_id,
  ROW_NUMBER() OVER (ORDER BY g.name)::int                          AS gym_pos,
  CASE g.name
    WHEN 'WTF Gyms - Lajpat Nagar'    THEN 650
    WHEN 'WTF Gyms - Connaught Place'  THEN 550
    WHEN 'WTF Gyms - Bandra West'      THEN 750
    WHEN 'WTF Gyms - Powai'            THEN 600
    WHEN 'WTF Gyms - Indiranagar'      THEN 550
    WHEN 'WTF Gyms - Koramangala'      THEN 500
    WHEN 'WTF Gyms - Banjara Hills'    THEN 450
    WHEN 'WTF Gyms - Sector 18 Noida'  THEN 400
    WHEN 'WTF Gyms - Salt Lake'        THEN 300
    WHEN 'WTF Gyms - Velachery'        THEN 250
  END                                                                AS total_cnt,
  -- plan monthly cumulative % threshold
  CASE g.name
    WHEN 'WTF Gyms - Lajpat Nagar'    THEN 50
    WHEN 'WTF Gyms - Banjara Hills'   THEN 50
    WHEN 'WTF Gyms - Sector 18 Noida' THEN 60
    WHEN 'WTF Gyms - Salt Lake'       THEN 60
    WHEN 'WTF Gyms - Velachery'       THEN 60
    ELSE 40
  END                                                                AS m_pct,
  -- quarterly cumulative % threshold (monthly + quarterly)
  CASE g.name
    WHEN 'WTF Gyms - Lajpat Nagar'    THEN 80
    WHEN 'WTF Gyms - Banjara Hills'   THEN 80
    WHEN 'WTF Gyms - Sector 18 Noida' THEN 85
    WHEN 'WTF Gyms - Salt Lake'       THEN 90
    WHEN 'WTF Gyms - Velachery'       THEN 90
    ELSE 80
  END                                                                AS q_cum_pct,
  -- active % threshold
  CASE g.name
    WHEN 'WTF Gyms - Lajpat Nagar'    THEN 88
    WHEN 'WTF Gyms - Connaught Place'  THEN 85
    WHEN 'WTF Gyms - Bandra West'      THEN 90
    WHEN 'WTF Gyms - Powai'            THEN 87
    WHEN 'WTF Gyms - Indiranagar'      THEN 89
    WHEN 'WTF Gyms - Koramangala'      THEN 86
    WHEN 'WTF Gyms - Banjara Hills'    THEN 84
    WHEN 'WTF Gyms - Sector 18 Noida'  THEN 82
    WHEN 'WTF Gyms - Salt Lake'        THEN 80
    WHEN 'WTF Gyms - Velachery'        THEN 78
  END                                                                AS act_pct,
  -- inactive cumulative threshold (active + 8%)
  CASE g.name
    WHEN 'WTF Gyms - Lajpat Nagar'    THEN 96
    WHEN 'WTF Gyms - Connaught Place'  THEN 93
    WHEN 'WTF Gyms - Bandra West'      THEN 98
    WHEN 'WTF Gyms - Powai'            THEN 95
    WHEN 'WTF Gyms - Indiranagar'      THEN 97
    WHEN 'WTF Gyms - Koramangala'      THEN 94
    WHEN 'WTF Gyms - Banjara Hills'    THEN 92
    WHEN 'WTF Gyms - Sector 18 Noida'  THEN 90
    WHEN 'WTF Gyms - Salt Lake'        THEN 88
    WHEN 'WTF Gyms - Velachery'        THEN 86
  END                                                                AS inact_pct
FROM gyms g
WHERE g.name LIKE 'WTF Gyms%';

INSERT INTO members (
  id, gym_id, name, email, phone,
  plan_type, member_type, status,
  joined_at, plan_expires_at, last_checkin_at, created_at
)
SELECT
  gen_random_uuid(),
  c.gym_id,
  -- Full name using hash-based deterministic name selection (fast, no ORDER BY)
  fn.v || ' ' || ln.v                                               AS name,
  -- Email: guaranteed unique via gym_pos + seq
  lower(fn.v) || '.' || lower(ln.v)
    || '+' || c.gym_pos::text || 'x' || c.seq::text || '@gmail.com' AS email,
  -- 10-digit Indian phone (starts with 9/8/7)
  (ARRAY['9','8','7'])[(abs(hashtext(c.gym_id::text || c.seq::text || 'ph')) % 3) + 1]
    || lpad((abs(hashtext(c.gym_id::text || c.seq::text || 'ph2')) % 1000000000)::text, 9, '0') AS phone,
  -- Plan type
  CASE
    WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'pt')) % 100) < c.m_pct       THEN 'monthly'
    WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'pt')) % 100) < c.q_cum_pct   THEN 'quarterly'
    ELSE 'annual'
  END                                                               AS plan_type,
  -- 80% new, 20% renewal
  CASE WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'mt')) % 10) < 8
       THEN 'new' ELSE 'renewal' END                                AS member_type,
  -- Status
  CASE
    WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'st')) % 100) < c.act_pct   THEN 'active'
    WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'st')) % 100) < c.inact_pct THEN 'inactive'
    ELSE 'frozen'
  END                                                               AS status,
  -- joined_at
  CASE
    WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'st')) % 100) < c.act_pct
      THEN NOW() - (((abs(hashtext(c.gym_id::text || c.seq::text || 'jd')) % 89) + 1)::text || ' days')::interval
    ELSE
      NOW() - (((abs(hashtext(c.gym_id::text || c.seq::text || 'jd')) % 90) + 91)::text || ' days')::interval
  END                                                               AS joined_at,
  -- plan_expires_at = joined_at + plan_duration
  (CASE
    WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'st')) % 100) < c.act_pct
      THEN NOW() - (((abs(hashtext(c.gym_id::text || c.seq::text || 'jd')) % 89) + 1)::text || ' days')::interval
    ELSE
      NOW() - (((abs(hashtext(c.gym_id::text || c.seq::text || 'jd')) % 90) + 91)::text || ' days')::interval
  END) + CASE
    WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'pt')) % 100) < c.m_pct       THEN INTERVAL '30 days'
    WHEN (abs(hashtext(c.gym_id::text || c.seq::text || 'pt')) % 100) < c.q_cum_pct   THEN INTERVAL '90 days'
    ELSE INTERVAL '365 days'
  END                                                               AS plan_expires_at,
  NULL                                                              AS last_checkin_at,
  NOW()                                                             AS created_at
FROM (
  SELECT c.gym_id, c.gym_pos, c.m_pct, c.q_cum_pct, c.act_pct, c.inact_pct, gs.seq
  FROM _gcfg c
  CROSS JOIN generate_series(1, c.total_cnt) AS gs(seq)
) c
JOIN _fn fn ON fn.idx = (abs(hashtext(c.gym_id::text || c.seq::text || 'fn')) % 100) + 1
JOIN _ln ln ON ln.idx = (abs(hashtext(c.gym_id::text || c.seq::text || 'ln')) % 100) + 1
ON CONFLICT (email) DO NOTHING;

\echo 'Seeding 5000 members... done'

-- ============================================================
-- 3. CHURN RISK (must happen BEFORE bulk check-in insert)
-- These members get old check-ins; they are then excluded from
-- the bulk insert so their last_checkin_at stays deliberately old.
-- HIGH: 15 per gym × 10 = 150 (last checkin 45–60 days ago)
-- CRITICAL: 8 per gym × 10 = 80 (last checkin 60–90 days ago)
-- ============================================================
\echo 'Seeding churn risk members...'

-- Mark churn risk members temporarily using last_checkin_at = sentinel value
-- We set actual old timestamps directly

DO $$
DECLARE
  r    RECORD;
  mid  UUID;
  ts   TIMESTAMPTZ;
  cnt  INT := 0;
BEGIN
  -- HIGH RISK: 15 active members per gym, last checkin 45–60 days ago
  FOR r IN SELECT id AS gid FROM gyms ORDER BY name LOOP
    FOR mid IN
      SELECT id FROM members
      WHERE gym_id = r.gid AND status = 'active' AND last_checkin_at IS NULL
      ORDER BY id
      LIMIT 15
    LOOP
      ts := NOW()
            - (45 + (random() * 14.9)::int) * INTERVAL '1 day'
            - (random() * 119)::int * INTERVAL '1 minute';

      INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
        VALUES (mid, r.gid, ts, ts + (45 + (random() * 44)::int) * INTERVAL '1 minute')
      ON CONFLICT DO NOTHING;

      UPDATE members SET last_checkin_at = ts WHERE id = mid;
      cnt := cnt + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'HIGH risk churn: % members seeded', cnt;
END $$;

DO $$
DECLARE
  r    RECORD;
  mid  UUID;
  ts   TIMESTAMPTZ;
  cnt  INT := 0;
BEGIN
  -- CRITICAL RISK: 8 active members per gym (those still without last_checkin_at)
  -- last checkin 60–90 days ago
  FOR r IN SELECT id AS gid FROM gyms ORDER BY name LOOP
    FOR mid IN
      SELECT id FROM members
      WHERE gym_id = r.gid AND status = 'active' AND last_checkin_at IS NULL
      ORDER BY id
      LIMIT 8
    LOOP
      ts := NOW()
            - (60 + (random() * 29.9)::int) * INTERVAL '1 day'
            - (random() * 119)::int * INTERVAL '1 minute';

      INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
        VALUES (mid, r.gid, ts, ts + (45 + (random() * 44)::int) * INTERVAL '1 minute')
      ON CONFLICT DO NOTHING;

      UPDATE members SET last_checkin_at = ts WHERE id = mid;
      cnt := cnt + 1;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'CRITICAL risk churn: % members seeded', cnt;
END $$;

\echo 'Seeding churn risk members... done'

-- ============================================================
-- 4. BULK CHECK-IN INSERT (~270,000 rows via generate_series)
-- Excludes churn-risk members (those with last_checkin_at already set)
-- Base: 365 rows/gym/day at 1.0× dow × hourly weights → ~272k total
-- ============================================================
\echo 'Seeding check-ins (30-60 seconds)...'

-- Hour cumulative weights for inverse-CDF sampling (total = 10.50)
CREATE TEMP TABLE IF NOT EXISTS _hw AS
SELECT h::int AS h, cw FROM (
  SELECT h, SUM(w) OVER (ORDER BY h ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cw
  FROM (VALUES
    (0,0.00),(1,0.00),(2,0.00),(3,0.00),(4,0.00),(5,0.60),
    (6,0.60),(7,1.00),(8,1.00),(9,1.00),(10,0.40),(11,0.40),
    (12,0.30),(13,0.30),(14,0.20),(15,0.20),(16,0.20),(17,0.90),
    (18,0.90),(19,0.90),(20,0.90),(21,0.35),(22,0.35),(23,0.00)
  ) AS t(h,w)
) sub;

-- Day-of-week multipliers (0=Sun..6=Sat)
CREATE TEMP TABLE IF NOT EXISTS _dw AS
SELECT * FROM (VALUES (0,0.45),(1,1.00),(2,0.95),(3,0.90),(4,0.95),(5,0.85),(6,0.70)) AS t(dow, wt);

-- Active members eligible for bulk check-ins (exclude churn-risk = those with last_checkin_at set)
CREATE TEMP TABLE IF NOT EXISTS _gm AS
SELECT
  gym_id,
  array_agg(id ORDER BY id) AS mids,
  count(*)::int              AS mcnt
FROM members
WHERE status = 'active'
  AND last_checkin_at IS NULL   -- exclude churn risk members already seeded
GROUP BY gym_id;

INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
SELECT
  gm.mids[1 + (floor(random() * gm.mcnt))::int],
  sub.gym_id,
  sub.ts,
  sub.ts + ((45 + (floor(random() * 46))::int)::text || ' minutes')::interval
FROM (
  SELECT
    g.id AS gym_id,
    (DATE_TRUNC('day', NOW())
      - (days_ago::text || ' days')::interval
      + (hw.h::text || ' hours')::interval
      + (floor(random() * 60)::int::text || ' minutes')::interval
    ) AS ts
  FROM gyms g
  CROSS JOIN generate_series(1, 90) AS d(days_ago)
  CROSS JOIN LATERAL (
    SELECT wt FROM _dw
    WHERE dow = EXTRACT(DOW FROM NOW() - (d.days_ago::text || ' days')::interval)::int
  ) dm
  -- Generate ~365 * dow_weight rows per gym per day
  CROSS JOIN generate_series(1, GREATEST(1, ROUND(365.0 * dm.wt)::int)) AS r(rn)
  -- Weighted random hour via inverse CDF (strict > skips zero-weight hours)
  CROSS JOIN LATERAL (
    SELECT hw2.h FROM _hw hw2
    WHERE hw2.cw > random() * 10.50
    ORDER BY hw2.cw LIMIT 1
  ) hw
  WHERE g.name LIKE 'WTF Gyms%'
) sub
JOIN _gm gm ON gm.gym_id = sub.gym_id
-- All must be historical (> 2 hours ago = checked_out applies)
WHERE sub.ts < NOW() - INTERVAL '2 hours'
  AND sub.ts > NOW() - INTERVAL '91 days';

\echo 'Seeding check-ins... done'

-- ============================================================
-- 5. PRE-SEEDED OPEN CHECK-INS (checked_out IS NULL)
-- Powai: 25–35 | Medium gyms: 15–25 | Small (Noida, Salt Lake): 8–15
-- Velachery: 0 (Scenario A)  |  Bandra West: 275–295 (Scenario B)
-- ============================================================
\echo 'Seeding pre-seeded open check-ins...'

DO $$
DECLARE
  rec     RECORD;
  mid     UUID;
  ts      TIMESTAMPTZ;
  target  INT;
  seeded  INT;
  -- [gym_name, min_open, max_open]
  cfg     TEXT[][] := ARRAY[
    ARRAY['WTF Gyms - Powai',             '25','35'],
    ARRAY['WTF Gyms - Lajpat Nagar',      '15','25'],
    ARRAY['WTF Gyms - Connaught Place',   '15','25'],
    ARRAY['WTF Gyms - Indiranagar',       '15','25'],
    ARRAY['WTF Gyms - Koramangala',       '15','25'],
    ARRAY['WTF Gyms - Banjara Hills',     '15','25'],
    ARRAY['WTF Gyms - Sector 18 Noida',    '8','15'],
    ARRAY['WTF Gyms - Salt Lake',          '8','15']
  ];
  row_    TEXT[];
  gid     UUID;
BEGIN
  FOREACH row_ SLICE 1 IN ARRAY cfg LOOP
    SELECT id INTO gid FROM gyms WHERE name = row_[1] LIMIT 1;
    CONTINUE WHEN gid IS NULL;

    target := row_[2]::int + (random() * (row_[3]::int - row_[2]::int))::int;
    seeded := 0;

    FOR mid IN
      SELECT m.id FROM members m
      WHERE m.gym_id = gid AND m.status = 'active'
      ORDER BY random()
      LIMIT target
    LOOP
      ts := NOW() - ((floor(random() * 88) + 1)::int::text || ' minutes')::interval;
      INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
        VALUES (mid, gid, ts, NULL)
      ON CONFLICT DO NOTHING;
      seeded := seeded + 1;
    END LOOP;

    RAISE NOTICE 'Open check-ins seeded for %: %', row_[1], seeded;
  END LOOP;
END $$;

\echo 'Pre-seeded open check-ins done'

-- ============================================================
-- ANOMALY SCENARIO A — Velachery: 0 open check-ins
-- Most recent checkins row must be >= 2h 10m before seed time
-- ============================================================
\echo 'Seeding Scenario A: Velachery...'

DO $$
DECLARE
  gid    UUID;
  mid    UUID;
  old_ts TIMESTAMPTZ := NOW() - INTERVAL '2 hours 15 minutes';
BEGIN
  SELECT id INTO gid FROM gyms WHERE name = 'WTF Gyms - Velachery' LIMIT 1;

  -- Ensure no open check-ins for Velachery
  DELETE FROM checkins WHERE gym_id = gid AND checked_out IS NULL;

  -- Push most recent closed check-in to be at least 2h15m ago
  UPDATE checkins
  SET checked_in  = old_ts,
      checked_out = old_ts + INTERVAL '55 minutes'
  WHERE id = (
    SELECT id FROM checkins WHERE gym_id = gid ORDER BY checked_in DESC LIMIT 1
  )
  AND checked_in > old_ts;

  -- Safety: if Velachery has no check-ins at all, insert one
  IF NOT EXISTS (SELECT 1 FROM checkins WHERE gym_id = gid LIMIT 1) THEN
    SELECT id INTO mid FROM members WHERE gym_id = gid AND status = 'active' LIMIT 1;
    IF mid IS NOT NULL THEN
      INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
        VALUES (mid, gid, old_ts, old_ts + INTERVAL '55 minutes');
    END IF;
  END IF;

  RAISE NOTICE 'Scenario A done: Velachery 0 open check-ins, last at ~%', old_ts;
END $$;

-- ============================================================
-- ANOMALY SCENARIO B — Bandra West: 275–295 open check-ins
-- All checked_in within last 90 minutes, checked_out IS NULL
-- ============================================================
\echo 'Seeding Scenario B: Bandra West capacity breach...'

DO $$
DECLARE
  gid    UUID;
  mid    UUID;
  ts     TIMESTAMPTZ;
  target INT := 285;
  cnt    INT := 0;
BEGIN
  SELECT id INTO gid FROM gyms WHERE name = 'WTF Gyms - Bandra West' LIMIT 1;

  -- Clear any existing open check-ins for Bandra West
  DELETE FROM checkins WHERE gym_id = gid AND checked_out IS NULL;

  FOR mid IN
    SELECT m.id FROM members m
    WHERE m.gym_id = gid AND m.status = 'active'
    ORDER BY random()
    LIMIT target
  LOOP
    ts := NOW() - ((floor(random() * 88) + 1)::int::text || ' minutes')::interval;
    INSERT INTO checkins (member_id, gym_id, checked_in, checked_out)
      VALUES (mid, gid, ts, NULL)
    ON CONFLICT DO NOTHING;
    cnt := cnt + 1;
  END LOOP;

  RAISE NOTICE 'Scenario B done: Bandra West % open check-ins', cnt;
END $$;

\echo 'Anomaly scenarios A and B done'

-- ============================================================
-- 6. Batch UPDATE members.last_checkin_at
-- Only updates members where last_checkin_at IS NULL
-- (churn-risk members already have their deliberately-old value set)
-- ============================================================
\echo 'Updating members.last_checkin_at...'

UPDATE members m
SET last_checkin_at = lc.max_ci
FROM (
  SELECT member_id, MAX(checked_in) AS max_ci
  FROM checkins
  GROUP BY member_id
) lc
WHERE m.id = lc.member_id
  AND m.last_checkin_at IS NULL;

\echo 'members.last_checkin_at updated'

-- ============================================================
-- 7. PAYMENTS
-- Every member: ≥1 payment (new)
-- Renewal members: additional renewal payment
-- Prices: monthly=1499, quarterly=3999, annual=11999
-- paid_at = joined_at ±5 min, never future-dated
-- ============================================================
\echo 'Seeding payments...'

-- Initial (new) payment for all members
INSERT INTO payments (id, member_id, gym_id, amount, plan_type, payment_type, paid_at, notes)
SELECT
  gen_random_uuid(),
  m.id,
  m.gym_id,
  CASE m.plan_type WHEN 'monthly' THEN 1499.00 WHEN 'quarterly' THEN 3999.00 ELSE 11999.00 END,
  m.plan_type,
  'new',
  LEAST(
    m.joined_at + ((floor(random() * 11) - 5)::int::text || ' minutes')::interval,
    NOW() - INTERVAL '1 minute'
  ),
  'Initial membership'
FROM members m
ON CONFLICT DO NOTHING;

-- Renewal payment for members with member_type = 'renewal'
INSERT INTO payments (id, member_id, gym_id, amount, plan_type, payment_type, paid_at, notes)
SELECT
  gen_random_uuid(),
  m.id,
  m.gym_id,
  CASE m.plan_type WHEN 'monthly' THEN 1499.00 WHEN 'quarterly' THEN 3999.00 ELSE 11999.00 END,
  m.plan_type,
  'renewal',
  LEAST(
    m.joined_at
      + CASE m.plan_type
          WHEN 'monthly'   THEN INTERVAL '30 days'
          WHEN 'quarterly' THEN INTERVAL '90 days'
          ELSE                  INTERVAL '365 days'
        END
      + ((floor(random() * 11) - 5)::int::text || ' minutes')::interval,
    NOW() - INTERVAL '1 minute'
  ),
  'Renewal payment'
FROM members m
WHERE m.member_type = 'renewal'
ON CONFLICT DO NOTHING;

\echo 'Seeding payments... done'

-- ============================================================
-- ANOMALY SCENARIO C — Salt Lake revenue drop
-- Same weekday 7 days ago: 9 × quarterly (₹35,991 total ≥ ₹15,000)
-- Today: 1 × monthly (₹1,499 ≤ ₹3,000)
-- ============================================================
\echo 'Seeding Scenario C: Salt Lake revenue drop...'

DO $$
DECLARE
  gid     UUID;
  mid     UUID;
  lw_date DATE := CURRENT_DATE - 7;
  lw_ts   TIMESTAMPTZ;
  mids    UUID[];
  i       INT;
BEGIN
  SELECT id INTO gid FROM gyms WHERE name = 'WTF Gyms - Salt Lake' LIMIT 1;

  -- Remove Salt Lake payments from today and last week's same day (for clean scenario)
  DELETE FROM payments
  WHERE gym_id = gid
    AND paid_at >= DATE_TRUNC('day', NOW());

  DELETE FROM payments
  WHERE gym_id = gid
    AND paid_at >= lw_date::timestamptz
    AND paid_at  < (lw_date + 1)::timestamptz;

  -- Last week same day: 9 quarterly renewals = ₹35,991 total
  SELECT array_agg(id) INTO mids
  FROM (
    SELECT id FROM members
    WHERE gym_id = gid AND status = 'active'
    ORDER BY random()
    LIMIT 9
  ) sub;

  IF mids IS NOT NULL THEN
    FOR i IN 1 .. array_length(mids, 1) LOOP
      lw_ts := lw_date::timestamptz + '08:00:00'::interval
                + ((i * 25)::text || ' minutes')::interval;
      INSERT INTO payments (id, member_id, gym_id, amount, plan_type, payment_type, paid_at, notes)
        VALUES (gen_random_uuid(), mids[i], gid, 3999.00, 'quarterly', 'renewal',
                lw_ts, 'Scenario C last-week seed');
    END LOOP;
  END IF;

  -- Today: 1 monthly = ₹1,499
  SELECT id INTO mid FROM members
  WHERE gym_id = gid AND status = 'active'
  ORDER BY random() LIMIT 1;

  IF mid IS NOT NULL THEN
    INSERT INTO payments (id, member_id, gym_id, amount, plan_type, payment_type, paid_at, notes)
      VALUES (gen_random_uuid(), mid, gid, 1499.00, 'monthly', 'new',
              DATE_TRUNC('day', NOW()) + '09:15:00'::interval, 'Scenario C today seed');
  END IF;

  RAISE NOTICE 'Scenario C done: Salt Lake last-week=% payments, today=1', coalesce(array_length(mids,1), 0);
END $$;

\echo 'Scenario C done'

-- ============================================================
-- 8. Refresh materialized view with all seeded data
-- ============================================================
\echo 'Refreshing gym_hourly_stats...'
REFRESH MATERIALIZED VIEW gym_hourly_stats;
\echo 'gym_hourly_stats refreshed'

\echo ''
\echo '======================================'
\echo ' WTF LivePulse seed complete!'
\echo '======================================'
