#!/usr/bin/env node
// The manifest ↔ reality gate (R3-277c: "the manifest is validated against reality — a
// component exported but missing from the manifest, or vice versa, fails the engine's own
// `npm run verify`").
//
// A manifest that drifts from the code is worse than no manifest: a corpus checker would
// flag a component that works, or pass one that does not, and a composing shell would be
// told it may override something that no longer exists. So this runs in `verify`, before
// lint and build, because it is the cheapest of the three and the one whose failure is
// most confusing to debug later.
//
// It reads GROVE_MDX's keys by parsing the module rather than importing it (the module
// pulls in TSX, CSS and the SDK — not loadable from plain node), but it parses the OBJECT
// LITERAL's keys, not a regex over the whole file. That is the distinction R3-277c asks
// for: reformatting `mdxComponents.ts` must not change the outcome.

import { readFileSync, readdirSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// ajv arrives transitively with eslint (the same arrangement docs' scripts rely on);
// say so when it is absent rather than dying on a bare module-not-found.
const require = createRequire(join(root, 'package.json'));
const Ajv = (() => {
  try {
    return require('ajv');
  } catch {
    console.error('check-manifest: ajv is not resolvable — it rides with eslint; run npm install.');
    process.exit(1);
  }
})();
const manifest = JSON.parse(readFileSync(join(root, 'viewer.manifest.json'), 'utf8'));
const source = readFileSync(join(root, 'src/mdxComponents.ts'), 'utf8');

/**
 * Strip comments and string literals, replacing each with equivalent-length whitespace so
 * every offset in the result still lines up with the original. Brace-matching MUST run
 * over this and not the raw source: a `}` inside a comment or a string would otherwise end
 * the object literal early, and the failure mode is the worst kind — the gate reports the
 * whole manifest as drifted, which reads as "the manifest is broken" rather than "the
 * scanner is". (Found by planting a `}`-bearing comment; see the reformatting test.)
 */
function blankNonCode(src) {
  const out = src.split('');
  let i = 0;
  const blankTo = (end) => {
    for (; i < end && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ';
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const nl = src.indexOf('\n', i);
      blankTo(nl === -1 ? src.length : nl);
    } else if (two === '/*') {
      const close = src.indexOf('*/', i + 2);
      blankTo(close === -1 ? src.length : close + 2);
    } else if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const quote = src[i];
      let j = i + 1;
      while (j < src.length && src[j] !== quote) j += src[j] === '\\' ? 2 : 1;
      blankTo(Math.min(j + 1, src.length));
    } else {
      i++;
    }
  }
  return out.join('');
}

/** The keys of the `export const GROVE_MDX = { … }` object literal, brace-matched over the
 *  comment- and string-blanked source so reformatting cannot change the outcome. */
function groveMdxKeys(rawSrc) {
  const src = blankNonCode(rawSrc);
  const start = src.indexOf('export const GROVE_MDX = {');
  if (start === -1) throw new Error('GROVE_MDX object literal not found in src/mdxComponents.ts');
  const open = src.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) {
        end = j;
        break;
      }
    }
  }
  if (end === -1) throw new Error('GROVE_MDX object literal is unterminated');
  const keys = [];
  let nesting = 0;
  for (const line of src.slice(open + 1, end).split('\n')) {
    // Only TOP-level keys are the vocabulary; a nested object's keys are props, not
    // components.
    const before = nesting;
    for (const ch of line) {
      if (ch === '{' || ch === '[') nesting++;
      else if (ch === '}' || ch === ']') nesting--;
    }
    if (before !== 0) continue;
    const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*[,:]/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

// Rule 0 — the manifest validates against the FORMAT schema. This pair lived
// un-checked here for a year (the validation rule existed only in the docs fork's
// port), which is how the schema could lack the `themes`/`pageVariants` blocks the
// manifest already shipped (R3-661): nothing on this side ever read the two together.
// The schema is viewer-generic by contract — a Lodestar-shaped manifest must validate
// through it — so a drift here is a broken promise to every second viewer.
//
// It runs FIRST, and it HALTS: every later rule assumes the shape this one enforces,
// so a rejected manifest reports the schema verdict and stops — never a raw TypeError
// from a rule that trusted the shape (a missing `components`, a null entry, …).
// Extracted pure so the self-test can drive planted manifests through it.
const schema = JSON.parse(readFileSync(join(root, 'viewer-manifest.schema.json'), 'utf8'));
function schemaErrors(m) {
  const ajv = new Ajv({ logger: false });
  const validate = ajv.compile(schema);
  return validate(m) ? [] : [ajv.errorsText(validate.errors)];
}
{
  const rule0 = schemaErrors(manifest);
  if (rule0.length) {
    console.error(`FAIL manifest ↔ reality (${rule0.length}):\n  manifest fails viewer-manifest.schema.json: ${rule0.join('\n  ')}`);
    process.exit(1);
  }
}

const errors = [];

const exported = new Set(groveMdxKeys(source));
const declared = new Set(Object.keys(manifest.components));

for (const name of exported) {
  if (!declared.has(name)) {
    errors.push(
      `  ${name} — registered in GROVE_MDX but NOT in the manifest. A corpus can use it and ` +
        `a checker will flag it; a shell cannot override it. Declare it, or make it internal ` +
        `by removing it from GROVE_MDX.`,
    );
  }
}
for (const name of declared) {
  if (manifest.components[name].tier === 'corpus') continue; // declared by a corpus, not here
  if (!exported.has(name)) {
    errors.push(
      `  ${name} — declared in the manifest but NOT registered in GROVE_MDX. A corpus using ` +
        `it renders nothing, and a shell overriding it overrides a component that never runs.`,
    );
  }
}

// The viewer identity must match the package it ships in, or a shell resolving the
// manifest by package name gets someone else's contract.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (manifest.viewer.name !== pkg.name) {
  errors.push(`  viewer.name "${manifest.viewer.name}" ≠ package.json name "${pkg.name}".`);
}
const provides = (pkg['immediately.run']?.provides ?? []).map((p) => p.task);
if (manifest.viewer.task && !provides.includes(manifest.viewer.task)) {
  errors.push(
    `  viewer.task "${manifest.viewer.task}" is not in package.json immediately.run.provides ` +
      `(${provides.join(', ') || 'none'}).`,
  );
}

