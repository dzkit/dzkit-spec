// Validates every rule, source and test case, computes how far each rule can be
// trusted, and writes dist/ and TRUST.md.
//
//   node scripts/build.mjs            validate, write dist/ and TRUST.md
//   node scripts/build.mjs --check    validate, fail if dist/ or TRUST.md is out of date
//   node scripts/build.mjs --overdue  fail if a rule is past its review date (used weekly)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export const SCHEMA_VERSION = 2;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const errors = [];
const warnings = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const readYaml = (p) => YAML.parse(readFileSync(join(root, p), 'utf8'), { merge: true });
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
  });

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addSchema(readJson('schema/sources.schema.json'), 'sources.schema.json');
const validateSources = ajv.getSchema('sources.schema.json');
const validateRule = ajv.compile(readJson('schema/rule.schema.json'));
const validateVectors = ajv.compile(readJson('schema/vectors.schema.json'));
const explain = (v) => v.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

// ---------- Hierarchy ----------
const AUTHORITIES = ['legal-text', 'official-publication', 'secondary'];
const hierarchy = readYaml('hierarchy.yaml');
const kinds = new Map();
for (const h of hierarchy) {
  if (kinds.has(h.kind)) fail('hierarchy.yaml', `duplicate kind ${h.kind}`);
  if (!AUTHORITIES.includes(h.authority)) fail('hierarchy.yaml', `${h.kind}: unknown authority ${h.authority}`);
  if (!Number.isInteger(h.rank)) fail('hierarchy.yaml', `${h.kind}: rank must be an integer`);
  kinds.set(h.kind, h);
}

// ---------- Sources ----------
const JO_FR = (y, n) => `https://www.joradp.dz/FTP/JO-FRANCAIS/${y}/F${y}${String(n).padStart(3, '0')}.pdf`;
const JO_AR = (y, n) => `https://www.joradp.dz/FTP/jo-arabe/${y}/A${y}${String(n).padStart(3, '0')}.pdf`;

const sources = readYaml('sources.yaml');
if (!validateSources(sources)) fail('sources.yaml', explain(validateSources));
const sourceById = new Map();
for (const s of sources) {
  if (sourceById.has(s.id)) fail('sources.yaml', `duplicate id ${s.id}`);
  sourceById.set(s.id, s);
  const k = kinds.get(s.kind);
  if (!k) {
    fail(`source ${s.id}`, `unknown kind ${s.kind} (see hierarchy.yaml)`);
    continue;
  }
  s.authority = k.authority;
  s.rank = k.rank;
  if (s.jo) s.jo.urls = { ar: JO_AR(s.jo.year, s.jo.issue), fr: JO_FR(s.jo.year, s.jo.issue) };
  if (s.verification.read !== 'original' && !s.verification.via?.length) {
    fail(`source ${s.id}`, `read is ${s.verification.read}: list the pages it was read through in verification.via`);
  }
  if (s.authority === 'legal-text' && !s.jo) warn(`source ${s.id}`, 'Journal officiel issue not recorded');
  if (!s.jo && !s.url && s.authority !== 'legal-text') fail(`source ${s.id}`, 'needs a url');
}
for (const s of sources) for (const a of s.amends ?? []) if (!sourceById.has(a)) fail(`source ${s.id}`, `amends unknown source ${a}`);

// ---------- Rules ----------
const TRUST = {
  'verified-official': { order: 1, en: 'Checked against the official text' },
  'reported-official': { order: 2, en: 'Official text cited, checked through reliable reports' },
  examples: { order: 3, en: 'No official text; confirmed by real examples' },
  convention: { order: 4, en: 'Standard convention' },
};
const addMonths = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

