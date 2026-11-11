const { z } = require('zod');
const { todayInRiyadh } = require('./day');

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

const newPassword = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters');

const linkToken = z.string().trim().min(20, 'Invalid token').max(200, 'Invalid token');

const registerSchema = z.object({
  company_name: z.string().trim().min(2).max(150),
  commercial_registration: z.string().trim().max(50).optional(),
  full_name: z.string().trim().min(2).max(120),
  email,
  password: newPassword,
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(128),
});

const sixDigitCode = z.string().trim().regex(/^\d{6}$/, 'Enter the six-digit code');

const loginVerifySchema = z.object({ email, code: sixDigitCode });

const verifyEmailSchema = z.object({ email, code: sixDigitCode });

const emailSchema = z.object({ email });

const resetPasswordSchema = z.object({ token: linkToken, password: newPassword });

const refreshSchema = z.object({ refresh_token: z.string().min(1).max(200).optional() });

const inviteUserSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email,
  role: z.enum(['site_manager', 'company_admin']).default('site_manager'),
});

const listUsersQuery = z.object({
  is_active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const acceptInvitationSchema = z.object({ password: newPassword });

// ---------- employees ----------

const jobCategory = z.string().trim().toLowerCase().min(2, 'Enter a job category').max(60);

const employeeFields = {
  full_name: z.string().trim().min(2).max(120),
  employee_number: z.string().trim().min(1).max(30).nullable().optional(),
  job_category: jobCategory,
  site_id: z.string().uuid('Invalid site').nullable().optional(),
  consent: z.boolean().optional(),
};

const createEmployeeSchema = z.object(employeeFields).strict();

const updateEmployeeSchema = z
  .object(employeeFields)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Send at least one field to change');

// site_id=none lists the workers not assigned to any site.
const listEmployeesQuery = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  site_id: z.union([z.literal('none'), z.string().uuid('Invalid site')]).optional(),
  geofence_id: z.string().uuid('Invalid zone').optional(),
  job_category: jobCategory.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// ---------- sites (SITE-47, SITE-48) ----------

// Shift times are wall-clock Saudi time, "HH:MM".
const clockTime = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format HH:MM');

// [longitude, latitude], the GeoJSON order.
const position = z.tuple([
  z.number().finite().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  z.number().finite().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
]);

const samePosition = (a, b) => a[0] === b[0] && a[1] === b[1];

// A GeoJSON Polygon with one closed ring of at least three distinct corners.
const polygon = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(
      z
        .array(position)
        .min(4, 'A boundary needs at least three corners')
        .max(500, 'A boundary can have at most 499 corners')
        // Zod still runs these after a failed .min(), so an empty ring must not throw.
        .refine((ring) => ring.length > 0 && samePosition(ring[0], ring[ring.length - 1]), 'The boundary must end where it starts')
        .refine(
          (ring) => new Set(ring.slice(0, -1).map((p) => `${p[0]},${p[1]}`)).size >= 3,
          'A boundary needs at least three distinct corners',
        ),
    )
    .length(1, 'A boundary is a single outline'),
});

const siteName = z.string().trim().min(2, 'Use at least 2 characters').max(120, 'Use at most 120 characters');

const siteClient = z
  .string()
  .trim()
  .max(150, 'Use at most 150 characters')
  .transform((v) => v || null)
  .nullable();

const createSiteSchema = z
  .object({
    name: siteName,
    client: siteClient.optional(),
    boundary: polygon,
    shift_start: clockTime,
    shift_end: clockTime,
  })
  .refine((s) => s.shift_start !== s.shift_end, {
    message: 'The shift must end at a different time than it starts',
    path: ['shift_end'],
  });

const updateSiteSchema = z
  .object({
    name: siteName.optional(),
    client: siteClient.optional(),
    boundary: polygon.optional(),
    shift_start: clockTime.optional(),
    shift_end: clockTime.optional(),
    is_active: z.boolean().optional(),
  })
  .refine((s) => Object.values(s).some((v) => v !== undefined), {
    message: 'Send at least one field to change',
    path: ['_'],
  });

const listSitesQuery = z.object({ is_active: booleanQuery });

const createGeofenceSchema = z.object({
  site_id: z.string().uuid('Invalid site id'),
  name: z.string().trim().min(1, 'Enter a zone name').max(120),
  is_outdoor: z.boolean().default(false),
  boundary: polygon,
});

const updateGeofenceSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a zone name').max(120).optional(),
    is_outdoor: z.boolean().optional(),
    is_active: z.boolean().optional(),
    boundary: polygon.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to update');

const listGeofencesQuery = z.object({
  site_id: z.string().uuid('Invalid site id'),
  is_active: booleanQuery,
});

const liveLocationsQuery = z.object({ site_id: z.string().uuid('Invalid site id') });

// ---------- devices ----------

