require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const { findZone, pointInPolygon } = require('../src/utils/geo');

const url = process.env.DATABASE_URL;
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host) && process.env.ALLOW_REMOTE_RESET !== 'true') {
  throw new Error(`Refusing to move workers on ${host}: run this on your local demo database only.`);
}

const INTERVAL_MS = Number(process.env.SIMULATE_INTERVAL_MS) || 5000;
const STEP = 0.00008;
const pool = new Pool({ connectionString: url });

async function tick() {
  const { rows } = await pool.query(`
    SELECT s.employee_id, s.latitude, s.longitude, e.site_id, st.boundary AS site_boundary
    FROM employee_current_state s
    JOIN employees e ON e.id = s.employee_id
    JOIN sites st ON st.id = e.site_id
    WHERE s.session_id IS NOT NULL AND e.status = 'active'`);
  const zonesBySite = new Map();
  for (const r of rows) {
    if (!zonesBySite.has(r.site_id)) {
      const z = await pool.query('SELECT id, boundary FROM geofences WHERE site_id = $1 AND is_active', [r.site_id]);
      zonesBySite.set(r.site_id, z.rows);
    }
    let lat = r.latitude + (Math.random() - 0.5) * 2 * STEP;
    let lng = r.longitude + (Math.random() - 0.5) * 2 * STEP;
    if (!pointInPolygon(lng, lat, r.site_boundary)) [lat, lng] = [r.latitude, r.longitude];
    const zone = findZone(lng, lat, zonesBySite.get(r.site_id));
    await pool.query(
      'UPDATE employee_current_state SET latitude = $2, longitude = $3, geofence_id = $4, recorded_at = now() WHERE employee_id = $1',
      [r.employee_id, lat, lng, zone ? zone.id : null],
    );
  }
  console.log(`${new Date().toLocaleTimeString()}  moved ${rows.length} workers`);
}

console.log(`Moving on-site workers every ${INTERVAL_MS / 1000}s. Ctrl+C to stop.`);
tick().catch((e) => { console.error(e.message); process.exit(1); });
setInterval(() => tick().catch((e) => console.error(e.message)), INTERVAL_MS);
process.on('SIGINT', () => pool.end().then(() => process.exit(0)));