const usedSources = new Set();
const rules = [];
for (const file of walk('rules').filter((f) => f.endsWith('.yaml')).sort()) {
  const rule = readYaml(file);
  if (!validateRule(rule)) {
    fail(file, explain(validateRule));
    continue;
  }
  const expectedId = relative('rules', file).replace(/\.yaml$/, '').split(/[\\/]/).join('.');
  if (rule.id !== expectedId) fail(file, `id should be ${expectedId}`);

  let previousEnd;
  rule.versions.forEach((v, i) => {
    const where = `${rule.id} version ${i + 1}`;
    v.sources = v.sources.map((c) => (typeof c === 'string' ? { source: c } : c));
    const cited = [];
    for (const c of v.sources) {
      const s = sourceById.get(c.source);
      if (!s) {
        fail(where, `unknown source ${c.source}`);
        continue;
      }
      usedSources.add(s.id);
      cited.push(s);
    }
    if (v.valid_from && v.valid_to && v.valid_from > v.valid_to) fail(where, 'valid_from is after valid_to');
    if (i > 0) {
      if (previousEnd === null) fail(where, 'the previous version never ends');
      else if (!v.valid_from || v.valid_from <= previousEnd) fail(where, 'overlaps the previous version');
    }
    previousEnd = v.valid_to;

    // How far can this version be trusted?
    const official = cited.filter((s) => s.authority !== 'secondary');
    if (v.status === 'official' && !official.length) fail(where, 'status is official but no legal text or official publication is cited');
    let level;
    if (v.status === 'convention') level = 'convention';
    else if (v.status === 'confirmed') level = 'examples';
    else level = official.some((s) => s.verification.read !== 'report') ? 'verified-official' : 'reported-official';
    const strongest = [...cited].sort((a, b) => a.rank - b.rank || (b.date ?? '').localeCompare(a.date ?? ''))[0];
    const lastChecked = cited.map((s) => s.verification.checked).sort().at(-1);
    v.trust = {
      level,
      label: TRUST[level].en,
      strongest_source: strongest?.id ?? null,
      last_checked: lastChecked ?? null,
      review_due: lastChecked ? addMonths(lastChecked, rule.review.every_months) : null,
    };
  });
  rules.push(rule);
}


// Rule-specific checks
const byId = Object.fromEntries(rules.map((r) => [r.id, r]));
const wilayas = byId['administrative.wilayas'];
if (wilayas) {
  for (const v of wilayas.versions) {
    const codes = v.data.map((w) => w.code);
    codes.forEach((c, i) => {
      if (c !== i + 1) fail('administrative.wilayas', `codes must run 1, 2, 3… without gaps (found ${c} at position ${i + 1})`);
    });
    for (const w of v.data) {
      if (!/^[؀-ۿ\s]+$/.test(w.name_ar)) fail('administrative.wilayas', `Arabic name of ${w.code} has non-Arabic characters`);
      if (w.parent !== undefined && !codes.includes(w.parent)) fail('administrative.wilayas', `parent of ${w.code} does not exist`);
    }
  }
}
const irg = byId['payroll.irg-salary'];
if (irg) {
  for (const v of irg.versions) {
    const b = v.data.brackets;
    b.forEach((x, i) => {
      if (i < b.length - 1 && (x.up_to === null || (i > 0 && x.up_to <= b[i - 1].up_to))) fail('payroll.irg-salary', 'brackets must increase, only the last may be unbounded');
    });
    if (b.at(-1).up_to !== null) fail('payroll.irg-salary', 'the last bracket must be unbounded (up_to: null)');
    v.data.annual_brackets?.forEach((x, i) => {
      if (x.rate !== b[i].rate || (x.up_to !== null && x.up_to / 12 !== b[i].up_to)) fail('payroll.irg-salary', `annual bracket ${i + 1} is not 12 × the monthly one`);
    });
  }
}
const cnas = byId['payroll.cnas'];
if (cnas) {
  for (const v of cnas.versions) {
    const sum = (k) => Math.round(v.data.branches.reduce((a, b) => a + (b[k] ?? 0), 0) * 1e6) / 1e6;
    if (sum('employer') !== v.data.employer) fail('payroll.cnas', 'employer branches do not add up');
    if (sum('employee') !== v.data.employee) fail('payroll.cnas', 'employee branches do not add up');
    const total = Math.round((v.data.employer + v.data.employee + v.data.social_services) * 1e6) / 1e6;
    if (total !== v.data.total) fail('payroll.cnas', 'total is not employer + employee + social services');
  }
}

