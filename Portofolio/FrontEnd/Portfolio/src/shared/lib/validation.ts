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