// Small shared helpers. Standard library only.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

/** ASCII slug: strips accents, lowercases, joins words with single hyphens. */
export function slugify(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Comparison key for names: accents, case, spacing and punctuation removed. */
export function nameKey(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export const ISO_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** Accepts YYYY, YYYY-MM, YYYY-MM-DD and DD.MM.YYYY; returns ISO or null. */
export function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const v = value.trim();
  if (ISO_DATE.test(v)) return v;
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  return null;
}

export function unique<T>(values: Iterable<T | null | undefined | false | ''>): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const v of values) {
    if (v === null || v === undefined || v === false || v === '') continue;
    if (seen.has(v as T)) continue;
    seen.add(v as T);
    out.push(v as T);
  }
  return out;
}

/** Drops undefined, null, empty strings, empty arrays and empty objects, recursively. */
export function compact<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => compact(v)).filter((v) => !isEmpty(v)) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const c = compact(v);
      if (!isEmpty(c)) out[k] = c;
    }
    return out as T;
  }
  return value;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

export function readJson<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export function readGzipJson<T = unknown>(path: string): T {
  return JSON.parse(zlib.gunzipSync(readFileSync(path)).toString('utf8')) as T;
}

/** Writes pretty JSON with a trailing newline, creating folders as needed. */
export function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text.endsWith('\n') ? text : text + '\n');
}

export function emptyDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

/** Every file below a folder, as paths relative to it. */
export function listFiles(root: string, ext = '.json'): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, r);
      else if (name.endsWith(ext)) out.push(r);
    }
  };
  walk(root, '');
  return out;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Hands out unique slugs: base, base-2, base-3 ... */
export class SlugAllocator {
  private used = new Set<string>();
  claim(base: string): string {
    let candidate = base || 'unnamed';
    let n = 2;
    while (this.used.has(candidate)) candidate = `${base}-${n++}`;
    this.used.add(candidate);
    return candidate;
  }
  reserve(slug: string): boolean {
    if (this.used.has(slug)) return false;
    this.used.add(slug);
    return true;
  }
  has(slug: string): boolean {
    return this.used.has(slug);
  }
}

/** Groups items by a key, keeping first-seen order. */
export function groupBy<T>(items: Iterable<T>, key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(item);
  }
  return out;
}