// Every export must be reachable, or a shell's import fails at compose time rather than here.
for (const [subpath, target] of Object.entries(pkg.exports ?? {})) {
  try {
    readFileSync(join(root, target));
  } catch {
    errors.push(`  exports["${subpath}"] → ${target} does not exist.`);
  }
}

// ── R3-309 — the layout-catalogue gates ─────────────────────────────────────
//
// The manifest's `layouts` entries and the files under content/_layouts/ must agree
// in BOTH directions (the same two-way rule the components section enforces), and a
// shipping starter's OWN frontmatter must carry the `layoutRole` its entry declares.
// That is the job the field was given: it sat unread in the sample layouts for a
// year, and "an inert field in a file people copy is a field people will copy".

const LAYOUTS_DIR = join(root, 'content', '_layouts');

/** The frontmatter block of a starter file, as key → value (scalars only — that is all a
 *  starter declares). */
function frontmatterOf(file) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (m) for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) fm[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return fm;
}

/** The layouts rule, extracted so the self-test can drive planted corpora through it
 *  (R3-662). `starters` is the id → on-disk file map — kept, never re-derived, so a
 *  `.md` starter is read back as `.md`. A `ships: true` entry whose file is missing
 *  is RECORDED and skipped — the collected verdict, never an ENOENT stack. */
function layoutRuleErrors(declaredLayouts, starters) {
  const ruleErrors = [];
  for (const [id, entry] of Object.entries(declaredLayouts)) {
    if (entry.ships && !starters.has(id)) {
      ruleErrors.push(`  layouts.${id} — declared ships:true but content/_layouts/${id} starter does not exist.`);
      continue; // recorded; do not read a file that does not exist
    }
    if (entry.ships) {
      const fm = starters.get(id).frontmatter;
      if (fm.layoutRole !== entry.layoutRole) {
        ruleErrors.push(
          `  layouts.${id} — manifest says layoutRole:${entry.layoutRole}, the starter's frontmatter says ` +
            `${JSON.stringify(fm.layoutRole)}. The two must agree.`,
        );
      }
      if (fm.nav && fm.nav !== 'top' && fm.nav !== 'side') {
        ruleErrors.push(`  layouts.${id} — nav:${fm.nav} is neither 'top' nor 'side'; resolveNavMode would silently fall back.`);
      }
    }
  }
  for (const [id, starter] of starters) {
    if (!declaredLayouts[id]) {
      ruleErrors.push(
        `  ${starter.file} — a starter on disk with NO manifest entry. It renders (when ` +
          `copied) but nothing declares it: a corpus checker cannot find it and an agent cannot discover it.`,
      );
    }
  }
  return ruleErrors;
}

/** Read content/_layouts/ once, keeping the id → on-disk filename mapping. */
function readStarters(layoutsDir) {
  const starters = new Map();
  if (!existsSync(layoutsDir)) return starters;
  for (const e of readdirSync(layoutsDir, { withFileTypes: true })) {
    if (e.isFile() && /\.mdx?$/.test(e.name)) {
      const file = join(layoutsDir, e.name);
      starters.set(e.name.replace(/\.mdx?$/, ''), { file, frontmatter: frontmatterOf(file) });
    }
  }
  return starters;
}

const declaredLayouts = manifest.layouts ?? {};
const starters = readStarters(LAYOUTS_DIR);
errors.push(...layoutRuleErrors(declaredLayouts, starters));

// Collection shapes ride on engine components; a declared component that is not in the
// vocabulary is the same lie as an undeclared one in the components section.
const collections = manifest.collections ?? {};
for (const [id, entry] of Object.entries(collections)) {
  if (entry.component && !exported.has(entry.component)) {
    errors.push(
      `  collections.${id} — rides on "${entry.component}", which is not registered in GROVE_MDX. ` +
        `A corpus writing the documented call renders nothing.`,
    );
  }
  for (const [prop, value] of Object.entries(entry.props ?? {})) {
    if (/^\{.*\}$/.test(value)) {
      errors.push(`  collections.${id} — props.${prop} is an EXPRESSION (${value}). The interpreter drops it silently.`);
    }
  }
}

