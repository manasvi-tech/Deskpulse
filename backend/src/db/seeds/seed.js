'use strict';

/**
 * DeskPulse Seed Script
 *
 * Philosophy (3 layers):
 *   Layer 1 — Historical (90 days of CLOSED sessions, all checked_out set)
 *   Layer 2 — Today clean (zero open check-ins except forced anomaly scenarios)
 *   Layer 3 — Simulator takes over from today onwards
 *
 * Insert order (strict FK order):
 *   locations → resources → companies → members → memberships →
 *   users → payments → checkins → bookings → anomaly scenarios
 */

const { Pool }       = require('pg');
const { randomUUID } = require('crypto');
const bcrypt         = require('bcryptjs');

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
  { key:'awfis_kora',     name:'Awfis - Koramangala',             city:'Bengaluru', address:'Koramangala, Bengaluru',     opens:'08:00', closes:'22:00', hot:60, ded:30, priv:8,  mtg:4, count:180 },
  { key:'awfis_indir',    name:'Awfis - Indiranagar',             city:'Bengaluru', address:'Indiranagar, Bengaluru',     opens:'08:00', closes:'22:00', hot:45, ded:20, priv:6,  mtg:3, count:140 },
  { key:'cowrks_bandra',  name:'CoWrks - Bandra West',            city:'Mumbai',    address:'Bandra West, Mumbai',        opens:'07:00', closes:'23:00', hot:80, ded:40, priv:12, mtg:6, count:220 },
  { key:'cowrks_powai',   name:'CoWrks - Powai',                  city:'Mumbai',    address:'Powai, Mumbai',              opens:'07:30', closes:'22:30', hot:65, ded:30, priv:10, mtg:4, count:180 },
  { key:'innov8_cp',      name:'Innov8 - Connaught Place',        city:'New Delhi', address:'Connaught Place, New Delhi', opens:'08:00', closes:'22:00', hot:55, ded:25, priv:8,  mtg:4, count:160 },
  { key:'innov8_lajpat',  name:'Innov8 - Lajpat Nagar',           city:'New Delhi', address:'Lajpat Nagar, New Delhi',   opens:'08:00', closes:'21:30', hot:40, ded:20, priv:6,  mtg:3, count:120 },
  { key:'spring_banjara', name:'91Springboard - Banjara Hills',   city:'Hyderabad', address:'Banjara Hills, Hyderabad',  opens:'08:00', closes:'22:00', hot:50, ded:25, priv:8,  mtg:3, count:150 },
  { key:'spring_noida',   name:'91Springboard - Sector 18 Noida', city:'Noida',     address:'Sector 18, Noida',          opens:'08:00', closes:'21:30', hot:35, ded:15, priv:5,  mtg:2, count:110 },
  { key:'bhive_salt',     name:'BHive - Salt Lake',               city:'Kolkata',   address:'Salt Lake, Kolkata',         opens:'08:00', closes:'21:00', hot:30, ded:12, priv:4,  mtg:2, count:130 },
  { key:'bhive_vel',      name:'BHIVE - Velachery',               city:'Chennai',   address:'Velachery, Chennai',         opens:'08:00', closes:'21:00', hot:25, ded:10, priv:3,  mtg:2, count:110 },
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
const PLAN_DURATION = { day_pass: 1,   hot_desk: 30,   dedicated_desk: 90,   private_office: 365   };

