// Minimal HTML templating: interpolations are escaped unless wrapped in raw().

const RAW = Symbol('raw');
export interface Raw {
  [RAW]: true;
  value: string;
}

export function raw(value: string): Raw {
  return { [RAW]: true, value };
}

function isRaw(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && (v as any)[RAW] === true;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (isRaw(value)) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(value);
}

/** Tagged template: html`<p>${text}</p>` escapes text; arrays and raw() pass through. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return raw(out);
}

export function toString(value: Raw | string): string {
  return isRaw(value) ? value.value : value;
}

/** JSON for <script type="application/ld+json">, safe against </script>. */
export function jsonLd(data: unknown): Raw {
  return raw(`<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);
}
