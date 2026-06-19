'use strict';

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

const USERS = [
  {
    name:        'Arjun Mehta',
    email:       'admin@deskpulse.io',
    password:    'demo1234',
    role:        'super_admin',
    locationName: null,
  },
  {
    name:        'Priya Sharma',
    email:       'staff.koramangala@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: 'Awfis — Koramangala',
  },
  {
    name:        'Rahul Verma',
    email:       'staff.indiranagar@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: 'Awfis — Indiranagar',
  },
  {
    name:        'Neha Patel',
    email:       'staff.bandrawest@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: 'CoWrks — Bandra West',
  },
  {
    name:        'Vikram Singh',
    email:       'staff.powai@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: 'CoWrks — Powai',
  },
  {
    name:        'Ananya Krishnan',
    email:       'staff.connaughtplace@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: 'Innov8 — Connaught Place',
  },
  {
    name:        'Rohan Gupta',
    email:       'staff.lajpatnagar@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: 'Innov8 — Lajpat Nagar',
  },
  {
    name:        'Sneha Reddy',
    email:       'staff.banjarahills@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: '91Springboard — Banjara Hills',
  },
  {
    name:        'Amit Joshi',
    email:       'staff.noida@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: '91Springboard — Sector 18 Noida',
  },
  {
    name:        'Kavya Nair',
    email:       'staff.saltlake@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: 'BHive — Salt Lake',
  },
  {
    name:        'Deepak Iyer',
    email:       'staff.velachery@deskpulse.io',
    password:    'demo1234',
    role:        'frontdesk',
    locationName: 'BHIVE — Velachery',
  },
];

async function seedUsers(pool) {
  console.log('[seed] Seeding users...');

  // Fetch all location name → id mappings
  const { rows: locs } = await pool.query('SELECT id, name FROM locations');
  const locByName = Object.fromEntries(locs.map((l) => [l.name, l.id]));

  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, SALT_ROUNDS);
    const locationId   = u.locationName ? (locByName[u.locationName] ?? null) : null;

    if (u.locationName && !locationId) {
      console.warn(`[seed] Warning: location not found for "${u.locationName}" — user ${u.email} will have NULL location_id`);
    }

    await pool.query(
      `INSERT INTO users (email, password_hash, role, location_id, name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING`,
      [u.email, passwordHash, u.role, locationId, u.name]
    );
  }

  console.log(`[seed] Seeding users... done (${USERS.length} users)`);
}

module.exports = { seedUsers };
