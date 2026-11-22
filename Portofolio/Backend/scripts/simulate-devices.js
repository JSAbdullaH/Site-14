// Pretends to be the workers' devices, so the system can be built and demoed
// without hardware. Each simulated device sends readings to the real ingest
// endpoint, exactly as a watch would: workers walk onto their site (the live map
// shows them appear), move between zones, leave at the end of their shift, and
// come back. Some devices misbehave on purpose (go offline, retry, burst, drift).
//
//   npm run simulate:devices                     every tracked worker, faults on
//   npm run simulate:devices -- --workers 5 --site "Al Malqa" --speed 3
//   npm run simulate:devices -- --keys devices.csv   keys downloaded from the Devices page
//   npm run simulate:devices -- --provision      give devices a new key (local database only)
//
// The API must be running (npm run dev). Options are listed under --help.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const { Pool } = require('pg');
const { pointInPolygon } = require('../src/utils/geo');

const { values: opt } = parseArgs({
  options: {
    site: { type: 'string' },
    workers: { type: 'string', default: '0' },
    interval: { type: 'string', default: '5' },
    speed: { type: 'string', default: '1' },
    shift: { type: 'string', default: '15' },
    keys: { type: 'string' },
    provision: { type: 'boolean', default: false },
    'no-faults': { type: 'boolean', default: false },
    api: { type: 'string', default: process.env.API_URL || `http://localhost:${process.env.PORT || 4000}/api/v1` },
    help: { type: 'boolean', default: false },
  },
});

if (opt.help) {
  console.log(`Options:
  --site <name or id>   only workers of this site (part of the name is enough)
  --workers <n>         at most n workers (default: all tracked workers)
  --interval <seconds>  seconds between readings (default 5, at least ${MIN_INTERVAL_S})
  --speed <x>           walk x times faster and shorten waits (default 1)
  --shift <minutes>     minutes on site before a worker leaves (default 15)
  --keys <file.csv>     serial_number,api_key file (the Devices page download)
  --provision           set a new key on devices that have none here (local database only)
  --no-faults           no offline spells, retries, bursts or clock drift
  --api <url>           API base URL (default ${opt.api})`);
  process.exit(0);
}

// The server drops readings less than 3 s apart; leave a margin for timer jitter.
const MIN_INTERVAL_S = 4;
const INTERVAL_S = Math.max(MIN_INTERVAL_S, Number(opt.interval) || 5);
const SPEED = Math.max(0.1, Number(opt.speed) || 1);
const SHIFT_TICKS = Math.round(((Number(opt.shift) || 15) * 60) / INTERVAL_S / SPEED);
const FAULTS = !opt['no-faults'];
const MAX_BATCH = 120;
const WALK_MPS = 1.3;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => FAULTS && Math.random() < p;
const clock = () => new Date().toLocaleTimeString('en-GB');

// ---------------------------------------------------------------- geometry (metres <-> degrees)

const M_PER_DEG = 111_320;
const toMetres = (from, to) => ({
  x: (to.lng - from.lng) * M_PER_DEG * Math.cos((from.lat * Math.PI) / 180),
  y: (to.lat - from.lat) * M_PER_DEG,
});
const offset = (p, x, y) => ({
  lat: p.lat + y / M_PER_DEG,
  lng: p.lng + x / (M_PER_DEG * Math.cos((p.lat * Math.PI) / 180)),
});
const inside = (p, polygon) => pointInPolygon(p.lng, p.lat, polygon);

function centre(polygon) {
  const ring = polygon.coordinates[0].slice(0, -1);
  return { lng: ring.reduce((s, [x]) => s + x, 0) / ring.length, lat: ring.reduce((s, [, y]) => s + y, 0) / ring.length };
}

function randomPointIn(polygon) {
  const ring = polygon.coordinates[0];
  const [minX, maxX] = [Math.min(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[0]))];
  const [minY, maxY] = [Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[1]))];
  for (let i = 0; i < 500; i += 1) {
    const p = { lng: rand(minX, maxX), lat: rand(minY, maxY) };
    if (inside(p, polygon)) return p;
  }
  return centre(polygon);
}

