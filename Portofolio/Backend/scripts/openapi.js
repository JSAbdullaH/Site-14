#!/usr/bin/env node
// Writes docs/openapi.json, an OpenAPI 3.0 description of every endpoint, for Apidog, Postman or Swagger UI.
//
//   npm run docs:openapi
//
// It reads the real route files, so a new route shows up on the next run. Controllers and middleware are
// swapped for labelled stand-ins while it loads them, so it needs no database and no .env. Request
// bodies, query strings and path parameters come from the zod schemas the routes validate with.

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'docs', 'openapi.json');
const PROD_URL = 'https://site-14-back-end-testing-xaxhq7.cranl.net';
const API = '/api/v1';

// ---------- load the routes with labelled stand-ins ----------

const tag = (fn, meta) => Object.assign(fn, { __meta: meta });
const noop = () => (_req, _res, next) => next();

const fakes = {
  'middlewares/auth.middleware.js': () => {
    const requireRole = (...roles) => tag(noop(), { roles: ['company_admin', ...roles] });
    return {
      authenticate: tag(noop(), { auth: 'user' }),
      requireRole,
      requireAdmin: tag(noop(), { roles: ['company_admin'] }),
      authenticateDevice: tag(noop(), { auth: 'device' }),
    };
  },
  'middlewares/platform.middleware.js': () => ({ authenticatePlatform: tag(noop(), { auth: 'platform' }) }),
  'middlewares/rateLimit.middleware.js': () => ({
    limiter: (limit) => tag(noop(), { rate: `${limit} requests per 15 minutes per IP` }),
    deviceLimiter: tag(noop(), { rate: '30 requests per minute per device' }),
  }),
  'middlewares/validate.middleware.js': () => ({
    validateBody: (schema) => tag(noop(), { body: schema }),
    validateQuery: (schema) => tag(noop(), { query: schema }),
    validateParams: (schema) => tag(noop(), { params: schema }),
  }),
};

const controllerSources = {};
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  const file = Module._resolveFilename(request, parent, isMain);
  const rel = path.relative(SRC, file);
  if (fakes[rel]) return fakes[rel]();
  if (rel.startsWith(`controllers${path.sep}`)) {
    const source = fs.readFileSync(file, 'utf8');
    controllerSources[file] = source;
    return new Proxy({}, { get: (_t, name) => tag(noop(), { controller: { file, name: String(name), source } }) });
  }
  return originalLoad.apply(this, arguments);
};

// ---------- zod 3 → JSON schema (the request side: what the client sends) ----------