// ---------- Test cases ----------
const vectors = [];
for (const file of walk('vectors').filter((f) => f.endsWith('.json')).sort()) {
  const v = readJson(file);
  if (!validateVectors(v)) {
    fail(file, explain(validateVectors));
    continue;
  }
  if (`${v.operation}.json` !== file.split(/[\\/]/).pop()) fail(file, `file name should be ${v.operation}.json`);
  if (v.rule && !byId[v.rule]) fail(file, `unknown rule ${v.rule}`);
  const ids = new Set();
  for (const c of v.cases) {
    if (ids.has(c.id)) fail(file, `duplicate case id ${c.id}`);
    ids.add(c.id);
    if (c.source && !sourceById.has(c.source)) fail(`${file} ${c.id}`, `unknown source ${c.source}`);
  }
  vectors.push(v);
}

for (const v of vectors) for (const c of v.cases) if (c.source) usedSources.add(c.source);
for (const s of sources) if (!usedSources.has(s.id) && !sources.some((o) => o.amends?.includes(s.id))) warn(`source ${s.id}`, 'not cited by any rule or test case');

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

// ---------- Overdue reviews (weekly job) ----------
const today = new Date().toISOString().slice(0, 10);
const current = (r) => r.versions.find((v) => v.valid_to === null) ?? r.versions.at(-1);
const overdue = rules.filter((r) => current(r).trust.review_due && current(r).trust.review_due < today);
if (args.has('--overdue')) {
  if (overdue.length) {
    console.error(`✗ ${overdue.length} rule(s) past their review date:`);
    for (const r of overdue) console.error(`  ${r.id}: review was due ${current(r).trust.review_due}`);
    process.exit(1);
  }
  console.log('✓ No rule is past its review date.');
  process.exit(0);
}

// ---------- Outputs ----------
const pkg = readJson('package.json');
const spec = {
  $comment: 'Generated by scripts/build.mjs from hierarchy.yaml, sources.yaml and rules/. Do not edit by hand.',
  name: 'dzkit-spec',
  version: pkg.version,
  schema_version: SCHEMA_VERSION,
  hierarchy,
  sources,
  rules,
};
const outputs = {
  'dist/dzkit-spec.json': JSON.stringify(spec, null, 2) + '\n',
  'dist/vectors.json': JSON.stringify({ name: 'dzkit-spec vectors', version: pkg.version, schema_version: SCHEMA_VERSION, suites: vectors }, null, 2) + '\n',
  'TRUST.md': trustReport(),
};