if (errors.length) {
  console.error(`FAIL manifest ↔ reality (${errors.length}):\n${errors.join('\n')}`);
  process.exit(1);
}
console.log(
  `OK ${manifest.viewer.name}: ${declared.size} components declared, ` +
    `${[...declared].filter((n) => manifest.components[n].overridable).length} overridable, ` +
    `${Object.keys(pkg.exports ?? {}).length} export subpaths resolve, ` +
    `${starters.size} layout starter(s), ${Object.keys(collections).length} collection shape(s).`,
);

// ── self-test ─────────────────────────────────────────────────────────────────
// Rule 0's teeth, planted rather than asserted (the reviewer was right to demand the
// committed form of the manual fault injection): a gate nothing has watched reject
// anything is an assumption. Driven through `schemaErrors` — the same function the
// gate runs — so the cases move when the rule does.
const selfTest = () => {
  const cases = [];
  cases.push(['the shipped pair validates', () => schemaErrors(manifest).length === 0]);
  cases.push(['a planted top-level key fails', () =>
    schemaErrors({ ...manifest, bogusKey: 'x' }).length > 0]);
  cases.push(['a manifest missing components fails with the schema verdict, not a crash', () => {
    const { components, ...rest } = manifest;
    return schemaErrors(rest).length > 0;
  }]);
  // The viewer-generic contract (spec §5.1): a Lodestar-shaped manifest — node/edge
  // vocabulary, its own themes — validates through the same schema.
  const lodestar = {
    schemaVersion: 1,
    viewer: { name: '@fictional/lodestar', kind: 'mindmap', task: 'open-mindmap' },
    components: {
      MindNode: { tier: 'engine', overridable: true, sanitizing: false, props: { label: 'string?', depth: 'number?' }, summary: 'A node.' },
      MindEdge: { tier: 'engine', overridable: true, sanitizing: false, props: { from: 'string', to: 'string' }, summary: 'An edge.' },
      Legend: { tier: 'chrome', overridable: true, sanitizing: false, props: {}, summary: 'Map chrome.' },
      RiskBadge: { tier: 'corpus', overridable: true, sanitizing: false, props: {}, summary: 'One corpus convention.' },
    },
    frontmatter: { engine: ['view', 'collapsed'], corpusTooling: ['risk'], passThrough: true },
  };
  cases.push(['a Lodestar manifest validates through the same schema', () => schemaErrors(lodestar).length === 0]);
  cases.push(['a manifest with an unknown tier is rejected', () =>
    schemaErrors({ ...lodestar, components: { X: { tier: 'galaxy', overridable: true } } }).length > 0]);

  // R3-662 — the layouts rule's two crash triggers, planted and driven through the
  // REAL read path (readStarters over a tmp corpus). Before the fix both died on a
  // raw ENOENT after the rule had already recorded its verdict; the verdict is the
  // whole point, so these prove "the collected verdict, never a stack".
  const plantCorpus = (files) => {
    const dir = mkdtempSync(join(tmpdir(), 'grove-layouts-'));
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    return dir;
  };
  cases.push(['a ships:true entry with a missing starter records the verdict and does NOT crash', () => {
    const dir = plantCorpus({});
    try {
      const errors = layoutRuleErrors({ ghost: { ships: true, layoutRole: 'page' } }, readStarters(dir));
      return errors.length === 1 && errors[0].includes('layouts.ghost') && errors[0].includes('does not exist');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }]);
  cases.push(['a .md starter is read back with its own extension (no fabricated .mdx)', () => {
    // note.md declares layoutRole:page but the manifest says layoutRole:article —
    // the mismatch verdict proves the .md file's own frontmatter was read.
    const dir = plantCorpus({ 'note.md': '---\nlayoutRole: page\n---\n# Note\n' });
    try {
      const errors = layoutRuleErrors({ note: { ships: true, layoutRole: 'article' } }, readStarters(dir));
      return errors.length === 1 && errors[0].includes('"page"') && errors[0].includes('layouts.note');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }]);
  cases.push(['a shipping .md starter whose frontmatter agrees passes', () => {
    const dir = plantCorpus({ 'note.md': '---\nlayoutRole: page\n---\n# Note\n' });
    try {
      return layoutRuleErrors({ note: { ships: true, layoutRole: 'page' } }, readStarters(dir)).length === 0;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }]);

  let failed = 0;
  for (const [name, fn] of cases) {
    let pass = false;
    try {
      pass = fn();
    } catch {
      pass = false;
    }
    console.log(`${pass ? '✓' : '✗'} ${name}`);
    if (!pass) failed++;
  }
  console.log(`\n${cases.length - failed}/${cases.length} self-test cases.`);
  return failed === 0;
};

if (process.argv.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