function toSchema(z) {
  const def = z._def;
  const description = z.description ? { description: z.description } : {};
  switch (def.typeName) {
    case 'ZodString': {
      const s = { type: 'string', ...description };
      for (const c of def.checks) {
        if (c.kind === 'min') s.minLength = c.value;
        else if (c.kind === 'max') s.maxLength = c.value;
        else if (c.kind === 'length') s.minLength = s.maxLength = c.value;
        else if (c.kind === 'email') s.format = 'email';
        else if (c.kind === 'uuid') s.format = 'uuid';
        else if (c.kind === 'url') s.format = 'uri';
        else if (c.kind === 'datetime') s.format = 'date-time';
        else if (c.kind === 'regex') s.pattern = c.regex.source;
      }
      return s;
    }
    case 'ZodNumber': {
      const s = { type: def.checks.some((c) => c.kind === 'int') ? 'integer' : 'number', ...description };
      for (const c of def.checks) {
        if (c.kind === 'min') c.inclusive ? (s.minimum = c.value) : Object.assign(s, { minimum: c.value, exclusiveMinimum: true });
        if (c.kind === 'max') c.inclusive ? (s.maximum = c.value) : Object.assign(s, { maximum: c.value, exclusiveMaximum: true });
      }
      return s;
    }
    case 'ZodBoolean':
      return { type: 'boolean', ...description };
    case 'ZodLiteral':
      return { type: typeof def.value, enum: [def.value], ...description };
    case 'ZodEnum':
      return { type: 'string', enum: [...def.values], ...description };
    case 'ZodArray': {
      const s = { type: 'array', items: toSchema(def.type), ...description };
      if (def.minLength) s.minItems = def.minLength.value;
      if (def.maxLength) s.maxItems = def.maxLength.value;
      if (def.exactLength) s.minItems = s.maxItems = def.exactLength.value;
      return s;
    }
    case 'ZodTuple':
      // OpenAPI 3.0 has no tuples; positions here are [longitude, latitude].
      return { type: 'array', items: { type: 'number' }, minItems: def.items.length, maxItems: def.items.length, description: '[longitude, latitude]' };
    case 'ZodObject': {
      const shape = def.shape();
      const properties = {};
      const required = [];
      for (const [key, value] of Object.entries(shape)) {
        properties[key] = toSchema(value);
        if (!value.isOptional()) required.push(key);
      }
      const s = { type: 'object', properties, ...description };
      if (required.length) s.required = required;
      if (def.unknownKeys === 'strict') s.additionalProperties = false;
      return s;
    }
    case 'ZodOptional':
      return toSchema(def.innerType);
    case 'ZodNullable':
      return { ...toSchema(def.innerType), nullable: true };
    case 'ZodDefault': {
      const s = toSchema(def.innerType);
      const value = def.defaultValue();
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) s.description = 'Defaults to today in Riyadh';
      else s.default = value;
      return s;
    }
    case 'ZodEffects':
      return toSchema(def.schema);
    case 'ZodPipeline':
      return toSchema(def.in);
    case 'ZodUnion':
      return { anyOf: def.options.map(toSchema) };
    default:
      return {};
  }
}

// ---------- what each endpoint is for ----------