// A point 30 to 80 m beyond the site's edge, in a random direction: where a worker comes from.
function pointOutside(site) {
  const c = centre(site.boundary);
  const angle = rand(0, 2 * Math.PI);
  let p = c;
  for (let d = 5; d < 5000 && inside(p, site.boundary); d += 5) p = offset(c, Math.cos(angle) * d, Math.sin(angle) * d);
  const extra = rand(30, 80);
  return offset(p, Math.cos(angle) * extra, Math.sin(angle) * extra);
}

// GPS is never exact: about 3 m of noise.
const noisy = (p) => offset(p, rand(-3, 3), rand(-3, 3));

// ---------------------------------------------------------------- devices to simulate

function readKeyFile(file) {
  const keys = new Map();
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
  const [si, ki] = [header.indexOf('serial_number'), header.indexOf('api_key')];
  if (si < 0 || ki < 0) throw new Error(`${file} needs the columns serial_number and api_key`);
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cells[si] && cells[ki]) keys.set(cells[si].toUpperCase(), cells[ki]);
  }
  return keys;
}

function checkLocal() {
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host) && process.env.ALLOW_REMOTE_RESET !== 'true') {
    throw new Error(`Refusing to change device keys on ${host}: --provision works on your local demo database only.`);
  }
}

async function loadDevices() {
  const { rows } = await pool.query(`
    SELECT d.id, d.serial_number, d.api_key_hash, e.id AS employee_id, e.full_name,
           s.id AS site_id, s.name AS site_name, s.boundary,
           cs.latitude, cs.longitude, cs.session_id IS NOT NULL AS on_site
    FROM devices d
    JOIN employees e ON e.id = d.employee_id
    JOIN sites s ON s.id = e.site_id
    LEFT JOIN employee_current_state cs ON cs.employee_id = e.id
    WHERE d.is_active AND e.status = 'active' AND e.consent_given_at IS NOT NULL AND s.is_active
      AND ($1::text IS NULL OR s.id::text = $1 OR s.name ILIKE '%' || $1 || '%')
    ORDER BY s.name, d.serial_number`, [opt.site || null]);

  const fromFile = opt.keys ? readKeyFile(opt.keys) : new Map();
  if (opt.provision) checkLocal();

  const ready = [];
  const skipped = [];
  for (const r of rows) {
    // The seed gives every demo device the key "dev-key-<serial>".
    const seeded = `dev-key-${r.serial_number}`;
    let key = fromFile.get(r.serial_number) || (sha256(seeded) === r.api_key_hash ? seeded : null);
    if (!key && opt.provision) {
      key = `dk_sim_${crypto.randomBytes(24).toString('base64url')}`;
      await pool.query('UPDATE devices SET api_key_hash = $2 WHERE id = $1', [r.id, sha256(key)]);
    }
    if (key) ready.push({ ...r, key });
    else skipped.push(r.serial_number);
  }
  if (skipped.length) {
    console.log(`No key for ${skipped.length} device(s): ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ', ...' : ''}`);
    console.log('  Pass --keys <file.csv> (the Devices page download), or --provision on a local database.\n');
  }
  const limit = Number(opt.workers) || ready.length;
  return ready.slice(0, limit);
}

async function loadZones(siteIds) {
  const { rows } = await pool.query(
    'SELECT id, site_id, name, boundary FROM geofences WHERE site_id = ANY($1::uuid[]) AND is_active',
    [siteIds],
  );
  return rows;
}

// ---------------------------------------------------------------- one worker wearing one device

class SimulatedWorker {
  constructor(row, zones, index) {
    this.row = row;
    this.label = `${row.full_name} (${row.serial_number})`;
    this.site = { id: row.site_id, name: row.site_name, boundary: row.boundary };
    this.zones = zones;
    this.battery = Math.round(rand(55, 100));
    this.restingBpm = Math.round(rand(68, 84));
    this.queue = [];
    this.lastBatch = null;
    this.offlineTicks = 0;
    // Some device clocks run slow. (One running fast and then set back would see its next
    // readings dropped as not newer than the last: the server keeps readings in order.)
    this.clockOffsetMs = chance(0.25) ? -rand(15, 50) * 1000 : 0;
    this.session = null;
    this.stopped = false;

    if (row.on_site && row.latitude !== null) {
      // Already on site (the seed's live shifts): carry on from where the map shows them.
      this.pos = { lat: row.latitude, lng: row.longitude };
      this.session = 'open';
      this.startWork();
    } else {
      // Off site: arrive one after the other, so the map fills up gradually.
      this.pos = pointOutside(this.site);
      this.state = 'away';
      this.wait = index * 2 + Math.round(rand(0, 6));
    }
  }

