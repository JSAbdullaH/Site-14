import { useState } from "react";
import type { ZodType } from "zod";
import { validate } from "./validation";
import type { FieldErrors } from "./validation";

type Touched = Record<string, boolean>;

export function useFormValidation<T>(schema: ZodType<T>) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Touched>({});

  function applyErrors(values: unknown, visibleFields: Touched) {
    const result = validate(schema, values);
    const all = result.ok ? {} : result.errors;

    const visible: FieldErrors = {};
    for (const key of Object.keys(all)) {
      if (visibleFields[key]) visible[key] = all[key];
    }

    setErrors(visible);
  }

  function handleBlur(field: string, values: unknown) {
    const next = { ...touched, [field]: true };
    setTouched(next);
    applyErrors(values, next);
  }

  function handleChange(values: unknown) {
    applyErrors(values, touched);
  }

  function validateAll(values: unknown) {
    const result = validate(schema, values);

    if (!result.ok) {
      setErrors(result.errors);
      setTouched(
        Object.fromEntries(Object.keys(result.errors).map((k) => [k, true])),
      );
    }

    return result;
  }

  function reset() {
    setErrors({});
    setTouched({});
  }

  return { errors, handleBlur, handleChange, validateAll, reset };
}