const SUMMARY = {
  'GET /health': 'Health check',

  'POST /auth/check-email': 'Check whether an email has an account',
  'POST /auth/register': 'Register a company and its first admin',
  'POST /auth/verify-email': 'Confirm the email with the six-digit code',
  'POST /auth/verify-email/resend': 'Resend the email confirmation code',
  'POST /auth/login': 'Sign in, step 1: password (emails a code)',
  'POST /auth/login/verify': 'Sign in, step 2: six-digit code (returns tokens)',
  'POST /auth/refresh': 'Get a new access token',
  'POST /auth/logout': 'Sign out and revoke the refresh token',
  'POST /auth/forgot-password': 'Email a password reset link',
  'POST /auth/reset-password': 'Set a new password with the reset token',

  'GET /companies/me': 'Get my company',
  'PATCH /companies/me': 'Update my company',

  'GET /users/me': 'Get my account',
  'PATCH /users/me': 'Update my name',
  'POST /users': 'Invite a user',
  'GET /users': 'List users',
  'POST /users/{id}/invitation/resend': 'Resend an invitation',
  'DELETE /users/{id}': 'Deactivate a user',

  'GET /invitations/{token}': 'Describe an invitation',
  'POST /invitations/{token}/accept': 'Accept an invitation and set a password',

  'GET /sites': 'List sites',
  'GET /sites/{id}': 'Get a site',
  'POST /sites': 'Create a site',
  'PATCH /sites/{id}': 'Update a site',
  'DELETE /sites/{id}': 'Deactivate a site',

  'GET /employees/import/template': 'Download the CSV import template',
  'POST /employees/import/preview': 'Preview a CSV import',
  'POST /employees/import': 'Import employees from CSV',
  'GET /employees': 'List employees',
  'GET /employees/{id}': 'Get an employee',
  'GET /employees/{id}/daily-record': "Get an employee's daily record",
  'GET /employees/{id}/history': "Get an employee's location history for a day",
  'POST /employees/{id}/daily-record/corrections': 'Correct a daily record',
  'POST /employees/deactivate': 'Deactivate several employees',
  'POST /employees': 'Create an employee',
  'PATCH /employees/site': 'Assign employees to a site (or unassign)',
  'PATCH /employees/{id}': 'Update an employee',
  'DELETE /employees/{id}': 'Deactivate an employee',

  'POST /geofences': 'Create a zone',
  'GET /geofences': "List a site's zones",
  'PATCH /geofences/{id}': 'Update a zone',
  'DELETE /geofences/{id}': 'Deactivate a zone',

  'GET /locations/live': 'Live positions on a site',

  'POST /tasks': 'Create a task',
  'GET /tasks': 'List tasks',
  'PATCH /tasks/{id}': 'Update a task',
  'DELETE /tasks/{id}': 'Delete a task',

  'GET /reports/verify/{reference}': 'Verify a report by its reference',
  'GET /reports': 'Generate a PDF report',

  'GET /devices': 'List devices',
  'GET /devices/summary': 'Device counts',
  'POST /devices': 'Register a device',
  'POST /devices/batch': 'Register several devices',
  'GET /devices/pairings': 'List open pairing codes',
  'POST /devices/pairings': 'Create a pairing code (QR)',
  'GET /devices/pairings/{id}': 'Get a pairing',
  'DELETE /devices/pairings/{id}': 'Cancel a pairing',
  'GET /devices/{id}': 'Get a device',
  'PATCH /devices/{id}': 'Update a device (assign, rename, activate)',
  'DELETE /devices/{id}': 'Remove a device',
  'POST /devices/{id}/key': "Rotate a device's key",

  'POST /ingest/readings': 'Send location readings (device)',
  'GET /ingest/site': "Get the device's site and zones (device)",
  'POST /ingest/heartbeat': 'Heartbeat (device)',

  'GET /pairing/{code}': 'Look up a pairing code',
  'POST /pairing/{code}/claim': 'Claim a pairing code (returns the device key)',

  'GET /marketplace/products': 'List products',
  'GET /marketplace/orders': "List my company's orders",
  'POST /marketplace/orders': 'Place an order',
  'GET /marketplace/orders/{id}': 'Get an order',

  'POST /platform/auth/login': 'Platform admin sign in',
  'GET /platform/me': 'Get the platform admin',
  'GET /platform/overview': 'Platform overview',
  'GET /platform/companies': 'List companies',
  'GET /platform/devices': 'List devices across companies',
  'GET /platform/products': 'List products',
  'POST /platform/products': 'Create a product',
  'PATCH /platform/products/{id}': 'Update a product',
  'GET /platform/orders': 'List orders',
  'GET /platform/orders/{id}': 'Get an order',
  'POST /platform/orders/{id}/ship': 'Mark an order shipped',
  'POST /platform/orders/{id}/deliver': 'Mark an order delivered',
  'POST /platform/orders/{id}/cancel': 'Cancel an order',

  'GET /alerts': 'List alerts',
  'GET /alerts/summary': 'Alert counts',
  'POST /alerts/{id}/acknowledge': 'Acknowledge an alert',

  'GET /notifications': 'List notifications (site and zone events)',
  'POST /notifications/read': 'Mark notifications read',
};

const ring = [
  [46.6745, 24.7131],
  [46.6762, 24.7131],
  [46.6762, 24.7142],
  [46.6745, 24.7142],
  [46.6745, 24.7131],
];

