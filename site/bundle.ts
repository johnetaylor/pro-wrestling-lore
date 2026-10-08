// A small bundler for the explorer: follows relative imports from an entry module, strips the
// TypeScript types with Node's own stripper, and wraps each module in a function so the whole
// app ships as one classic script. It understands the import and export forms this codebase
// uses (named imports and exports, no default exports, no `export *`, no import cycles).
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, relative, resolve } from 'node:path';

const IMPORT = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?[ \t]*$/gm;
const SIDE_EFFECT_IMPORT = /^import\s*'([^']+)';?[ \t]*$/gm;
const EXPORT_DECL = /^export\s+(async\s+function\*?|function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\};?[ \t]*$/gm;

export function bundle(entry: string, root: string): { code: string; modules: string[] } {
  const order: string[] = [];
  const bodies = new Map<string, string>();
  const visit = (file: string, stack: string[]) => {
    if (bodies.has(file)) return;
    if (stack.includes(file)) throw new Error(`Import cycle: ${[...stack, file].map((f) => relative(root, f)).join(' → ')}`);
    const id = relative(root, file);
    let code = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'strip' });
    const deps: string[] = [];
    code = code.replace(IMPORT, (_, names: string, spec: string) => {
      const target = resolve(dirname(file), spec);
      deps.push(target);
      const list = names
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': '));
      return list.length ? `const { ${list.join(', ')} } = __mod(${JSON.stringify(relative(root, target))});` : '';
    });
    code = code.replace(SIDE_EFFECT_IMPORT, (_, spec: string) => {
      const target = resolve(dirname(file), spec);
      deps.push(target);
      return `__mod(${JSON.stringify(relative(root, target))});`;
    });
    if (/^\s*import\s/m.test(code)) throw new Error(`${id}: unsupported import form`);
    const exported: string[] = [];
    code = code.replace(EXPORT_DECL, (_, kind: string, name: string) => {
      exported.push(name);
      return `${kind} ${name}`;
    });
    code = code.replace(EXPORT_LIST, (_, names: string) => {
      for (const n of names.split(',').map((x) => x.trim()).filter(Boolean)) {
        const [local, as] = n.split(/\s+as\s+/);
        exported.push(as ? `${as}: ${local}` : local);
      }
      return '';
    });
    if (/^\s*export\s/m.test(code)) throw new Error(`${id}: unsupported export form`);
    for (const d of deps) visit(d, [...stack, file]);
    bodies.set(file, `__def(${JSON.stringify(id)}, function () {\n${code}\nreturn { ${exported.join(', ')} };\n});`);
    order.push(file);
  };
  const entryFile = resolve(entry);
  visit(entryFile, []);
  const runtime = `(() => {\n'use strict';\nconst __defs = {}, __cache = {};\nconst __def = (id, f) => { __defs[id] = f; };\nconst __mod = (id) => __cache[id] || (__cache[id] = __defs[id]());\n`;
  const code = `${runtime}${order.map((f) => bodies.get(f)).join('\n')}\n__mod(${JSON.stringify(relative(root, entryFile))});\n})();\n`;
  return { code, modules: order.map((f) => relative(root, f)) };
}

