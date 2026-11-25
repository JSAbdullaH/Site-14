#!/usr/bin/env node
// Writes docs/site14-api-tests.postman_collection.json: an end-to-end API test run for Apidog or Postman.
//
//   npm run docs:api-tests
//
// The run signs in with a refresh token, builds its own test data (a site, a zone, an employee, a task
// and a watch), sends the watch a real location reading, reads everything back through the dashboard
// endpoints, checks some error cases, then deactivates or deletes what it made. Each run uses a fresh
// tag (t_run), so runs never collide. Point it at a local or test server, not production.
//
// Variables it needs: baseUrl (e.g. http://localhost:4000), and refresh_token or access_token of a
// company admin. Every variable it sets itself starts with t_.

const fs = require('node:fs');
const path = require('node:path');

const OUT = path.join(__dirname, '..', 'docs', 'site14-api-tests.postman_collection.json');

// A small test site in an empty patch of desert north of Riyadh, a zone inside it, and a point in the zone.
const ring = (w, s, e, n) => [[w, s], [e, s], [e, n], [w, n], [w, s]];
const SITE = { type: 'Polygon', coordinates: [ring(46.7, 24.8, 46.702, 24.8015)] };
const ZONE = { type: 'Polygon', coordinates: [ring(46.7005, 24.8004, 46.7015, 24.8011)] };
const POINT = { latitude: 24.80075, longitude: 46.701 };

const lines = (...l) => l;
const status = (code) => `pm.test("Status is ${code}", () => pm.response.to.have.status(${code}));`;
const save = (variable, expr) => `pm.environment.set("${variable}", ${expr});`;
const body = 'const b = pm.response.json();';

function request(name, method, route, { json, query, auth = 'bearer', headers = [], pre, tests = [] } = {}) {
  const [pathPart] = route.split('?');
  const url = {
    raw: `{{baseUrl}}${route}${query ? `?${new URLSearchParams(query).toString().replace(/%7B/g, '{').replace(/%7D/g, '}')}` : ''}`,
    host: ['{{baseUrl}}'],
    path: pathPart.split('/').filter(Boolean),
  };
  if (query) url.query = Object.entries(query).map(([key, value]) => ({ key, value }));

  const item = {
    name,
    request: {
      method,
      header: [...headers],
      url,
    },
    event: [],
  };
  if (json !== undefined) {
    item.request.header.push({ key: 'Content-Type', value: 'application/json' });
    item.request.body = { mode: 'raw', raw: JSON.stringify(json, null, 2), options: { raw: { language: 'json' } } };
  }
  if (auth === 'none') item.request.auth = { type: 'noauth' };
  if (pre) item.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } });
  if (tests.length) item.event.push({ listen: 'test', script: { type: 'text/javascript', exec: tests } });
  return item;
}

const deviceHeaders = [
  { key: 'X-Device-Serial', value: '{{t_device_serial}}' },
  { key: 'X-Device-Key', value: '{{t_device_key}}' },
];

