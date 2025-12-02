import { ZodError } from 'zod';

export function parseWithSchema(schema, payload) {
  try {
    return schema.parse(payload);
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => issue.message);
      const message = issues.join(', ');
      const err = new Error(message);
      err.statusCode = 400;
      throw err;
    }
    throw error;
  }
}

export function isoDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}
