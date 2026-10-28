const { z } = require('zod');

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);

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

const idParams = z.object({ id: z.string().uuid('Invalid id') });
const tokenParams = z.object({ token: linkToken });

const position = z.tuple([
  z.number().gte(-180, 'Longitude must be between -180 and 180').lte(180, 'Longitude must be between -180 and 180'),
  z.number().gte(-90, 'Latitude must be between -90 and 90').lte(90, 'Latitude must be between -90 and 90'),
]);

const linearRing = z
  .array(position)
  .min(4, 'A zone needs at least 3 corners')
  .max(500, 'A zone can have at most 500 corners')
  .refine((ring) => {
    const [a, b] = [ring[0], ring[ring.length - 1]];
    return a[0] === b[0] && a[1] === b[1];
  }, 'The boundary must be closed: the last point must equal the first');

const polygon = z.object({
  type: z.literal('Polygon'),
  coordinates: z.array(linearRing).min(1, 'The boundary needs an outer ring').max(20),
});

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

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
  idParams,
  tokenParams,
  createGeofenceSchema,
  updateGeofenceSchema,
  listGeofencesQuery,
  liveLocationsQuery,
};
