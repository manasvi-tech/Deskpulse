'use strict';

/**
 * DeskPulse Seed Script — Part 1
 * Seeds: locations, resources, companies, members, memberships, payments.
 * Run:   node seed.js  (or called from app.js startup when locations table is empty)
 * DB:    process.env.DATABASE_URL  ||  postgres://deskpulse:deskpulse_secret@db:5432/deskpulse
 */

const { Pool }       = require('pg');
const { randomUUID } = require('crypto');

const DB_URL = process.env.DATABASE_URL
  || 'postgres://deskpulse:deskpulse_secret@db:5432/deskpulse';

// ── Name pools ────────────────────────────────────────────────────────────────
const FIRST = [
  'Rahul','Amit','Arjun','Vikram','Rajesh','Suresh','Ankit','Rohan',
  'Nikhil','Arun','Sanjay','Vivek','Deepak','Manish','Ravi','Sachin',
  'Manoj','Ajay','Abhishek','Vinod','Ramesh','Sunil','Harsh','Yash',
  'Dev','Kunal','Gaurav','Sumit','Tarun','Rohit','Mohit','Shivam',
  'Pranav','Kartik','Varun','Akhil','Vishal','Ritesh','Parag','Kiran',
  'Priya','Aarti','Deepa','Kavya','Meera','Sunita','Pooja','Nisha',
  'Ritu','Swati','Divya','Geeta','Rekha','Sneha','Anjali','Shruti',
  'Neha','Ananya','Pallavi','Isha','Kritika','Rani','Lakshmi','Maya',
  'Uma','Shalini','Preeti','Seema','Radha','Vandana','Anita','Poonam',
  'Shweta','Radhika','Tanvi','Nidhi','Aditi','Ria','Simran','Kirti',
];
const LAST = [
  'Sharma','Mehta','Verma','Gupta','Kumar','Singh','Patel','Joshi',
  'Reddy','Nair','Kapoor','Chaudhary','Mishra','Yadav','Iyer','Agarwal',
  'Bose','Das','Chatterjee','Rao','Pillai','Menon','Srinivasan','Murthy',
  'Krishnan','Bhat','Hegde','Naidu','Choudhary','Pandey','Thakur','Shah',
  'Modi','Trivedi','Dubey','Saxena','Tiwari','Bhatt','Kulkarni','Desai',
];

// ── Location definitions ──────────────────────────────────────────────────────
const LOCS = [
  { key:'awfis_kora',     name:'Awfis - Koramangala',             city:'Bengaluru', address:'Koramangala, Bengaluru',          opens:'08:00', closes:'22:00', hot:60, ded:30, priv:8,  mtg:4, count:180 },
  { key:'awfis_indir',    name:'Awfis - Indiranagar',             city:'Bengaluru', address:'Indiranagar, Bengaluru',          opens:'08:00', closes:'22:00', hot:45, ded:20, priv:6,  mtg:3, count:140 },
  { key:'cowrks_bandra',  name:'CoWrks - Bandra West',            city:'Mumbai',    address:'Bandra West, Mumbai',             opens:'07:00', closes:'23:00', hot:80, ded:40, priv:12, mtg:6, count:220 },
  { key:'cowrks_powai',   name:'CoWrks - Powai',                  city:'Mumbai',    address:'Powai, Mumbai',                   opens:'07:30', closes:'22:30', hot:65, ded:30, priv:10, mtg:4, count:180 },
  { key:'innov8_cp',      name:'Innov8 - Connaught Place',        city:'New Delhi', address:'Connaught Place, New Delhi',      opens:'08:00', closes:'22:00', hot:55, ded:25, priv:8,  mtg:4, count:160 },
  { key:'innov8_lajpat',  name:'Innov8 - Lajpat Nagar',           city:'New Delhi', address:'Lajpat Nagar, New Delhi',         opens:'08:00', closes:'21:30', hot:40, ded:20, priv:6,  mtg:3, count:120 },
  { key:'spring_banjara', name:'91Springboard - Banjara Hills',   city:'Hyderabad', address:'Banjara Hills, Hyderabad',        opens:'08:00', closes:'22:00', hot:50, ded:25, priv:8,  mtg:3, count:150 },
  { key:'spring_noida',   name:'91Springboard - Sector 18 Noida', city:'Noida',     address:'Sector 18, Noida',                opens:'08:00', closes:'21:30', hot:35, ded:15, priv:5,  mtg:2, count:110 },
  { key:'bhive_salt',     name:'BHive - Salt Lake',               city:'Kolkata',   address:'Salt Lake, Kolkata',              opens:'08:00', closes:'21:00', hot:30, ded:12, priv:4,  mtg:2, count:130 },
  { key:'bhive_vel',      name:'BHIVE - Velachery',               city:'Chennai',   address:'Velachery, Chennai',              opens:'08:00', closes:'21:00', hot:25, ded:10, priv:3,  mtg:2, count:110 },
];