const folders = [
  {
    name: '0. Sign in',
    item: [
      request('Refresh the access token', 'POST', '/api/v1/auth/refresh', {
        auth: 'none',
        json: { refresh_token: '{{refresh_token}}' },
        pre: lines(
          '// A tag for this run, so its names and serial numbers are new every time.',
          save('t_run', 'Date.now().toString(36).toUpperCase()'),
          '// Today in Riyadh (UTC+3), the day the API files readings under.',
          save('t_today', 'new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10)'),
        ),
        tests: lines(
          '// With a refresh token this gets a fresh access token; without one, the access_token you pasted is used.',
          'if (pm.response.code === 200) {',
          `  ${body}`,
          `  ${save('access_token', 'b.access_token')}`,
          '}',
          'pm.test("Refresh answered (200, or 401/422 when only an access_token is set)", () => pm.expect([200, 401, 422]).to.include(pm.response.code));',
        ),
      }),
      request('I am a company admin', 'GET', '/api/v1/users/me', {
        tests: lines(
          'pm.test("Signed in: set refresh_token or a fresh access_token if this fails", () => pm.response.to.have.status(200));',
          body,
          'pm.test("Role is company_admin (the run creates sites, which only an admin can)", () => pm.expect(b.role).to.eql("company_admin"));',
        ),
      }),
      request('My company', 'GET', '/api/v1/companies/me', {
        tests: lines(status(200), body, 'pm.test("Has a name", () => pm.expect(b.name).to.be.a("string"));'),
      }),
    ],
  },
  {
    name: '1. Sites and zones',
    item: [
      request('Create a test site', 'POST', '/api/v1/sites', {
        json: { name: 'API test {{t_run}}', client: 'API test run', boundary: SITE, shift_start: '06:00', shift_end: '15:00' },
        tests: lines(
          status(201),
          body,
          save('t_site_id', 'b.id'),
          'pm.test("Name and shift are stored", () => {',
          '  pm.expect(b.name).to.eql(`API test ${pm.environment.get("t_run")}`);',
          '  pm.expect(b.shift_start).to.eql("06:00");',
          '  pm.expect(b.is_active).to.eql(true);',
          '});',
        ),
      }),
      request('Get the site', 'GET', '/api/v1/sites/{{t_site_id}}', {
        tests: lines(status(200), body, 'pm.test("Same site, with its boundary", () => { pm.expect(b.id).to.eql(pm.environment.get("t_site_id")); pm.expect(b.boundary.type).to.eql("Polygon"); });'),
      }),
      request('Rename the client', 'PATCH', '/api/v1/sites/{{t_site_id}}', {
        json: { client: 'API test run (edited)' },
        tests: lines(status(200), body, 'pm.test("Client changed", () => pm.expect(b.client).to.eql("API test run (edited)"));'),
      }),
      request('The site is in the list', 'GET', '/api/v1/sites', {
        query: { is_active: 'true' },
        tests: lines(status(200), body, 'pm.test("Listed", () => pm.expect(b.data.map((s) => s.id)).to.include(pm.environment.get("t_site_id")));'),
      }),
      request('Create a zone inside the site', 'POST', '/api/v1/geofences', {
        json: { site_id: '{{t_site_id}}', name: 'Crane zone {{t_run}}', is_outdoor: true, boundary: ZONE },
        tests: lines(status(201), body, save('t_zone_id', 'b.id'), 'pm.test("Has an id", () => pm.expect(b.id).to.be.a("string"));'),
      }),
      request("List the site's zones", 'GET', '/api/v1/geofences', {
        query: { site_id: '{{t_site_id}}' },
        tests: lines(status(200), body, 'pm.test("The zone is listed", () => pm.expect(b.data.map((z) => z.id)).to.include(pm.environment.get("t_zone_id")));'),
      }),
      request('Rename the zone', 'PATCH', '/api/v1/geofences/{{t_zone_id}}', {
        json: { name: 'Tower crane {{t_run}}' },
        tests: lines(status(200), body, 'pm.test("Renamed", () => pm.expect(b.name).to.eql(`Tower crane ${pm.environment.get("t_run")}`));'),
      }),
      request('A zone outside the site is refused', 'POST', '/api/v1/geofences', {
        json: { site_id: '{{t_site_id}}', name: 'Outside', is_outdoor: false, boundary: { type: 'Polygon', coordinates: [ring(46.71, 24.81, 46.711, 24.811)] } },
        tests: lines('pm.test("Refused with 4xx", () => pm.expect(pm.response.code).to.be.within(400, 499));'),
      }),
    ],
  },
  {
    name: '2. Employees and tasks',
    item: [
      request('Create an employee on the site', 'POST', '/api/v1/employees', {
        json: { full_name: 'Test Worker {{t_run}}', job_category: 'steel fixer', site_id: '{{t_site_id}}', consent: true },
        tests: lines(
          status(201),
          body,
          save('t_employee_id', 'b.id'),
          'pm.test("On the test site, consent recorded", () => { pm.expect(b.site_id).to.eql(pm.environment.get("t_site_id")); pm.expect(b.consent_given_at).to.be.a("string"); });',
        ),
      }),
      request('Get the employee', 'GET', '/api/v1/employees/{{t_employee_id}}', {
        tests: lines(status(200), body, 'pm.test("Active", () => pm.expect(b.status).to.eql("active"));'),
      }),
      request('Find the employee by name', 'GET', '/api/v1/employees', {
        query: { search: '{{t_run}}' },
        tests: lines(status(200), body, 'pm.test("Found", () => pm.expect(b.data.map((e) => e.id)).to.include(pm.environment.get("t_employee_id")));'),
      }),
      request('Change the job category', 'PATCH', '/api/v1/employees/{{t_employee_id}}', {
        json: { job_category: 'carpenter' },
        tests: lines(status(200), body, 'pm.test("Changed", () => pm.expect(b.job_category).to.eql("carpenter"));'),
      }),
      request('Create a task for today', 'POST', '/api/v1/tasks', {
        json: { title: 'Tie rebar on level 3', employee_id: '{{t_employee_id}}', scheduled_for: '{{t_today}}' },
        tests: lines(status(201), body, save('t_task_id', 'b.id'), 'pm.test("Starts as todo", () => pm.expect(b.status).to.eql("todo"));'),
      }),
      request("List the employee's tasks", 'GET', '/api/v1/tasks', {
        query: { employee_id: '{{t_employee_id}}' },
        tests: lines(status(200), body, 'pm.test("Listed", () => pm.expect(b.data.map((t) => t.id)).to.include(pm.environment.get("t_task_id")));'),
      }),
      request('Mark the task done', 'PATCH', '/api/v1/tasks/{{t_task_id}}', {
        json: { status: 'done' },
        tests: lines(status(200), body, 'pm.test("Done", () => pm.expect(b.status).to.eql("done"));'),
      }),
    ],
  },
  {
    name: '3. Devices and live tracking',
    item: [
      request('Register a watch', 'POST', '/api/v1/devices', {
        json: { serial_number: 'TEST-{{t_run}}', device_type: 'watch', name: 'API test watch' },
        tests: lines(
          status(201),
          body,
          save('t_device_id', 'b.id'),
          save('t_device_serial', 'b.serial_number'),
          save('t_device_key', 'b.api_key'),
          'pm.test("Comes with its key, once", () => pm.expect(b.api_key).to.be.a("string"));',
        ),
      }),
      request('Give the watch to the employee', 'PATCH', '/api/v1/devices/{{t_device_id}}', {
        json: { employee_id: '{{t_employee_id}}' },
        tests: lines(status(200), body, 'pm.test("Assigned", () => pm.expect(b.employee.id).to.eql(pm.environment.get("t_employee_id")));'),
      }),
      request('A wrong device key is refused', 'GET', '/api/v1/ingest/site', {
        auth: 'none',
        headers: [
          { key: 'X-Device-Serial', value: '{{t_device_serial}}' },
          { key: 'X-Device-Key', value: 'not-the-key' },
        ],
        tests: lines(status(401)),
      }),
      request('The watch learns its site', 'GET', '/api/v1/ingest/site', {
        auth: 'none',
        headers: deviceHeaders,
        tests: lines(status(200), body, 'pm.test("The test site", () => pm.expect(b.site.id).to.eql(pm.environment.get("t_site_id")));'),
      }),
      request('The watch sends a reading inside the zone', 'POST', '/api/v1/ingest/readings', {
        auth: 'none',
        headers: deviceHeaders,
        pre: lines(save('t_now', 'new Date().toISOString()')),
        json: { sent_at: '{{t_now}}', readings: [{ recorded_at: '{{t_now}}', ...POINT, accuracy_m: 5, battery_percent: 80, heart_rate_bpm: 90 }] },
        tests: lines(
          status(200),
          body,
          'pm.test("Accepted, nothing rejected", () => { pm.expect(b.accepted).to.eql(1); pm.expect(b.rejected).to.have.length(0); });',
          'pm.test("Placed in the zone", () => { pm.expect(b.location_status).to.eql("in_zone"); pm.expect(b.zone.id).to.eql(pm.environment.get("t_zone_id")); });',
          'pm.test("A work session started", () => pm.expect(b.session).to.be.an("object"));',
        ),
      }),
      request('The watch sends a heartbeat', 'POST', '/api/v1/ingest/heartbeat', {
        auth: 'none',
        headers: deviceHeaders,
        json: { battery_percent: 79 },
        tests: lines(status(200)),
      }),
      request('The worker is on the live map', 'GET', '/api/v1/locations/live', {
        query: { site_id: '{{t_site_id}}' },
        tests: lines(
          status(200),
          body,
          'const me = b.data.find((w) => w.employee_id === pm.environment.get("t_employee_id"));',
          'pm.test("Listed with a position", () => { pm.expect(me).to.be.an("object"); pm.expect(me.has_position).to.eql(true); });',
        ),
      }),
      request('The watch shows as seen', 'GET', '/api/v1/devices/{{t_device_id}}', {
        tests: lines(status(200), body, 'pm.test("Has a last reading", () => pm.expect(b.last_recorded_at).to.be.a("string"));'),
      }),
      request('Device counts', 'GET', '/api/v1/devices/summary', { tests: lines(status(200)) }),
    ],
  },
  {
    name: '4. Records, alerts and reports',
    item: [
      request("Today's record shows the worker present", 'GET', '/api/v1/employees/{{t_employee_id}}/daily-record', {
        query: { date: '{{t_today}}' },
        tests: lines(status(200), body, 'pm.test("Present", () => pm.expect(b.status).to.eql("present"));'),
      }),
      request("Today's location history", 'GET', '/api/v1/employees/{{t_employee_id}}/history', {
        query: { date: '{{t_today}}' },
        tests: lines(status(200)),
      }),
      request('Alerts on the site', 'GET', '/api/v1/alerts', { query: { site_id: '{{t_site_id}}', status: 'all' }, tests: lines(status(200)) }),
      request('Alert counts', 'GET', '/api/v1/alerts/summary', { tests: lines(status(200)) }),
      request('Notifications on the site', 'GET', '/api/v1/notifications', { query: { site_id: '{{t_site_id}}' }, tests: lines(status(200)) }),
      request('Generate a daily PDF report', 'GET', '/api/v1/reports', {
        query: { site_id: '{{t_site_id}}', report_type: 'daily', from: '{{t_today}}', to: '{{t_today}}' },
        tests: lines(
          status(201),
          'pm.test("Is a PDF", () => pm.expect(pm.response.headers.get("Content-Type")).to.include("application/pdf"));',
          save('t_report_ref', 'pm.response.headers.get("X-Report-Reference")'),
          'pm.test("Has a reference", () => pm.expect(pm.environment.get("t_report_ref")).to.match(/^SITE14-R-/));',
        ),
      }),
      request('Anyone can verify the report', 'GET', '/api/v1/reports/verify/{{t_report_ref}}', { auth: 'none', tests: lines(status(200)) }),
      request('Marketplace products', 'GET', '/api/v1/marketplace/products', { tests: lines(status(200)) }),
    ],
  },
  {
    name: '5. Errors',
    item: [
      request('No token gives 401', 'GET', '/api/v1/users/me', { auth: 'none', tests: lines(status(401)) }),
      request('An unknown site gives 404', 'GET', '/api/v1/sites/00000000-0000-4000-8000-000000000000', { tests: lines(status(404)) }),
      request('A bad id gives 404', 'GET', '/api/v1/sites/not-a-uuid', { tests: lines(status(404)) }),
      request('An empty site gives 422 with the fields', 'POST', '/api/v1/sites', {
        json: {},
        tests: lines(status(422), body, 'pm.test("Says which fields", () => { pm.expect(b.error.code).to.eql("VALIDATION_ERROR"); pm.expect(b.error.fields).to.have.property("name"); });'),
      }),
      request('A crossed shift gives 422', 'POST', '/api/v1/sites', {
        json: { name: 'Bad shift {{t_run}}', boundary: SITE, shift_start: '07:00', shift_end: '07:00' },
        tests: lines(status(422)),
      }),
      request('A taken serial gives 409', 'POST', '/api/v1/devices', {
        json: { serial_number: '{{t_device_serial}}', device_type: 'watch' },
        tests: lines(status(409)),
      }),
      request('A site with workers cannot be deactivated', 'DELETE', '/api/v1/sites/{{t_site_id}}', { tests: lines(status(409)) }),
    ],
  },
  {
    name: '6. Clean up',
    item: [
      request('Delete the task', 'DELETE', '/api/v1/tasks/{{t_task_id}}', { tests: lines(status(204)) }),
      request('Deactivate the watch (it has a shift, so it is kept)', 'PATCH', '/api/v1/devices/{{t_device_id}}', {
        json: { employee_id: null, is_active: false },
        tests: lines(status(200), body, 'pm.test("Inactive", () => pm.expect(b.is_active).to.eql(false));'),
      }),
      request('Deactivate the zone', 'DELETE', '/api/v1/geofences/{{t_zone_id}}', { tests: lines(status(204)) }),
      request('Deactivate the employee (ends their shift)', 'DELETE', '/api/v1/employees/{{t_employee_id}}', { tests: lines(status(204)) }),
      request('Deactivate the site', 'DELETE', '/api/v1/sites/{{t_site_id}}', { tests: lines(status(204)) }),
      request('The site is inactive', 'GET', '/api/v1/sites/{{t_site_id}}', {
        tests: lines(status(200), body, 'pm.test("Inactive", () => pm.expect(b.is_active).to.eql(false));'),
      }),
    ],
  },
];

const collection = {
  info: {
    name: 'Site 14 API tests',
    description:
      'End-to-end run: sign in, build test data, track a watch, read it back, check errors, clean up. Run the folders in order (0 to 6). Needs baseUrl and a company admin refresh_token (or a fresh access_token). Use a local or test server, not production.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{access_token}}', type: 'string' }] },
  variable: [{ key: 'baseUrl', value: 'http://localhost:4000' }],
  item: folders,
};

// Every script must at least parse.
for (const folder of folders) {
  for (const item of folder.item) {
    for (const e of item.event) new Function('pm', e.script.exec.join('\n'));
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(collection, null, 2)}\n`);
const steps = folders.reduce((n, f) => n + f.item.length, 0);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${steps} steps in ${folders.length} folders.`);