const EXAMPLES = {
  'POST /auth/register': { company_name: 'Al-Bina Construction', full_name: 'Sara Al-Qahtani', email: 'sara@albina.sa', password: 'correct-horse-12' },
  'POST /auth/login': { email: 'sara@albina.sa', password: 'correct-horse-12' },
  'POST /auth/login/verify': { email: 'sara@albina.sa', code: '123456' },
  'POST /auth/verify-email': { email: 'sara@albina.sa', code: '123456' },
  'POST /auth/refresh': { refresh_token: '{{refresh_token}}' },
  'POST /users': { full_name: 'Omar Al-Harbi', email: 'omar@albina.sa', role: 'site_manager' },
  'PATCH /users/me': { full_name: 'Sara Al-Qahtani' },
  'PATCH /companies/me': { name: 'Al-Bina Construction', commercial_registration: '1010123456' },
  'POST /sites': { name: 'King Fahd Road Tower', client: 'Riyadh Municipality', boundary: { type: 'Polygon', coordinates: [ring] }, shift_start: '06:00', shift_end: '15:00' },
  'POST /geofences': { site_id: '{{site_id}}', name: 'Crane zone', is_outdoor: true, boundary: { type: 'Polygon', coordinates: [ring] } },
  'POST /employees': { full_name: 'Ahmed Khan', employee_number: 'E-1042', job_category: 'steel fixer', site_id: '{{site_id}}', consent: true },
  'PATCH /employees/site': { employee_ids: ['{{employee_id}}'], site_id: '{{site_id}}' },
  'POST /employees/{id}/daily-record/corrections': { date: '2026-11-22', field: 'first_seen', corrected_value: '06:05', reason: 'Badge reader was offline at the gate' },
  'POST /tasks': { title: 'Tie rebar on level 3', employee_id: '{{employee_id}}', scheduled_for: '2026-11-23' },
  'POST /devices': { serial_number: 'GPS-0001', device_type: 'tracker', name: 'Helmet tracker 1' },
  'POST /devices/batch': { serial_numbers: ['GPS-0002', 'GPS-0003'], device_type: 'tracker' },
  'POST /devices/pairings': { employee_id: '{{employee_id}}', label: "Ahmed's watch" },
  'POST /pairing/{code}/claim': { device_type: 'watch', name: 'Apple Watch', model: 'Watch7,1', platform_version: 'watchOS 11.1', has_battery: true, battery_percent: 82 },
  'POST /ingest/readings': {
    sent_at: '2026-11-23T06:30:05Z',
    readings: [{ recorded_at: '2026-11-23T06:30:00Z', latitude: 24.7136, longitude: 46.6753, accuracy_m: 6.5, battery_percent: 82, heart_rate_bpm: 96 }],
  },
  'POST /ingest/heartbeat': { battery_percent: 82 },
  'POST /marketplace/orders': { items: [{ product_id: '{{product_id}}', quantity: 10 }], shipping_address: 'King Fahd Road, Al Olaya, Riyadh 12212', contact_phone: '+966 55 123 4567' },
  'POST /platform/auth/login': { email: 'admin@site14.sa', password: 'your-password' },
};

const TAGS = {
  health: 'Health',
  auth: 'Auth',
  companies: 'Company',
  users: 'Users',
  invitations: 'Invitations',
  sites: 'Sites',
  employees: 'Employees',
  geofences: 'Zones (geofences)',
  locations: 'Live map',
  tasks: 'Tasks',
  reports: 'Reports',
  devices: 'Devices',
  ingest: 'Device ingest',
  pairing: 'Pairing',
  marketplace: 'Marketplace',
  platform: 'Platform admin',
  alerts: 'Alerts',
  notifications: 'Notifications',
};

const ROLE_TEXT = {
  company_admin: 'Company admin only.',
  site_manager: 'Site manager or company admin.',
};

// ---------- responses ----------

const errorRef = { $ref: '#/components/schemas/Error' };
const jsonError = (description) => ({ description, content: { 'application/json': { schema: errorRef } } });

const sessionSchema = {
  type: 'object',
  properties: {
    access_token: { type: 'string' },
    refresh_token: { type: 'string', description: 'Also set as the httpOnly cookie site14_refresh' },
    expires_in: { type: 'integer', description: 'Seconds' },
    user: { $ref: '#/components/schemas/User' },
  },
};

// The success status and body type, read from the controller function's source.
function successOf(controller, key) {
  if (key === 'GET /health') return { status: '200', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } } };
  let body = '';
  if (controller) {
    const { source, name } = controller;
    const start = source.search(new RegExp(`(async\\s+)?function\\s+${name}\\s*\\(`));
    if (start >= 0) {
      const rest = source.slice(start + 1);
      const end = rest.search(/\n(async\s+)?function\s|\nmodule\.exports/);
      body = end >= 0 ? rest.slice(0, end) : rest;
    }
  }
  const status = (/\.status\((\d{3})\)/.exec(body) || [])[1] || (/sendMaybeSession\(res\.status\((\d{3})\)/.exec(body) || [])[1] || '200';
  if (status === '204') return { status, description: 'Done, no body' };
  if (body.includes("'application/pdf'")) return { status, description: 'The PDF report; its reference is in the X-Report-Reference header', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } };
  if (body.includes("'text/csv'")) return { status, description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } };
  if (/sendSession|refresh\(/.test(body) || key === 'POST /auth/refresh') return { status, content: { 'application/json': { schema: sessionSchema } } };
  if (key === 'GET /users/me' || key === 'PATCH /users/me') return { status, content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } };
  return { status, content: { 'application/json': { schema: { type: 'object' } } } };
}