// The serial printed on the device. Stored upper-case, so "gps-001" and "GPS-001" are one device.
const serialNumber = z
  .string({ invalid_type_error: 'Enter a serial number' })
  .trim()
  .toUpperCase()
  .min(3, 'Use at least 3 characters')
  .max(64, 'Use at most 64 characters')
  .regex(/^[A-Z0-9][A-Z0-9._:-]*$/, 'Use letters, digits, dots, dashes, colons or underscores');

const MAX_DEVICE_BATCH = 500;

const deviceType = z.enum(['phone', 'tablet', 'watch', 'laptop', 'desktop', 'tracker'], { message: 'Choose a device type' });
const deviceName = z.string().trim().min(1, 'Enter a name').max(80, 'Use at most 80 characters');

const createDeviceSchema = z
  .object({ serial_number: serialNumber, device_type: deviceType.default('tracker'), name: deviceName.optional() })
  .strict();

const createDeviceBatchSchema = z
  .object({
    serial_numbers: z
      .array(serialNumber)
      .min(1, 'Enter at least one serial number')
      .max(MAX_DEVICE_BATCH, `Register at most ${MAX_DEVICE_BATCH} devices at once`),
    device_type: deviceType.default('tracker'),
  })
  .strict();

const updateDeviceSchema = z
  .object({
    employee_id: z.string().uuid('Invalid employee').nullable().optional(),
    is_active: z.boolean().optional(),
    name: deviceName.nullable().optional(),
    device_type: deviceType.optional(),
  })
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Send at least one field to change');

const listDevicesQuery = z.object({
  search: z.string().trim().min(1).max(64).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  assigned: booleanQuery,
  type: deviceType.optional(),
  source: z.enum(['registered', 'paired', 'marketplace']).optional(),
  health: z.enum(['online', 'offline', 'never']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const createPairingSchema = z
  .object({
    employee_id: z.string().uuid('Invalid employee').nullable().optional(),
    label: deviceName.optional(),
  })
  .strict();

const pairingCodeParams = z.object({ code: z.string().trim().min(8).max(12) });

const claimPairingSchema = z.object({
  device_type: deviceType.optional(),
  name: deviceName.optional(),
  model: z.string().trim().max(80).optional(),
  platform_version: z.string().trim().max(40).optional(),
  touch_points: z.number().int().min(0).max(64).optional(),
  has_battery: z.boolean().optional(),
  battery_percent: z.number().int().min(0).max(100).nullable().optional(),
});

const heartbeatSchema = z.object({
  battery_percent: z.number().int().min(0).max(100).nullable().optional(),
});

// ---------- device ingest ----------

// Ten minutes of readings at one every five seconds, the most a device buffers while offline.
const MAX_READINGS_PER_BATCH = 120;

const deviceTime = z
  .string()
  .datetime({ offset: true, message: 'Use an ISO 8601 time with a zone, like 2026-11-04T09:30:00Z' })
  .transform((v) => new Date(v));

// Not strict: newer firmware may send fields this version does not store.
const readingSchema = z.object({
  recorded_at: deviceTime,
  latitude: z.number().finite().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90'),
  longitude: z.number().finite().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180'),
  battery_percent: z.number().int().min(0).max(100).nullable().optional(),
  heart_rate_bpm: z.number().int().min(20).max(250).nullable().optional(),
});

const ingestSchema = z.object({
  // The device clock when the batch left the device, to measure its drift.
  sent_at: deviceTime.optional(),
  readings: z
    .array(readingSchema)
    .min(1, 'Send at least one reading')
    .max(MAX_READINGS_PER_BATCH, `Send at most ${MAX_READINGS_PER_BATCH} readings at once`),
});

const importColumnMap = z.object({
  column_map: z
    .string()
    .optional()
    .transform((text, ctx) => {
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'column_map must be JSON' });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .object({
          full_name: z.string().min(1).optional(),
          employee_number: z.string().min(1).optional(),
          job_category: z.string().min(1).optional(),
          site_name: z.string().min(1).optional(),
        })
        .strict(),
    ),
});

const taskStatus = z.enum(['todo', 'in_progress', 'done']);

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), 'Enter a real date');

const taskTitle = z.string().trim().min(2, 'Enter a task title').max(150, 'Use at most 150 characters');

const createTaskSchema = z
  .object({
    title: taskTitle,
    employee_id: z.string().uuid('Choose an employee'),
    site_id: z.string().uuid('Invalid site').optional(),
    scheduled_for: isoDate.optional(),
  })
  .strict();