function trustReport() {
  const title = (s) => s.title.fr ?? s.title.en ?? s.title.ar;
  const link = (s) => (s.jo ? `[JO ${s.jo.year} nº ${s.jo.issue}](${s.jo.urls.ar}) ([fr](${s.jo.urls.fr}))` : s.url ? `[link](${s.url})` : '—');
  const kindLabel = (s) => kinds.get(s.kind).label.en;
  const named = (s) => [kindLabel(s), s.number].filter(Boolean).join(' ');
  const L = [];
  L.push('# Trust report', '');
  L.push(`Generated by \`npm run build\` from the rules and sources of dzkit-spec ${pkg.version}. Do not edit by hand.`, '');
  L.push('This page says, for every rule, **which text makes it law**, **how closely that text was checked**, and **when it must be checked again**. It also lists the work still needed, so anyone can help close the gaps.', '');

  L.push('## Trust levels', '');
  L.push('| Level | Meaning |', '|---|---|');
  L.push('| Checked against the official text | A binding text or official publication was read in its official form or a faithful copy |');
  L.push('| Official text cited, checked through reliable reports | The binding text is identified (with its Journal officiel issue when known) but was read through press or guides; the official PDF still needs opening |');
  L.push('| No official text; confirmed by real examples | Nothing official is published; the rule reproduces real documents |');
  L.push('| Standard convention | Language or formatting conventions, with a reference |');
  L.push('');

  L.push('## Rules', '');
  L.push('| Rule | Latest version from | Trust | Strongest source | Last checked | Review due |', '|---|---|---|---|---|---|');
  for (const r of rules) {
    const v = current(r);
    const strongest = sourceById.get(v.trust.strongest_source);
    L.push(`| \`${r.id}\` ${r.title.en ?? r.title.fr} | ${v.valid_from ?? 'not recorded'} | ${v.trust.label} | ${strongest ? `${named(strongest)} (\`${strongest.id}\`)` : '—'} | ${v.trust.last_checked} | ${v.trust.review_due} |`);
  }
  L.push('');

  L.push('## Work to do', '');
  const toOpen = sources.filter((s) => s.authority === 'legal-text' && s.verification.read === 'report' && s.jo);
  L.push(`### Open the official text (${toOpen.length})`, '');
  if (toOpen.length) {
    L.push('These binding texts were read through reports. Open the Arabic PDF, check the cited passage, then set `verification.read: original` in sources.yaml.', '');
    L.push('| Source | Text | Journal officiel |', '|---|---|---|');
    for (const s of toOpen) L.push(`| \`${s.id}\` | ${named(s)}: ${title(s)} | ${link(s)} |`);
  } else L.push('Nothing to do.');
  L.push('');
  const noJo = sources.filter((s) => s.authority === 'legal-text' && !s.jo);
  L.push(`### Find the Journal officiel issue (${noJo.length})`, '');
  if (noJo.length) {
    L.push('| Source | Text | Date |', '|---|---|---|');
    for (const s of noJo) L.push(`| \`${s.id}\` | ${named(s)}: ${title(s)} | ${s.date ?? '—'} |`);
  } else L.push('Nothing to do.');
  L.push('');
  const officialViaReport = sources.filter((s) => s.authority === 'official-publication' && s.verification.read === 'report');
  L.push(`### Read the official publication directly (${officialViaReport.length})`, '');
  if (officialViaReport.length) {
    L.push('| Source | Publication | Link |', '|---|---|---|');
    for (const s of officialViaReport) L.push(`| \`${s.id}\` | ${title(s)} | ${link(s)} |`);
  } else L.push('Nothing to do.');
  L.push('');

  L.push('## Sources', '');
  L.push('| Source | Kind | Authority | Read | Checked | Official text |', '|---|---|---|---|---|---|');
  for (const s of [...sources].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))) {
    L.push(`| \`${s.id}\` ${title(s)} | ${kindLabel(s)} | ${s.authority} | ${s.verification.read} | ${s.verification.checked} | ${link(s)} |`);
  }
  L.push('');

  L.push('## Test cases', '');
  L.push('| Operation | Cases | With a cited source |', '|---|---|---|');
  for (const v of vectors) L.push(`| \`${v.operation}\` | ${v.cases.length} | ${v.cases.filter((c) => c.source).length} |`);
  L.push(`| **Total** | **${vectors.reduce((a, v) => a + v.cases.length, 0)}** | **${vectors.reduce((a, v) => a + v.cases.filter((c) => c.source).length, 0)}** |`);
  L.push('');
  return L.join('\n');
}

if (args.has('--check')) {
  const stale = Object.entries(outputs).filter(([p, c]) => !existsSync(join(root, p)) || readFileSync(join(root, p), 'utf8') !== c);
  if (stale.length) {
    console.error(`✗ out of date: ${stale.map(([p]) => p).join(', ')}. Run: npm run build`);
    process.exit(1);
  }
} else {
  mkdirSync(join(root, 'dist'), { recursive: true });
  for (const [p, c] of Object.entries(outputs)) writeFileSync(join(root, p), c);
}

if (warnings.length) console.log(`! ${warnings.length} note(s), see TRUST.md:\n  ${warnings.join('\n  ')}`);
const levels = rules.map((r) => current(r).trust.level);
const count = (l) => levels.filter((x) => x === l).length;
console.log(
  `✓ ${sources.length} sources, ${rules.length} rules (${count('verified-official')} checked against the official text, ` +
    `${count('reported-official')} through reports, ${count('examples')} by examples, ${count('convention')} convention), ` +
    `${vectors.reduce((a, v) => a + v.cases.length, 0)} test cases${args.has('--check') ? ', outputs up to date' : ', outputs written'}`,
);