  startWork() {
    this.state = 'working';
    this.ticksOnSite = 0;
    this.shiftTicks = Math.round(SHIFT_TICKS * rand(0.7, 1.3));
    this.pickTarget();
  }

  pickTarget() {
    const zone = this.zones.length && Math.random() < 0.6 ? this.zones[Math.floor(Math.random() * this.zones.length)] : null;
    this.target = randomPointIn(zone ? zone.boundary : this.site.boundary);
    this.wait = 0;
  }

  // Walk towards the target. True when it is reached.
  walk() {
    const d = toMetres(this.pos, this.target);
    const dist = Math.hypot(d.x, d.y);
    const step = WALK_MPS * rand(0.7, 1.2) * INTERVAL_S * SPEED;
    if (dist <= step) {
      this.pos = this.target;
      return true;
    }
    this.pos = offset(this.pos, (d.x / dist) * step, (d.y / dist) * step);
    return false;
  }

  move() {
    this.moving = false;
    if (this.state === 'away') {
      if (this.wait-- > 0) return;
      this.state = 'arriving';
      this.target = randomPointIn(this.site.boundary);
    }
    if (this.state === 'arriving') {
      this.moving = true;
      if (this.walk()) this.startWork();
      return;
    }
    if (this.state === 'working') {
      this.ticksOnSite += 1;
      if (this.ticksOnSite > this.shiftTicks) {
        this.state = 'leaving';
        this.target = pointOutside(this.site);
        return;
      }
      // At a spot: stay a while, then head somewhere else.
      if (this.wait > 0) {
        this.wait -= 1;
        if (this.wait === 0) this.pickTarget();
        return;
      }
      this.moving = true;
      if (this.walk()) {
        this.moving = false;
        this.wait = Math.max(1, Math.round(rand(10, 40) / SPEED));
      }
      return;
    }
    if (this.state === 'leaving') {
      this.moving = true;
      if (this.walk()) {
        this.state = 'away';
        this.wait = Math.round((rand(60, 180) / INTERVAL_S) / SPEED);
      }
    }
  }

  deviceNow() {
    return new Date(Date.now() + this.clockOffsetMs);
  }

  reading(at = this.deviceNow()) {
    if (Math.random() < 0.02) this.battery = Math.max(5, this.battery - 1);
    const effort = this.moving ? rand(12, 25) : rand(0, 6);
    const p = noisy(this.pos);
    return {
      recorded_at: at.toISOString(),
      latitude: Number(p.lat.toFixed(7)),
      longitude: Number(p.lng.toFixed(7)),
      battery_percent: this.battery,
      heart_rate_bpm: Math.round(this.restingBpm + effort),
    };
  }

