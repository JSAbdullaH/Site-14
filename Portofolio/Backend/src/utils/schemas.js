const { z } = require('zod');

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

const listEmployeesQuery = z.object({
  search: z.string().trim().min(1).max(120).optional(),
  site_id: z.string().uuid('Invalid site').optional(),
  geofence_id: z.string().uuid('Invalid zone').optional(),
  job_category: jobCategory.optional(),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
});

// null takes the employee off their site.
const assignEmployeeSchema = z.object({ site_id: z.string().uuid('Invalid site').nullable() });

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

const idParams = z.object({ id: z.string().uuid('Invalid id') });
const tokenParams = z.object({ token: linkToken });

module.exports = {
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
  assignEmployeeSchema,
  createSiteSchema,
  updateSiteSchema,
  listSitesQuery,
  idParams,
  tokenParams,
};