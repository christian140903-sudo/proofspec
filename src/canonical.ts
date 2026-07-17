import { createHash } from 'node:crypto';
import { relative, sep } from 'node:path';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' ? value : canonicalJson(value)).digest('hex');
}

export function redactRoot(value: unknown, rootDir: string): unknown {
  if (typeof value === 'string') {
    if (value === rootDir) return '.';
    if (value.startsWith(`${rootDir}${sep}`)) return `.${sep}${relative(rootDir, value)}`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => redactRoot(item, rootDir));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactRoot(item, rootDir)]));
  }
  return value;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]));
  }
  return value;
}