  async post(readings, note) {
    const res = await fetch(`${opt.api}/ingest/readings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Serial': this.row.serial_number, 'X-Device-Key': this.row.key },
      body: JSON.stringify({ sent_at: this.deviceNow().toISOString(), readings }),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body, note };
  }

  // One tick: move, take a reading, and send what is queued (unless offline).
  async tick(events) {
    if (this.stopped) return null;
    this.move();
    // A slow clock falls further behind on every tick.
    if (this.clockOffsetMs) this.clockOffsetMs -= 400;

    if (this.offlineTicks === 0 && chance(0.008)) {
      this.offlineTicks = Math.round(rand(6, 24));
      events.push(`${this.label} lost signal; buffering readings`);
    }

    this.queue.push(this.reading());
    // A burst: a faulty sensor reporting every second.
    if (chance(0.01)) {
      const now = this.deviceNow().getTime();
      for (let i = 1; i <= 4; i += 1) this.queue.push(this.reading(new Date(now + i * 1000)));
    }
    if (this.queue.length > MAX_BATCH) this.queue = this.queue.slice(-MAX_BATCH);

    if (this.offlineTicks > 0) {
      this.offlineTicks -= 1;
      if (this.offlineTicks > 0) return null;
      events.push(`${this.label} back online; sending ${this.queue.length} buffered readings`);
    }

    let result;
    try {
      result = await this.post(this.queue);
    } catch (err) {
      events.push(`${this.label} cannot reach the API (${err.cause?.code || err.message}); will retry`);
      return null;
    }
    this.handle(result, events);

    // A retry: the device did not get the answer, so it sends the same batch again.
    if (result.status === 200 && chance(0.02)) {
      const again = await this.post(this.lastBatch, 'retry');
      events.push(`${this.label} retried its last batch: ${again.body.duplicates ?? 0} duplicate(s) ignored`);
    }
    return result;
  }

  handle({ status, body }, events) {
    if (status === 200) {
      this.lastBatch = this.queue;
      this.queue = [];
      const was = this.session;
      this.session = body.session ? body.session.id : null;
      this.status = body.location_status;
      if (!was && this.session) events.push(`${this.label} arrived at ${this.site.name}: shift opened`);
      if (was && !this.session) events.push(`${this.label} left ${this.site.name}: shift closed`);
      if (body.throttled) events.push(`${this.label} sent readings too close together: ${body.throttled} dropped`);
      for (const r of body.rejected || []) events.push(`${this.label} reading refused: ${r.reason}`);
      // Like a real watch: correct the clock when the server says it is more than a minute off.
      if (Math.abs(body.clock_offset_seconds || 0) > 60) {
        events.push(`${this.label} clock was ${-body.clock_offset_seconds}s off; corrected from the server`);
        this.clockOffsetMs = 0;
      }
      this.counts = body;
      return;
    }
    if (status === 429 || status >= 500) return; // keep the queue, send it next tick
    // 401, 403, 409: nothing will change by retrying.
    this.queue = [];
    this.stopped = true;
    events.push(`${this.label} stopped: ${status} ${body.error ? `${body.error.code}: ${body.error.message}` : ''}`);
  }
}

// ---------------------------------------------------------------- main loop

async function main() {
  const health = await fetch(opt.api.replace(/\/api\/v1\/?$/, '/health')).catch(() => null);
  if (!health || !health.ok) throw new Error(`The API is not answering at ${opt.api}. Start it first: npm run dev`);

  const rows = await loadDevices();
  if (!rows.length) throw new Error('No device to simulate: register devices, assign them to consenting workers on an active site.');
  const zones = await loadZones([...new Set(rows.map((r) => r.site_id))]);
  const workers = rows.map((r, i) => new SimulatedWorker(r, zones.filter((z) => z.site_id === r.site_id), i));

  const sites = [...new Set(rows.map((r) => r.site_name))].join(', ');
  console.log(`Simulating ${workers.length} device(s) on ${sites}`);
  console.log(`A reading every ${INTERVAL_S}s, speed x${SPEED}, about ${opt.shift} min on site per shift, faults ${FAULTS ? 'on' : 'off'}.`);
  console.log('Open the live map to watch them arrive. Ctrl+C to stop.\n');

  let running = false;
  const tick = async () => {
    if (running) return; // the previous tick is still sending
    running = true;
    const events = [];
    const results = await Promise.all(workers.map((w) => w.tick(events)));
    for (const e of events) console.log(`${clock()}  ${e}`);

    const count = (s) => workers.filter((w) => !w.stopped && w.status === s).length;
    const sent = results.filter(Boolean);
    const sum = (k) => sent.reduce((n, r) => n + (r.body[k] || 0), 0);
    console.log(`${clock()}  in a zone ${count('in_zone')}, on site ${count('on_site')}, off site ${workers.length - count('in_zone') - count('on_site')}`
      + ` | ${sent.length} batch(es), ${sum('accepted')} accepted, ${sum('duplicates')} duplicate, ${sum('throttled')} dropped`
      + `${workers.some((w) => w.offlineTicks) ? `, ${workers.filter((w) => w.offlineTicks).length} offline` : ''}`);
    running = false;
  };

  await tick();
  const timer = setInterval(() => tick().catch((e) => console.error(e.message)), INTERVAL_S * 1000);
  process.on('SIGINT', async () => {
    clearInterval(timer);
    await pool.end();
    process.exit(0);
  });
}

main().catch(async (e) => {
  console.error(e.message);
  await pool.end();
  process.exit(1);
});