// ── Company definitions ───────────────────────────────────────────────────────
const CO_DEFS = [
  { name:'Kiraana Tech Solutions', locKey:'awfis_kora',     contactName:'Sanjay Iyer',    contactEmail:'sanjay.iyer@kiraanatechsolutions.com',  contactPhone:'9876543210' },
  { name:'Velocita Mobility',      locKey:'awfis_indir',    contactName:'Priya Hegde',    contactEmail:'priya.hegde@velocitamobility.com',      contactPhone:'8765432109' },
  { name:'NovaPay Fintech',        locKey:'cowrks_bandra',  contactName:'Rahul Mehta',    contactEmail:'rahul.mehta@novapayfin.com',            contactPhone:'9123456789' },
  { name:'Stackly Commerce',       locKey:'cowrks_powai',   contactName:'Ananya Shah',    contactEmail:'ananya.shah@stacklycommerce.com',       contactPhone:'7890123456' },
  { name:'ClearMind Analytics',    locKey:'innov8_cp',      contactName:'Vikram Sharma',  contactEmail:'vikram.sharma@clearmindanalytics.com',  contactPhone:'9988776655' },
  { name:'Orbis Healthtech',       locKey:'innov8_lajpat',  contactName:'Deepa Gupta',    contactEmail:'deepa.gupta@orbishealthtech.com',       contactPhone:'8877665544' },
  { name:'Traqr Logistics',        locKey:'spring_banjara', contactName:'Arun Reddy',     contactEmail:'arun.reddy@traqrlogistics.com',         contactPhone:'9765432108' },
  { name:'Lumio Energy',           locKey:'bhive_vel',      contactName:'Kavya Krishnan', contactEmail:'kavya.krishnan@lumioenergy.com',        contactPhone:'7654321098' },
];

// ── Plan config ───────────────────────────────────────────────────────────────
const PLAN_AMOUNT   = { day_pass: 499, hot_desk: 3999, dedicated_desk: 7999, private_office: 24999 };
const PLAN_DURATION = { day_pass: 30,  hot_desk: 30,   dedicated_desk: 90,   private_office: 365   };

// ── Helpers ───────────────────────────────────────────────────────────────────
const ri      = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick    = arr => arr[ri(0, arr.length - 1)];
const addDays = (d, n)  => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const subDays = (d, n)  => addDays(d, -n);

function genPhone() {
  return pick(['9', '8', '7']) + String(ri(100000000, 999999999));
}

const usedEmails = new Set();
function genEmail(first, last) {
  const base = `${first.toLowerCase()}.${last.toLowerCase()}`;
  let e;
  do { e = `${base}+${ri(1000, 9999)}@gmail.com`; } while (usedEmails.has(e));
  usedEmails.add(e);
  return e;
}

function pickPlan() {
  const r = Math.random();
  if (r < 0.15) return 'day_pass';
  if (r < 0.65) return 'hot_desk';
  if (r < 0.90) return 'dedicated_desk';
  return 'private_office';
}

