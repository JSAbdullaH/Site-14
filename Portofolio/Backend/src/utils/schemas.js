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
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

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
  idParams,
  tokenParams,
  createEmployeeSchema,
  updateEmployeeSchema,
  listEmployeesQuery,
};
