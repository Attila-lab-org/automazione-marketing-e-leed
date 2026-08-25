import type { z } from 'zod';
import { StructuredOutputError } from './errors';

const SECRET_PATTERN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]+)/gi;

export function redactSecrets(value: string): string {
  return value.replace(SECRET_PATTERN, '[REDACTED]');
}

export function previewText(value: string, max = 240): string {
  const clean = redactSecrets(value).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

function unwrapJsonFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

export function parseStructuredOutput<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unwrapJsonFence(raw));
  } catch {
    throw new StructuredOutputError('output non è JSON valido', previewText(raw));
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new StructuredOutputError('output JSON non rispetta lo schema', previewText(raw));
  }
  return result.data;
}