const updateTaskSchema = z
  .object({ title: taskTitle.optional(), status: taskStatus.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field to update');

const listTasksQuery = z.object({
  employee_id: z.string().uuid('Invalid employee').optional(),
  site_id: z.string().uuid('Invalid site').optional(),
  status: taskStatus.optional(),
  scheduled_for: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), 'Not a real date');

const dayQuery = z.object({ date: calendarDate.default(() => todayInRiyadh()) });

const clockTime24 = /^([01]\d|2[0-3]):[0-5]\d$/;

const correctionSchema = z
  .object({
    date: calendarDate,
    field: z.enum(['first_seen', 'last_seen', 'worked_minutes'], { message: 'Choose what to correct' }),
    corrected_value: z.union([z.string().trim(), z.number()]).transform((v) => String(v)),
    reason: z.string().trim().min(5, 'Give the reason for the correction').max(500, 'Use at most 500 characters'),
    site_id: z.string().uuid('Invalid site').optional(),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (o.field === 'worked_minutes') {
      const minutes = Number(o.corrected_value);
      if (!/^\d+$/.test(o.corrected_value) || minutes > 1440) {
        ctx.addIssue({ code: 'custom', path: ['corrected_value'], message: 'Enter the minutes worked, from 0 to 1440' });
      }
    } else if (!clockTime24.test(o.corrected_value)) {
      ctx.addIssue({ code: 'custom', path: ['corrected_value'], message: 'Use the 24-hour format HH:MM' });
    }
  });

const idParams = z.object({ id: z.string().uuid('Invalid id') });
const tokenParams = z.object({ token: linkToken });

const generateReportQuery = z
  .object({
    site_id: z.string().uuid('Invalid site id'),
    report_type: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
    from: isoDate,
    to: isoDate,
  })
  .strict()
  .refine((v) => v.from <= v.to, { message: 'from must not be after to', path: ['from'] });

const referenceParams = z.object({
  reference: z.string().trim().regex(/^SITE14-R-\d{8}-[0-9A-F]{8}$/, 'Invalid reference'),
});

const halalas = z.number().int('Use whole halalas').positive('Enter a price above zero').max(100_000_000);

const productFeatures = z.array(z.string().trim().min(1).max(120)).max(12, 'List at most 12 features');

const productFields = {
  name: z.string().trim().min(2, 'Enter a product name').max(120),
  description: z.string().trim().min(10, 'Describe the product in at least 10 characters').max(1000),
  device_type: deviceType,
  manufacturer: z.string().trim().max(60).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
  serial_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, 'Use 2 to 8 letters or digits'),
  price_halalas: halalas,
  stock: z.number().int().min(0, 'Stock cannot be negative').max(1_000_000),
  features: productFeatures.default([]),
  image_url: z.string().trim().url('Enter a full URL').max(500).nullable().optional(),
  is_active: z.boolean().default(true),
};

const createProductSchema = z
  .object({ sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/, 'Use 3 to 40 letters, digits or dashes'), ...productFields })
  .strict();

const updateProductSchema = z
  .object({ ...productFields, features: productFeatures, is_active: z.boolean() })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Send at least one field to change');

const MAX_ORDER_QUANTITY = 500;

const placeOrderSchema = z
  .object({
    items: z
      .array(
        z.object({
          product_id: z.string().uuid('Invalid product'),
          quantity: z.number().int().min(1, 'Order at least one').max(MAX_ORDER_QUANTITY, `Order at most ${MAX_ORDER_QUANTITY} at once`),
        }).strict(),
      )
      .min(1, 'Add at least one product')
      .max(20, 'Order at most 20 different products at once'),
    shipping_address: z.string().trim().min(10, 'Enter the full delivery address').max(500),
    contact_phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,30}$/, 'Enter a valid phone number'),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

const listOrdersQuery = z.object({
  status: z.enum(['placed', 'shipped', 'delivered', 'cancelled']).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const platformLoginSchema = z.object({ email, password: z.string().min(1, 'Enter your password').max(128) });

const platformListQuery = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const platformDevicesQuery = platformListQuery.extend({
  type: deviceType.optional(),
  health: z.enum(['online', 'offline', 'never']).optional(),
  company_id: z.string().uuid('Invalid company').optional(),
});

module.exports = {
  createPairingSchema,
  pairingCodeParams,
  claimPairingSchema,
  heartbeatSchema,
  createProductSchema,
  updateProductSchema,
  placeOrderSchema,
  listOrdersQuery,
  platformLoginSchema,
  platformListQuery,
  platformDevicesQuery,
  MAX_ORDER_QUANTITY,
  generateReportQuery,
  referenceParams,
  createTaskSchema,
  updateTaskSchema,
  listTasksQuery,
  registerSchema,
  loginSchema,
  loginVerifySchema,
  verifyEmailSchema,
  emailSchema,
  resetPasswordSchema,
  refreshSchema,
  inviteUserSchema,
  listUsersQuery,
  acceptInvitationSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuery,
  importColumnMap,
  dayQuery,
  correctionSchema,
  createSiteSchema,
  updateSiteSchema,
  listSitesQuery,
  createGeofenceSchema,
  updateGeofenceSchema,
  listGeofencesQuery,
  liveLocationsQuery,
  createDeviceSchema,
  createDeviceBatchSchema,
  updateDeviceSchema,
  listDevicesQuery,
  ingestSchema,
  MAX_DEVICE_BATCH,
  MAX_READINGS_PER_BATCH,
  idParams,
  tokenParams,
};