// ── Generic batch insert ──────────────────────────────────────────────────────
// db can be a Pool or PoolClient (both expose .query())
async function batchInsert(db, table, cols, rows, conflictStr = 'ON CONFLICT DO NOTHING', batchSize = 500) {
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const nc    = cols.length;
    const vals  = batch.map((_, ri) =>
      '(' + cols.map((_, ci) => `$${ri * nc + ci + 1}`).join(',') + ')'
    ).join(',');
    const params = batch.flatMap(row => cols.map(c => row[c]));
    await db.query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${vals} ${conflictStr}`,
      params
    );
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  const pool = new Pool({ connectionString: DB_URL, max: 3 });

  try {
    // Idempotency: bail early if locations already seeded
    const { rows: chk } = await pool.query('SELECT COUNT(*)::int AS n FROM locations');
    if (chk[0].n >= 10) {
      console.log('[seed] Already seeded — skipping');
      return;
    }

    const now = new Date();

    // ── 1. LOCATIONS ──────────────────────────────────────────────────────────
    console.log('[seed] Seeding locations...');
    const locRows = LOCS.map(def => ({
      id:                    randomUUID(),
      name:                  def.name,
      city:                  def.city,
      address:               def.address,
      total_hot_desks:       def.hot,
      total_dedicated_desks: def.ded,
      total_private_offices: def.priv,
      total_meeting_rooms:   def.mtg,
      opens_at:              def.opens,
      closes_at:             def.closes,
      status:                'active',
      created_at:            now,
      updated_at:            now,
    }));
    await batchInsert(pool, 'locations',
      ['id','name','city','address','total_hot_desks','total_dedicated_desks',
       'total_private_offices','total_meeting_rooms','opens_at','closes_at',
       'status','created_at','updated_at'],
      locRows
    );
    // Build key → { id, ...def } lookup
    const locMap = Object.fromEntries(LOCS.map((def, i) => [def.key, { ...def, id: locRows[i].id }]));
    console.log('[seed] Seeding locations... done (10)');

    // ── 2. RESOURCES ──────────────────────────────────────────────────────────
    console.log('[seed] Seeding resources...');
    const resRows = [];
    for (const def of LOCS) {
      const locId = locMap[def.key].id;

      for (let i = 0; i < def.hot; i++) {
        const letter = String.fromCharCode(65 + Math.floor(i / 9));
        const num    = (i % 9) + 1;
        resRows.push({ id: randomUUID(), location_id: locId, type: 'hot_desk',       name: `Hot Desk ${letter}${num}`, capacity: 1,           status: 'available' });
      }
      for (let i = 1; i <= def.ded;  i++) resRows.push({ id: randomUUID(), location_id: locId, type: 'dedicated_desk',  name: `Dedicated Desk ${i}`,  capacity: 1,           status: 'available' });
      for (let i = 1; i <= def.priv; i++) resRows.push({ id: randomUUID(), location_id: locId, type: 'private_office',  name: `Private Office ${i}`,  capacity: 1,           status: 'available' });
      for (let i = 1; i <= def.mtg;  i++) resRows.push({ id: randomUUID(), location_id: locId, type: 'meeting_room',    name: `Meeting Room ${i}`,    capacity: ri(4, 10),   status: 'available' });
    }
    await batchInsert(pool, 'resources', ['id','location_id','type','name','capacity','status'], resRows);
    console.log(`[seed] Seeding resources... done (${resRows.length})`);

    // ── 3. COMPANIES ──────────────────────────────────────────────────────────
    console.log('[seed] Seeding companies...');
    const coRows = CO_DEFS.map(def => ({
      id:            randomUUID(),
      name:          def.name,
      contact_name:  def.contactName,
      contact_email: def.contactEmail,
      contact_phone: def.contactPhone,
      location_id:   locMap[def.locKey].id,
      created_at:    now,
    }));
    await batchInsert(pool, 'companies',
      ['id','name','contact_name','contact_email','contact_phone','location_id','created_at'],
      coRows
    );
    // locKey → company id  (only 8 locations have a company)
    const coMap = Object.fromEntries(CO_DEFS.map((def, i) => [def.locKey, coRows[i].id]));
    console.log('[seed] Seeding companies... done (8)');

    // ── 4. MEMBERS ────────────────────────────────────────────────────────────
    console.log('[seed] Seeding 1500 members...');
    const memberRows = [];
    const memberMeta = []; // parallel: { status, isExpiringSoon, locationId }

    for (const def of LOCS) {
      const locId   = locMap[def.key].id;
      const coId    = coMap[def.key] || null;
      const n       = def.count;

      const nExpiring = 8;                          // 8 per location = 80 expiring-soon total
      const nInactive = Math.floor(n * 0.10);
      const nFrozen   = Math.floor(n * 0.05);
      const nActive   = n - nInactive - nFrozen;

      // Status ordering: active first (so we flag first 8 as expiring-soon), then inactive, then frozen
      const statuses = [
        ...Array(nActive).fill('active'),
        ...Array(nInactive).fill('inactive'),
        ...Array(nFrozen).fill('frozen'),
      ];

      let activeSeen = 0;
      for (let i = 0; i < n; i++) {
        const first  = pick(FIRST);
        const last   = pick(LAST);
        const status = statuses[i];
        const isExpiringSoon = status === 'active' && activeSeen < nExpiring;
        if (status === 'active') activeSeen++;

        // 20% of members at a location belong to the company there (if one exists)
        const company_id = (coId && Math.random() < 0.20) ? coId : null;

        memberRows.push({
          id:          randomUUID(),
          company_id,
          location_id: locId,
          name:        `${first} ${last}`,
          email:       genEmail(first, last),
          phone:       genPhone(),
          status,
          created_at:  now,
        });
        memberMeta.push({ status, isExpiringSoon, locationId: locId });
      }
    }

    await batchInsert(pool, 'members',
      ['id','company_id','location_id','name','email','phone','status','created_at'],
      memberRows,
      'ON CONFLICT (email) DO NOTHING'
    );
    console.log('[seed] Seeding 1500 members... done');

    // ── 5. MEMBERSHIPS ────────────────────────────────────────────────────────
    console.log('[seed] Seeding memberships...');
    const membershipRows  = [];
    // memberId → [{ id, plan, startDate, memberType }]  — needed for payments
    const memberMsMap = {};

    for (let mi = 0; mi < memberRows.length; mi++) {
      const m    = memberRows[mi];
      const meta = memberMeta[mi];

      const isRenewal = meta.status === 'active' && Math.random() < 0.25;
      const plan      = meta.isExpiringSoon ? 'hot_desk' : pickPlan();
      const dur       = PLAN_DURATION[plan];

      let startDate, endDate, msStatus;

      if (meta.isExpiringSoon) {
        // end_date lands 1–6 days from now so the expiring-soon query catches it
        endDate   = addDays(now, ri(1, 6));
        startDate = subDays(endDate, dur);
        msStatus  = 'active';

      } else if (meta.status === 'inactive') {
        startDate = subDays(now, ri(91, 180));
        endDate   = addDays(startDate, dur);
        msStatus  = 'expired';

      } else if (meta.status === 'frozen') {
        startDate = subDays(now, ri(30, 90));
        endDate   = addDays(startDate, dur);
        msStatus  = 'paused';

      } else {
        // Regular active: keep end_date at least 8 days out so it doesn't
        // accidentally fall in the expiring-soon window
        const minAgo = 8;
        const maxAgo = Math.min(dur - 8, 89);
        startDate = subDays(now, ri(minAgo, Math.max(minAgo + 1, maxAgo)));
        endDate   = addDays(startDate, dur);
        msStatus  = 'active';
      }

      memberMsMap[m.id] = [];

      if (isRenewal) {
        // Original membership (expired before the current one)
        const origStart = subDays(startDate, dur + ri(1, 30));
        const origEnd   = addDays(origStart, dur);
        const origId    = randomUUID();
        membershipRows.push({
          id:          origId,
          member_id:   m.id,
          location_id: m.location_id,
          plan_type:   plan,
          start_date:  origStart,
          end_date:    origEnd,
          status:      'expired',
          member_type: 'new',
          created_at:  origStart,
        });
        memberMsMap[m.id].push({ id: origId, plan, startDate: origStart, memberType: 'new' });

        // Current renewal membership
        const renewId = randomUUID();
        membershipRows.push({
          id:          renewId,
          member_id:   m.id,
          location_id: m.location_id,
          plan_type:   plan,
          start_date:  startDate,
          end_date:    endDate,
          status:      msStatus,
          member_type: 'renewal',
          created_at:  startDate,
        });
        memberMsMap[m.id].push({ id: renewId, plan, startDate, memberType: 'renewal' });

      } else {
        const msId = randomUUID();
        membershipRows.push({
          id:          msId,
          member_id:   m.id,
          location_id: m.location_id,
          plan_type:   plan,
          start_date:  startDate,
          end_date:    endDate,
          status:      msStatus,
          member_type: 'new',
          created_at:  startDate,
        });
        memberMsMap[m.id].push({ id: msId, plan, startDate, memberType: 'new' });
      }
    }

    await batchInsert(pool, 'memberships',
      ['id','member_id','location_id','plan_type','start_date','end_date','status','member_type','created_at'],
      membershipRows
    );
    console.log(`[seed] Seeding memberships... done (${membershipRows.length})`);

    // ── 6. PAYMENTS ───────────────────────────────────────────────────────────
    console.log('[seed] Seeding payments...');
    const paymentRows = [];

    for (const m of memberRows) {
      for (const ms of (memberMsMap[m.id] || [])) {
        // paid_at = membership start_date ± 5 minutes, never in the future
        const jitter  = ri(-5, 5) * 60 * 1000; // ms
        const rawPaid = new Date(ms.startDate.getTime() + jitter);
        const paid_at = rawPaid > now ? now : rawPaid;

        paymentRows.push({
          id:            randomUUID(),
          member_id:     m.id,
          membership_id: ms.id,
          location_id:   m.location_id,
          amount:        PLAN_AMOUNT[ms.plan],
          payment_type:  ms.memberType,
          paid_at,
          notes:         null,
        });
      }
    }

    await batchInsert(pool, 'payments',
      ['id','member_id','membership_id','location_id','amount','payment_type','paid_at','notes'],
      paymentRows
    );
    console.log(`[seed] Seeding payments... done (${paymentRows.length})`);

    // ── 7. CHECK-INS ──────────────────────────────────────────────────────────
    console.log('[seed] Seeding check-ins (historical, ~80k records)...');

    // Per 3-minute slot: prob = hour_weight × dow_weight × DENSITY
    // Calibrated so each location gets ~8,000 historical check-ins over 90 days.
    const DENSITY = 0.72;
    let totalCheckins = 0;

    for (const def of LOCS) {
      const locId = locMap[def.key].id;

      const { rowCount } = await pool.query(`
        INSERT INTO checkins (member_id, location_id, checked_in, checked_out)
        WITH
        m AS (
          SELECT array_agg(id) AS ids
          FROM members WHERE location_id = $1 AND status = 'active'
        ),
        s AS (
          SELECT
            gs         AS ts,
            EXTRACT(HOUR   FROM gs)::int AS h,
            EXTRACT(MINUTE FROM gs)::int AS mn,
            EXTRACT(DOW    FROM gs)::int AS dow
          FROM generate_series(
            NOW() - INTERVAL '90 days',
            NOW() - INTERVAL '3 hours',
            INTERVAL '3 minutes'
          ) AS gs
        ),
        p AS (
          SELECT ts, m.ids,
            (CASE
              WHEN h = 7 AND mn >= 30 THEN 0.50
              WHEN h = 8              THEN 0.50
              WHEN h BETWEEN 9  AND 11 THEN 1.00
              WHEN h BETWEEN 12 AND 13 THEN 0.40
              WHEN h BETWEEN 14 AND 16 THEN 0.25
              WHEN h BETWEEN 17 AND 19 THEN 0.80
              WHEN h BETWEEN 20 AND 21 THEN 0.30
              ELSE 0.0
            END) *
            (CASE dow
              WHEN 1 THEN 1.00 WHEN 2 THEN 0.95 WHEN 3 THEN 0.90
              WHEN 4 THEN 0.95 WHEN 5 THEN 0.80 WHEN 6 THEN 0.50
              WHEN 0 THEN 0.20 ELSE 0.0
            END) AS w
          FROM s CROSS JOIN m
        )
        SELECT
          ids[(floor(random() * array_length(ids, 1)) + 1)::int],
          $1::uuid,
          ts,
          ts + (random() * 360 + 120) * INTERVAL '1 minute'
        FROM p
        WHERE w > 0 AND random() < w * $2::float AND ids IS NOT NULL
        ON CONFLICT DO NOTHING
      `, [locId, DENSITY]);

      totalCheckins += (rowCount || 0);
    }

    console.log(`[seed] Historical check-ins inserted (${totalCheckins})`);

    // ── Pre-seeded open check-ins (checked_out = NULL) ────────────────────────
    // Scenario A: bhive_vel — intentionally 0 open check-ins; most recent historical
    //   check-in is ≥3 h before seed time → no_activity detector fires ✓
    // Scenario B: cowrks_bandra — 120–128 open check-ins; capacity 80+40+12=132
    //   → 91–97% → overbooking (critical) fires ✓
    const OPEN_CI = [
      { key: 'cowrks_bandra',  min: 120, max: 128 },
      { key: 'cowrks_powai',   min: 20,  max: 25  },
      { key: 'awfis_kora',     min: 15,  max: 20  },
      { key: 'innov8_cp',      min: 12,  max: 18  },
      { key: 'spring_banjara', min: 12,  max: 16  },
      { key: 'awfis_indir',    min: 8,   max: 12  },
      { key: 'innov8_lajpat',  min: 6,   max: 10  },
      { key: 'spring_noida',   min: 6,   max: 10  },
      { key: 'bhive_salt',     min: 6,   max: 10  },
      // bhive_vel omitted — 0 open check-ins (Scenario A)
    ];

    for (const spec of OPEN_CI) {
      const locId = locMap[spec.key].id;
      const count = ri(spec.min, spec.max);

      const { rows: ciMembers } = await pool.query(
        `SELECT id FROM members
         WHERE location_id = $1 AND status = 'active'
         ORDER BY random() LIMIT $2`,
        [locId, count]
      );
      if (ciMembers.length === 0) continue;

      const openRows = ciMembers.map(m => ({
        member_id:   m.id,
        location_id: locId,
        checked_in:  new Date(now.getTime() - ri(5, 89) * 60000),
        checked_out: null,
      }));

      await batchInsert(pool, 'checkins',
        ['member_id', 'location_id', 'checked_in', 'checked_out'],
        openRows
      );
      totalCheckins += openRows.length;
    }

    console.log(`[seed] Seeding check-ins... done (~${totalCheckins} total, includes open)`);

    // Populate materialized view immediately after seeding check-ins
    await pool.query('REFRESH MATERIALIZED VIEW location_hourly_stats');
    console.log('[seed] Materialized view refreshed');

    // ── 8. ANOMALY SCENARIOS ──────────────────────────────────────────────────
    // Scenario A/B already ensured above via check-in counts.
    // Scenario C — revenue_drop (BHive Salt Lake)
    //   Last week same weekday: 8 × ₹7,999 = ₹63,992 (≥ ₹30,000 threshold)
    //   Today: 1 × ₹499 → ratio ≈ 0.008 << 0.70 → revenue_drop fires ✓
    console.log('[seed] Seeding anomaly scenarios C and D...');

    {
      const saltId = locMap['bhive_salt'].id;
      const { rows: saltMs } = await pool.query(
        `SELECT m.id AS mid, ms.id AS msid
         FROM members m
         JOIN memberships ms
           ON ms.member_id = m.id AND ms.status IN ('active', 'expired')
         WHERE m.location_id = $1 AND m.status = 'active'
         ORDER BY random() LIMIT 10`,
        [saltId]
      );

      if (saltMs.length >= 2) {
        const scenCRows = [];
        const lastWeek  = subDays(now, 7);
        lastWeek.setHours(10, 0, 0, 0);

        for (let i = 0; i < 8 && i < saltMs.length - 1; i++) {
          scenCRows.push({
            id:            randomUUID(),
            member_id:     saltMs[i].mid,
            membership_id: saltMs[i].msid,
            location_id:   saltId,
            amount:        7999,
            payment_type:  'renewal',
            paid_at:       new Date(lastWeek.getTime() + i * 3600000),
            notes:         'scenario_c_lastweek',
          });
        }

        // Today: 1 payment ≤ ₹4,000
        scenCRows.push({
          id:            randomUUID(),
          member_id:     saltMs[saltMs.length - 1].mid,
          membership_id: saltMs[saltMs.length - 1].msid,
          location_id:   saltId,
          amount:        499,
          payment_type:  'new',
          paid_at:       new Date(now.getTime() - ri(60, 300) * 60000),
          notes:         'scenario_c_today',
        });

        await batchInsert(pool, 'payments',
          ['id', 'member_id', 'membership_id', 'location_id', 'amount', 'payment_type', 'paid_at', 'notes'],
          scenCRows
        );
      }
    }

    console.log('[seed] Anomaly scenarios C and D... done');

    // ── 9. BOOKINGS ───────────────────────────────────────────────────────────
    console.log('[seed] Seeding bookings (60-day history)...');

    // Build location → meeting-room IDs from resRows already in memory
    const roomsByLoc = {};
    for (const r of resRows) {
      if (r.type !== 'meeting_room') continue;
      if (!roomsByLoc[r.location_id]) roomsByLoc[r.location_id] = [];
      roomsByLoc[r.location_id].push(r.id);
    }

    // Build location → active-member IDs from memberRows already in memory
    const activeMsByLoc = {};
    for (const m of memberRows) {
      if (m.status !== 'active') continue;
      if (!activeMsByLoc[m.location_id]) activeMsByLoc[m.location_id] = [];
      activeMsByLoc[m.location_id].push(m.id);
    }

    const bookingRows = [];

    for (const def of LOCS) {
      const locId = locMap[def.key].id;
      const rooms = roomsByLoc[locId]    || [];
      const mems  = activeMsByLoc[locId] || [];
      if (!rooms.length || !mems.length) continue;

      for (let d = 60; d >= 1; d--) {
        const dayBase = subDays(now, d);
        dayBase.setHours(0, 0, 0, 0);
        const nSlots = ri(5, 10);

        for (let s = 0; s < nSlots; s++) {
          const startH = 9 + s;
          if (startH >= 21) break;

          const starts    = new Date(dayBase.getTime() + startH * 3600000 + ri(0, 30) * 60000);
          const ends      = new Date(starts.getTime() + ri(1, 3) * 3600000);
          const rnd       = Math.random();
          const status    = rnd < 0.70 ? 'confirmed' : rnd < 0.85 ? 'cancelled' : 'no_show';
          const createdAt = new Date(starts.getTime() - ri(24, 72) * 3600000);

          bookingRows.push({
            id:          randomUUID(),
            member_id:   mems[ri(0, mems.length - 1)],
            location_id: locId,
            resource_id: rooms[ri(0, rooms.length - 1)],
            starts_at:   starts,
            ends_at:     ends,
            status,
            amount:      ri(500, 2000),
            created_at:  createdAt,
          });
        }
      }
    }

    // Scenario D - high_no_show (91Springboard Sector 18 Noida)
    // 15 bookings today: 10 no_show + 5 confirmed = 66.7% no_show rate > 30% threshold
    {
      const noidaId = locMap['spring_noida'].id;
      const rooms   = roomsByLoc[noidaId]    || [];
      const mems    = activeMsByLoc[noidaId] || [];

      if (rooms.length && mems.length) {
        const todayBase = new Date(now);
        todayBase.setHours(0, 0, 0, 0);

        for (let i = 0; i < 15; i++) {
          // Stagger 30 min apart from 09:00 → last slot at 16:00
          const starts    = new Date(todayBase.getTime() + (9 * 60 + i * 30) * 60000);
          const ends      = new Date(starts.getTime() + ri(1, 3) * 3600000);
          const createdAt = new Date(starts.getTime() - ri(24, 72) * 3600000);

          bookingRows.push({
            id:          randomUUID(),
            member_id:   mems[ri(0, mems.length - 1)],
            location_id: noidaId,
            resource_id: rooms[ri(0, rooms.length - 1)],
            starts_at:   starts,
            ends_at:     ends,
            status:      i < 10 ? 'no_show' : 'confirmed',
            amount:      ri(500, 2000),
            created_at:  createdAt,
          });
        }
      }
    }

    await batchInsert(pool, 'bookings',
      ['id', 'member_id', 'location_id', 'resource_id', 'starts_at', 'ends_at', 'status', 'amount', 'created_at'],
      bookingRows
    );
    console.log(`[seed] Seeding bookings... done (${bookingRows.length})`);

    // ── 10. USERS ─────────────────────────────────────────────────────────────
    const { seedUsers } = require('./seedUsers');
    await seedUsers(pool);

    console.log('[seed] ✔ All done — 10 locations, 1500 members, ~80k check-ins, bookings, anomaly scenarios, and users seeded.');

  } finally {
    await pool.end();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
if (require.main === module) {
  seed()
    .then(() => { console.log('[seed] Done.'); process.exit(0); })
    .catch(err => { console.error('[seed] Fatal:', err.message); process.exit(1); });
}

module.exports = { seed };