// ---------- walk the routers ----------

const indexSource = fs.readFileSync(path.join(SRC, 'routes', 'index.js'), 'utf8');
const requires = Object.fromEntries([...indexSource.matchAll(/const (\w+) = require\('\.\/([\w.]+)'\)/g)].map((m) => [m[1], m[2]]));
const mounts = [...indexSource.matchAll(/router\.use\('([^']+)', (\w+)\)/g)].map((m) => ({ prefix: m[1], file: requires[m[2]] }));

const metaOf = (handles) => handles.map((h) => h.__meta).filter(Boolean);
const toOpenApiPath = (p) => p.replace(/:(\w+)/g, '{$1}');

const paths = {};
const usedTags = new Set();

function addOperation({ method, route, metas, handlers }) {
  const key = `${method.toUpperCase()} ${route}`;
  const group = route.split('/')[1];
  const fullPath = group === 'health' ? route : API + route;
  usedTags.add(group);

  const auth = (metas.find((m) => m.auth) || {}).auth;
  const rolesMeta = metas.filter((m) => m.roles).pop();
  const roles = rolesMeta && [...new Set(rolesMeta.roles)];
  const rate = (metas.find((m) => m.rate) || {}).rate;
  const bodySchema = (metas.find((m) => m.body) || {}).body;
  const querySchema = (metas.find((m) => m.query) || {}).query;
  const paramsSchema = (metas.find((m) => m.params) || {}).params;
  const controller = (metas.find((m) => m.controller) || {}).controller;
  const multipart = handlers.some((h) => h.name === 'csvUpload');

  const op = { tags: [TAGS[group] || group], summary: SUMMARY[key] || key, operationId: `${group}_${controller ? controller.name : method}` };

  const notes = [];
  if (auth === 'user') notes.push(roles ? `**Who:** ${roles.length === 1 ? ROLE_TEXT.company_admin : ROLE_TEXT.site_manager}` : '**Who:** any signed-in user.');
  if (auth === 'device') notes.push('**Who:** a device, with its X-Device-Serial and X-Device-Key headers.');
  if (auth === 'platform') notes.push('**Who:** a platform admin (token from POST /platform/auth/login).');
  if (!auth) notes.push('**Who:** public, no token.');
  if (rate) notes.push(`**Rate limit:** ${rate}.`);
  op.description = notes.join('\n\n');

  if (auth === 'user') op.security = [{ bearerAuth: [] }];
  else if (auth === 'platform') op.security = [{ platformAuth: [] }];
  else if (auth === 'device') op.security = [{ deviceSerial: [], deviceKey: [] }];
  else op.security = [];

  const parameters = [];
  const paramShape = paramsSchema ? paramsSchema._def.shape() : {};
  for (const [, name] of route.matchAll(/\{(\w+)\}/g)) {
    parameters.push({ name, in: 'path', required: true, schema: paramShape[name] ? toSchema(paramShape[name]) : { type: 'string' } });
  }
  if (querySchema) {
    let q = querySchema;
    while (q._def.typeName === 'ZodEffects') q = q._def.schema;
    for (const [name, value] of Object.entries(q._def.shape())) {
      parameters.push({ name, in: 'query', required: !value.isOptional(), schema: toSchema(value) });
    }
  }
  if (parameters.length) op.parameters = parameters;

  if (multipart) {
    const fields = bodySchema ? toSchema(bodySchema).properties : {};
    op.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file'],
            properties: {
              file: { type: 'string', format: 'binary', description: 'The CSV file, at most 1 MB' },
              ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { ...v, description: 'JSON object mapping our fields (full_name, employee_number, job_category, site_name) to your CSV headers' }])),
            },
          },
        },
      },
    };
  } else if (bodySchema) {
    const schema = toSchema(bodySchema);
    const content = { schema };
    if (EXAMPLES[key]) content.example = EXAMPLES[key];
    op.requestBody = { required: !bodySchema.isOptional() && Boolean(schema.required), content: { 'application/json': content } };
  }

  const ok = successOf(controller, key);
  op.responses = { [ok.status]: { description: ok.description || 'OK', ...(ok.content ? { content: ok.content } : {}) } };
  if (bodySchema || querySchema) op.responses['422'] = jsonError('A field is invalid; error.fields says which');
  if (auth) op.responses['401'] = jsonError('Missing, expired or invalid credentials');
  if (roles) op.responses['403'] = jsonError('Your role cannot do this');
  if (paramsSchema || route.includes('{')) op.responses['404'] = jsonError('Not found, or not in your company');
  if (rate) op.responses['429'] = jsonError('Rate limited');

  paths[fullPath] = paths[fullPath] || {};
  paths[fullPath][method] = op;
}