// ── Staff users ───────────────────────────────────────────────────────────────
const USERS = [
  { name:'Arjun Mehta',      email:'admin@deskpulse.io',                password:'demo1234', role:'super_admin', locationName:null },
  { name:'Priya Sharma',     email:'staff.koramangala@deskpulse.io',    password:'demo1234', role:'frontdesk',   locationName:'Awfis - Koramangala' },
  { name:'Rahul Verma',      email:'staff.indiranagar@deskpulse.io',    password:'demo1234', role:'frontdesk',   locationName:'Awfis - Indiranagar' },
  { name:'Neha Patel',       email:'staff.bandrawest@deskpulse.io',     password:'demo1234', role:'frontdesk',   locationName:'CoWrks - Bandra West' },
  { name:'Vikram Singh',     email:'staff.powai@deskpulse.io',          password:'demo1234', role:'frontdesk',   locationName:'CoWrks - Powai' },
  { name:'Ananya Krishnan',  email:'staff.connaughtplace@deskpulse.io', password:'demo1234', role:'frontdesk',   locationName:'Innov8 - Connaught Place' },
  { name:'Rohan Gupta',      email:'staff.lajpatnagar@deskpulse.io',    password:'demo1234', role:'frontdesk',   locationName:'Innov8 - Lajpat Nagar' },
  { name:'Sneha Reddy',      email:'staff.banjarahills@deskpulse.io',   password:'demo1234', role:'frontdesk',   locationName:'91Springboard - Banjara Hills' },
  { name:'Amit Joshi',       email:'staff.noida@deskpulse.io',          password:'demo1234', role:'frontdesk',   locationName:'91Springboard - Sector 18 Noida' },
  { name:'Kavya Nair',       email:'staff.saltlake@deskpulse.io',       password:'demo1234', role:'frontdesk',   locationName:'BHive - Salt Lake' },
  { name:'Deepak Iyer',      email:'staff.velachery@deskpulse.io',      password:'demo1234', role:'frontdesk',   locationName:'BHIVE - Velachery' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const ri      = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick    = arr => arr[ri(0, arr.length - 1)];
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const subDays = (d, n) => addDays(d, -n);

function genPhone() {
  return pick(['9','8','7']) + String(ri(100000000, 999999999));
}

const usedEmails = new Set();
function genEmail(first, last) {
  const base = `${first.toLowerCase()}.${last.toLowerCase()}`;
  let e;
  do { e = `${base}+${ri(1000,9999)}@gmail.com`; } while (usedEmails.has(e));
  usedEmails.add(e);
  return e;
}

// Distribution: hot_desk 50%, dedicated_desk 25%, private_office 10%, day_pass 15%
function pickPlan() {
  const r = Math.random();
  if (r < 0.15) return 'day_pass';
  if (r < 0.65) return 'hot_desk';
  if (r < 0.90) return 'dedicated_desk';
  return 'private_office';
}

// ── Generic batch insert ──────────────────────────────────────────────────────
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
    const { rows: chk } = await pool.query('SELECT COUNT(*)::int AS n FROM locations');
    if (chk[0].n >= 10) {
      console.log('[seed] Already seeded — skipping');
      return;
    }

    const now   = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    // ── SECTION 1: LOCATIONS ─────────────────────────────────────────────────
    console.log('[seed] Seeding locations...');
    const locRows = LOCS.map(def => ({
      id: randomUUID(), name: def.name, city: def.city, address: def.address,
      total_hot_desks: def.hot, total_dedicated_desks: def.ded,
      total_private_offices: def.priv, total_meeting_rooms: def.mtg,
      opens_at: def.opens, closes_at: def.closes,
      status: 'active', created_at: now, updated_at: now,
    }));
    await batchInsert(pool, 'locations',
      ['id','name','city','address','total_hot_desks','total_dedicated_desks',
       'total_private_offices','total_meeting_rooms','opens_at','closes_at',
       'status','created_at','updated_at'],
      locRows
    );
    const locMap = Object.fromEntries(LOCS.map((def, i) => [def.key, { ...def, id: locRows[i].id }]));
    console.log('[seed] Seeding locations... done (10)');

    // ── SECTION 2: RESOURCES ─────────────────────────────────────────────────
    console.log('[seed] Seeding resources...');
    const resRows = [];
    for (const def of LOCS) {
      const locId = locMap[def.key].id;
      for (let i = 0; i < def.hot; i++) {
        const letter = String.fromCharCode(65 + Math.floor(i / 9));
        const num    = (i % 9) + 1;
        resRows.push({ id: randomUUID(), location_id: locId, type: 'hot_desk',      name: `Hot Desk ${letter}${num}`, capacity: 1,          status: 'available' });
      }
      for (let i = 1; i <= def.ded;  i++) resRows.push({ id: randomUUID(), location_id: locId, type: 'dedicated_desk', name: `Dedicated Desk ${i}`, capacity: 1,          status: 'available' });
      for (let i = 1; i <= def.priv; i++) resRows.push({ id: randomUUID(), location_id: locId, type: 'private_office', name: `Private Office ${i}`, capacity: 1,          status: 'available' });
      for (let i = 1; i <= def.mtg;  i++) resRows.push({ id: randomUUID(), location_id: locId, type: 'meeting_room',   name: `Meeting Room ${i}`,   capacity: ri(4, 10),  status: 'available' });
    }
    await batchInsert(pool, 'resources', ['id','location_id','type','name','capacity','status'], resRows);
    console.log(`[seed] Seeding resources... done (${resRows.length})`);

    // Build in-memory lookup: location_id → meeting room ids
    const roomsByLoc = {};
    for (const r of resRows) {
      if (r.type !== 'meeting_room') continue;
      (roomsByLoc[r.location_id] = roomsByLoc[r.location_id] || []).push(r.id);
    }

    // ── SECTION 3: COMPANIES ─────────────────────────────────────────────────
    console.log('[seed] Seeding companies...');
    const coRows = CO_DEFS.map(def => ({
      id: randomUUID(), name: def.name, contact_name: def.contactName,
      contact_email: def.contactEmail, contact_phone: def.contactPhone,
      location_id: locMap[def.locKey].id, created_at: now,
    }));
    await batchInsert(pool, 'companies',
      ['id','name','contact_name','contact_email','contact_phone','location_id','created_at'],
      coRows
    );
    const coMap = Object.fromEntries(CO_DEFS.map((def, i) => [def.locKey, coRows[i].id]));
    console.log('[seed] Seeding companies... done (8)');

    // ── SECTION 4: MEMBERS ───────────────────────────────────────────────────
    console.log('[seed] Seeding members...');
    const memberRows = [];
    const memberMeta = []; // parallel array: { status, isExpiringSoon, isChurnInactive, locationId }

    for (const def of LOCS) {
      const locId = locMap[def.key].id;
      const coId  = coMap[def.key] || null;
      const n     = def.count;

      // Per location: 2 expiring-soon, 4 churn-inactive, rest normal active/inactive/frozen
      const nExpiring      = 2;
      const nChurnInactive = 4;
      const nInactive      = Math.round(n * 0.10);
      const nFrozen        = Math.round(n * 0.05);
      const nActive        = n - nInactive - nFrozen;

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

        const isExpiringSoon   = status === 'active' && activeSeen < nExpiring;
        const isChurnInactive  = status === 'active' && activeSeen >= nExpiring && activeSeen < nExpiring + nChurnInactive;
        if (status === 'active') activeSeen++;

        const company_id = (coId && Math.random() < 0.20) ? coId : null;

        memberRows.push({
          id: randomUUID(), company_id, location_id: locId,
          name: `${first} ${last}`, email: genEmail(first, last),
          phone: genPhone(), status, created_at: now,
        });
        memberMeta.push({ status, isExpiringSoon, isChurnInactive, locationId: locId });
      }
    }

    await batchInsert(pool, 'members',
      ['id','company_id','location_id','name','email','phone','status','created_at'],
      memberRows,
      'ON CONFLICT (email) DO NOTHING'
    );
    console.log('[seed] Seeding members... done (1500)');

    // ── SECTION 5: MEMBERSHIPS ───────────────────────────────────────────────
    console.log('[seed] Seeding memberships...');
    const membershipRows = [];
    const memberMsMap    = {};

    for (let mi = 0; mi < memberRows.length; mi++) {
      const m    = memberRows[mi];
      const meta = memberMeta[mi];

      // 25% of regular active members are renewals (not expiring-soon, not churn-inactive)
      const isRenewal = meta.status === 'active'
        && !meta.isExpiringSoon
        && !meta.isChurnInactive
        && Math.random() < 0.25;

      let plan, startDate, endDate, msStatus;

      if (meta.isExpiringSoon) {
        // Membership expires 1-6 days from now
        plan      = 'hot_desk';
        endDate   = addDays(now, ri(1, 6));
        startDate = subDays(endDate, PLAN_DURATION.hot_desk); // 24-29 days ago
        msStatus  = 'active';

      } else if (meta.isChurnInactive) {
        // Active membership, no recent check-ins → churn risk "inactive" tier
        // Use 90-day plan so end_date stays far in the future (active)
        plan      = 'dedicated_desk';
        startDate = subDays(now, 50);                          // 50 days ago
        endDate   = addDays(startDate, PLAN_DURATION.dedicated_desk); // 40 days from now
        msStatus  = 'active';

      } else if (meta.status === 'inactive') {
        plan      = pickPlan();
        startDate = subDays(now, ri(91, 180));
        endDate   = addDays(startDate, PLAN_DURATION[plan]);
        msStatus  = 'expired';

      } else if (meta.status === 'frozen') {
        plan      = pickPlan();
        // Keep start_date ≥10 days ago so paid_at never falls in revenue_drop window [7d,6d)
        startDate = subDays(now, ri(10, 89));
        if (startDate >= subDays(now, 8) && startDate <= subDays(now, 6)) {
          startDate = subDays(now, 10);
        }
        endDate   = addDays(startDate, PLAN_DURATION[plan]);
        msStatus  = 'paused';

      } else {
        // Regular active member
        plan      = pickPlan();
        // Keep start_date ≥10 days ago — prevents paid_at landing in [7d,6d) revenue_drop window
        startDate = subDays(now, ri(10, 89));
        if (startDate >= subDays(now, 8) && startDate <= subDays(now, 6)) {
          startDate = subDays(now, 10);
        }
        endDate   = addDays(startDate, PLAN_DURATION[plan]);
        msStatus  = 'active';
      }

      memberMsMap[m.id] = [];

      if (isRenewal) {
        const dur      = PLAN_DURATION[plan];
        const origStart = subDays(startDate, dur + ri(1, 30));
        const origEnd   = addDays(origStart, dur);
        const origId    = randomUUID();
        membershipRows.push({
          id: origId, member_id: m.id, location_id: m.location_id,
          plan_type: plan, start_date: origStart, end_date: origEnd,
          status: 'expired', member_type: 'new', created_at: origStart,
        });
        memberMsMap[m.id].push({ id: origId, plan, startDate: origStart, memberType: 'new' });

        const renewId = randomUUID();
        membershipRows.push({
          id: renewId, member_id: m.id, location_id: m.location_id,
          plan_type: plan, start_date: startDate, end_date: endDate,
          status: msStatus, member_type: 'renewal', created_at: startDate,
        });
        memberMsMap[m.id].push({ id: renewId, plan, startDate, memberType: 'renewal' });

      } else {
        const msId = randomUUID();
        membershipRows.push({
          id: msId, member_id: m.id, location_id: m.location_id,
          plan_type: plan, start_date: startDate, end_date: endDate,
          status: msStatus, member_type: 'new', created_at: startDate,
        });
        memberMsMap[m.id].push({ id: msId, plan, startDate, memberType: 'new' });
      }
    }

    await batchInsert(pool, 'memberships',
      ['id','member_id','location_id','plan_type','start_date','end_date','status','member_type','created_at'],
      membershipRows
    );
    console.log(`[seed] Seeding memberships... done (${membershipRows.length})`);

    // ── SECTION 6: USERS ─────────────────────────────────────────────────────
    console.log('[seed] Seeding users...');
    const locByName = Object.fromEntries(locRows.map(r => [r.name, r.id]));

    for (const u of USERS) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      const locationId   = u.locationName ? (locByName[u.locationName] ?? null) : null;
      if (u.locationName && !locationId) {
        console.warn(`[seed] Warning: location not found for "${u.locationName}" — ${u.email} gets NULL location_id`);
      }
      await pool.query(
        `INSERT INTO users (email, password_hash, role, location_id, name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO NOTHING`,
        [u.email, passwordHash, u.role, locationId, u.name]
      );
    }
    console.log(`[seed] Seeding users... done (${USERS.length})`);

    // ── SECTION 7: HISTORICAL PAYMENTS ───────────────────────────────────────
    // All paid_at < today. No payments on or after CURRENT_DATE.
    // start_dates were constrained to ≥10 days ago so paid_at ≠ the revenue_drop window.
    console.log('[seed] Seeding historical payments...');
    const paymentRows = [];

    for (const m of memberRows) {
      for (const ms of (memberMsMap[m.id] || [])) {
        const jitter = ri(-5, 5) * 60 * 1000;
        let paidAt   = new Date(ms.startDate.getTime() + jitter);
        if (paidAt >= today) paidAt = new Date(today.getTime() - 3600000); // push to yesterday
        if (paidAt > now)    paidAt = new Date(now.getTime()  - 60000);

        paymentRows.push({
          id: randomUUID(), member_id: m.id, membership_id: ms.id,
          location_id: m.location_id, amount: PLAN_AMOUNT[ms.plan],
          payment_type: ms.memberType, paid_at: paidAt, notes: null,
        });
      }
    }

    await batchInsert(pool, 'payments',
      ['id','member_id','membership_id','location_id','amount','payment_type','paid_at','notes'],
      paymentRows
    );
    console.log(`[seed] Seeding historical payments... done (${paymentRows.length})`);

    // ── SECTION 8: HISTORICAL CHECK-INS ──────────────────────────────────────
    // Upper bound: NOW() - 3 hours → guarantees no check-in is within 2h window.
    // All checked_out set — Layer 1 is entirely closed sessions.
    console.log('[seed] Seeding historical check-ins...');

    const DENSITY = 0.85;
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
          SELECT gs AS ts,
                 EXTRACT(HOUR FROM gs)::int AS h,
                 EXTRACT(DOW  FROM gs)::int AS dow
          FROM generate_series(
            NOW() - INTERVAL '90 days',
            NOW() - INTERVAL '3 hours',
            INTERVAL '3 minutes'
          ) AS gs
        ),
        p AS (
          SELECT ts, m.ids,
            (CASE
              WHEN h BETWEEN 0  AND 7  THEN 0.00
              WHEN h = 8               THEN 0.40
              WHEN h BETWEEN 9  AND 11 THEN 1.00
              WHEN h BETWEEN 12 AND 13 THEN 0.50
              WHEN h BETWEEN 14 AND 17 THEN 0.90
              WHEN h BETWEEN 18 AND 19 THEN 0.40
              WHEN h BETWEEN 20 AND 22 THEN 0.15
              ELSE 0.00
            END) *
            (CASE dow
              WHEN 0 THEN 0.20 WHEN 1 THEN 0.85 WHEN 2 THEN 0.95
              WHEN 3 THEN 1.00 WHEN 4 THEN 0.95 WHEN 5 THEN 0.80
              WHEN 6 THEN 0.40 ELSE 0.00
            END) AS w
          FROM s CROSS JOIN m
        )
        SELECT
          ids[(floor(random() * array_length(ids, 1)) + 1)::int],
          $1::uuid,
          ts,
          LEAST(
            ts + (random() * 360 + 120) * INTERVAL '1 minute',
            NOW() - INTERVAL '5 minutes'
          )
        FROM p
        WHERE w > 0 AND random() < w * $2::float AND ids IS NOT NULL
        ON CONFLICT DO NOTHING
      `, [locId, DENSITY]);

      totalCheckins += (rowCount || 0);
    }

    // Fix churn-inactive members: delete any recent check-ins, insert one 30-45 days ago.
    // This guarantees the "inactive" churn-risk tier (last check-in >30 days ago).
    const churnInactiveMembers = memberRows
      .map((m, i) => memberMeta[i].isChurnInactive ? m : null)
      .filter(Boolean);

    for (const m of churnInactiveMembers) {
      await pool.query(
        `DELETE FROM checkins WHERE member_id = $1 AND checked_in >= NOW() - INTERVAL '30 days'`,
        [m.id]
      );
      const daysAgo = ri(30, 45);
      const ciTime  = subDays(now, daysAgo);
      ciTime.setHours(10, ri(0, 59), 0, 0);
      const coTime  = new Date(ciTime.getTime() + ri(120, 480) * 60000);
      await pool.query(
        `INSERT INTO checkins (member_id, location_id, checked_in, checked_out)
         VALUES ($1, $2, $3, $4)`,
        [m.id, m.location_id, ciTime, coTime]
      );
      totalCheckins++;
    }

    console.log(`[seed] Seeding historical check-ins... done (~${totalCheckins} rows)`);

    // Populate materialized view immediately
    await pool.query('REFRESH MATERIALIZED VIEW location_hourly_stats');
    console.log('[seed] Materialized view refreshed');

    // ── SECTION 9: HISTORICAL BOOKINGS ───────────────────────────────────────
    // 60 days, all starts_at < CURRENT_DATE, 5-10 bookings per location per day.
    console.log('[seed] Seeding historical bookings...');

    const activeMemsByLoc = {};
    for (const m of memberRows) {
      if (m.status !== 'active') continue;
      (activeMemsByLoc[m.location_id] = activeMemsByLoc[m.location_id] || []).push(m.id);
    }

    const bookingRows = [];
    for (const def of LOCS) {
      const locId = locMap[def.key].id;
      const rooms = roomsByLoc[locId] || [];
      const mems  = activeMemsByLoc[locId] || [];
      if (!rooms.length || !mems.length) continue;

      for (let d = 60; d >= 1; d--) {
        const dayBase = subDays(now, d);
        dayBase.setHours(0, 0, 0, 0);
        const nSlots = ri(5, 10);

        for (let s = 0; s < nSlots; s++) {
          const startH = 9 + s;
          if (startH >= 21) break;
          const starts = new Date(dayBase.getTime() + startH * 3600000 + ri(0,30) * 60000);
          const ends   = new Date(starts.getTime() + ri(1, 3) * 3600000);
          const rnd    = Math.random();
          const bkStat = rnd < 0.70 ? 'confirmed' : rnd < 0.85 ? 'cancelled' : 'no_show';

          bookingRows.push({
            id: randomUUID(), member_id: mems[ri(0, mems.length-1)],
            location_id: locId, resource_id: rooms[ri(0, rooms.length-1)],
            starts_at: starts, ends_at: ends, status: bkStat,
            amount: ri(500, 2000),
            created_at: new Date(starts.getTime() - ri(24,72) * 3600000),
          });
        }
      }
    }

    await batchInsert(pool, 'bookings',
      ['id','member_id','location_id','resource_id','starts_at','ends_at','status','amount','created_at'],
      bookingRows
    );
    console.log(`[seed] Seeding historical bookings... done (${bookingRows.length})`);

    // ── SECTION 10: ANOMALY SCENARIOS ────────────────────────────────────────
    console.log('[seed] Seeding anomaly scenarios...');

    // ── Scenario A — no_activity: BHIVE Velachery ────────────────────────────
    // Insert 1 closed check-in 3 hours ago. Generate_series ends at NOW()-3h so
    // no check-in is within 2h window → no_activity fires within 30s.
    {
      const velId = locMap['bhive_vel'].id;
      const { rows: velMs } = await pool.query(
        `SELECT id FROM members WHERE location_id = $1 AND status = 'active' ORDER BY random() LIMIT 1`,
        [velId]
      );
      if (velMs.length > 0) {
        const ciTime = new Date(now.getTime() - 3 * 3600000);        // 3h ago
        const coTime = new Date(now.getTime() - 1.5 * 3600000);      // 1.5h ago (closed)
        await pool.query(
          `INSERT INTO checkins (member_id, location_id, checked_in, checked_out)
           VALUES ($1, $2, $3, $4)`,
          [velMs[0].id, velId, ciTime, coTime]
        );
      }
    }

    // ── Scenario B — overbooking: CoWrks Bandra West ─────────────────────────
    // 125 open check-ins. Capacity = 80+40+12 = 132. 125/132 = 94.7% > 90% → fires.
    {
      const bandraId = locMap['cowrks_bandra'].id;
      const { rows: bandraMs } = await pool.query(
        `SELECT id FROM members
         WHERE location_id = $1 AND status = 'active'
         ORDER BY random() LIMIT 125`,
        [bandraId]
      );
      if (bandraMs.length > 0) {
        const openRows = bandraMs.map(m => ({
          member_id:   m.id,
          location_id: bandraId,
          checked_in:  new Date(now.getTime() - ri(10, 89) * 60000),
          checked_out: null,
        }));
        await batchInsert(pool, 'checkins',
          ['member_id','location_id','checked_in','checked_out'],
          openRows
        );
      }
    }

    // ── Scenario C — revenue_drop: BHive Salt Lake ────────────────────────────
    // 8 payments on same weekday 7 days ago totalling ≥ ₹15,000.
    // 0 payments today for Salt Lake → ratio = 0 < 0.70 → fires.
    {
      const saltId = locMap['bhive_salt'].id;
      const { rows: saltMs } = await pool.query(
        `SELECT m.id AS mid, ms.id AS msid
         FROM members m
         JOIN memberships ms ON ms.member_id = m.id AND ms.status IN ('active','expired')
         WHERE m.location_id = $1 AND m.status = 'active'
         ORDER BY random() LIMIT 8`,
        [saltId]
      );
      if (saltMs.length >= 1) {
        const lastWeekBase = subDays(now, 7);
        lastWeekBase.setHours(10, 0, 0, 0);

        const scenCRows = saltMs.map((row, i) => ({
          id:            randomUUID(),
          member_id:     row.mid,
          membership_id: row.msid,
          location_id:   saltId,
          amount:        3999,         // 8 × ₹3,999 = ₹31,992 ≥ ₹15,000 ✓
          payment_type:  'renewal',
          paid_at:       new Date(lastWeekBase.getTime() + i * 3600000),
          notes:         'scenario_c_lastweek',
        }));
        await batchInsert(pool, 'payments',
          ['id','member_id','membership_id','location_id','amount','payment_type','paid_at','notes'],
          scenCRows
        );
      }
      // No today payments for Salt Lake — nothing added here intentionally.
    }

    // ── Scenario D — high_no_show: Awfis Koramangala ─────────────────────────
    // 12 bookings today: 5 no_show + 7 confirmed = 41.7% no_show > 30% → fires.
    {
      const koraId = locMap['awfis_kora'].id;
      const rooms  = roomsByLoc[koraId] || [];
      const mems   = activeMemsByLoc[koraId] || [];

      if (rooms.length && mems.length) {
        const todayBookings = [];
        for (let i = 0; i < 12; i++) {
          const startH = 9 + i;           // 09:00 → 20:00
          if (startH >= 22) break;
          const starts = new Date(today.getTime() + startH * 3600000);
          const ends   = new Date(starts.getTime() + ri(1, 2) * 3600000);
          todayBookings.push({
            id:          randomUUID(),
            member_id:   mems[ri(0, mems.length-1)],
            location_id: koraId,
            resource_id: rooms[ri(0, rooms.length-1)],
            starts_at:   starts,
            ends_at:     ends,
            status:      i < 5 ? 'no_show' : 'confirmed',
            amount:      ri(500, 2000),
            created_at:  new Date(starts.getTime() - ri(24,72) * 3600000),
          });
        }
        await batchInsert(pool, 'bookings',
          ['id','member_id','location_id','resource_id','starts_at','ends_at','status','amount','created_at'],
          todayBookings
        );
      }
    }

    console.log('[seed] Anomaly scenarios seeded — detector will fire within 30 seconds');
    console.log('[seed] Seed complete. Simulator will generate today onwards data.');

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
