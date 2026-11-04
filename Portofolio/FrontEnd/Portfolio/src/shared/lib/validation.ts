import { z } from "zod";

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(255);

export const newPassword = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters");

export const sixDigitCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the six-digit code");

export const signinSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});

export const codeSchema = z.object({
  email,
  code: sixDigitCode,
});

export const signupSchema = z.object({
  company_name: z.string().trim().min(2, "Enter your company name").max(150),
  commercial_registration: z.string().trim().max(50).optional(),
  full_name: z.string().trim().min(2, "Enter your full name").max(120),
  email,
  password: newPassword,
});

export const emailOnlySchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, "Invalid link").max(200, "Invalid link"),
  password: newPassword,
});

export const inviteSchema = z.object({
  full_name: z.string().trim().min(2, "Enter their full name").max(120),
  email,
  role: z.enum(["site_manager", "company_admin"]),
});

export const employeeSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the full name").max(120),
  job_category: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, "Enter a job category")
    .max(60),
  employee_number: z
    .string()
    .trim()
    .max(30, "Use at most 30 characters")
    .optional()
    .transform((v) => v || undefined),
  site_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  consent: z.boolean().optional(),
});

export const correctionSchema = z
  .object({
    field: z.enum(["first_seen", "last_seen", "worked_minutes"]),
    clock: z.string(),
    hours: z.string(),
    minutes: z.string(),
    reason: z.string().trim().min(5, "Give the reason for the correction").max(500, "Use at most 500 characters"),
  })
  .superRefine((v, ctx) => {
    if (v.field === "worked_minutes") {
      const h = Number(v.hours || 0);
      const m = Number(v.minutes || 0);
      if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59 || h * 60 + m > 1440) {
        ctx.addIssue({ code: "custom", path: ["hours"], message: "Enter hours (0 to 24) and minutes (0 to 59)" });
      }
    } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.clock)) {
      ctx.addIssue({ code: "custom", path: ["clock"], message: "Enter a time" });
    }
  });

// Same rule as the backend: the serial printed on the device, compared upper-case.
export const deviceSerial = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, "Use at least 3 characters")
  .max(64, "Use at most 64 characters")
  .regex(/^[A-Z0-9][A-Z0-9._:-]*$/, "Use letters, digits, dots, dashes, colons or underscores");

export type FieldErrors = Record<string, string>;

export function validate<T>(
  schema: z.ZodType<T>,
  value: unknown,
): { ok: true; data: T } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(value);

  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }

  return { ok: false, errors };
}