addOperation({ method: 'get', route: '/health', metas: [], handlers: [] });

for (const { prefix, file } of mounts) {
  const router = require(path.join(SRC, 'routes', file));
  const shared = [];
  for (const layer of router.stack) {
    if (!layer.route) {
      shared.push(layer.handle);
      continue;
    }
    const handlers = [...shared, ...layer.route.stack.map((l) => l.handle)];
    const route = toOpenApiPath(prefix + (layer.route.path === '/' ? '' : layer.route.path));
    for (const method of Object.keys(layer.route.methods)) {
      addOperation({ method, route, metas: metaOf(handlers), handlers });
    }
  }
}

Module._load = originalLoad;

// ---------- the document ----------

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'Site 14 API',
    version: require(path.join(ROOT, 'package.json')).version,
    description: [
      'Worker location tracking for construction sites.',
      '',
      '**Signing in (dashboard users):** POST /auth/login with email and password emails a six-digit code; POST /auth/login/verify with that code returns `access_token` (15 minutes) and `refresh_token`. Send the access token as `Authorization: Bearer <token>`, and POST /auth/refresh for a new one.',
      '',
      '**Devices** send `X-Device-Serial` and `X-Device-Key`; the key comes from claiming a pairing code or rotating it.',
      '',
      '**Errors** are `{ "error": { "code", "message", "fields"? } }`. A 422 lists the invalid fields in `fields`.',
      '',
      'Generated from the route files by `npm run docs:openapi`.',
    ].join('\n'),
  },
  servers: [
    { url: PROD_URL, description: 'Production (Cranl)' },
    { url: 'http://localhost:4000', description: 'Local' },
  ],
  tags: Object.entries(TAGS)
    .filter(([group]) => usedTags.has(group))
    .map(([, name]) => ({ name })),
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'access_token from POST /auth/login/verify or /auth/refresh' },
      platformAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token from POST /platform/auth/login' },
      deviceSerial: { type: 'apiKey', in: 'header', name: 'X-Device-Serial' },
      deviceKey: { type: 'apiKey', in: 'header', name: 'X-Device-Key' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'One or more fields are invalid' },
              fields: { type: 'object', additionalProperties: { type: 'string' }, example: { email: 'Enter a valid email address' } },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          full_name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['company_admin', 'site_manager'] },
          company_id: { type: 'string', format: 'uuid' },
          is_active: { type: 'boolean' },
          is_email_verified: { type: 'boolean' },
          invitation_pending: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);

const count = Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0);
const missing = Object.entries(paths).flatMap(([p, ops]) =>
  Object.keys(ops)
    .map((m) => `${m.toUpperCase()} ${p.replace(API, '')}`)
    .filter((k) => !SUMMARY[k]),
);
console.log(`Wrote ${path.relative(process.cwd(), OUT)}: ${count} operations on ${Object.keys(paths).length} paths.`);
if (missing.length) console.log(`No summary yet for: ${missing.join(', ')}`);
