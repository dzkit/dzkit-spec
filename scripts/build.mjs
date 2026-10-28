// Validates every rule, source and test case, then writes the bundles in dist/.
//   node scripts/build.mjs          validate and write dist/
//   node scripts/build.mjs --check  validate and fail if dist/ is out of date
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const readYaml = (p) => YAML.parse(readFileSync(join(root, p), 'utf8'), { merge: true });
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(root, p)).isDirectory() ? walk(p) : [p];
  });

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const sourcesSchema = readJson('schema/sources.schema.json');
const ruleSchema = readJson('schema/rule.schema.json');
const vectorsSchema = readJson('schema/vectors.schema.json');
ajv.addSchema(sourcesSchema, 'sources.schema.json');
const validateSources = ajv.getSchema('sources.schema.json');
const validateRule = ajv.compile(ruleSchema);
const validateVectors = ajv.compile(vectorsSchema);
const explain = (v) => v.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

// ---------- Sources ----------
const JO_FR = (y, n) => `https://www.joradp.dz/FTP/JO-FRANCAIS/${y}/F${y}${String(n).padStart(3, '0')}.pdf`;
const JO_AR = (y, n) => `https://www.joradp.dz/FTP/jo-arabe/${y}/A${y}${String(n).padStart(3, '0')}.pdf`;

const sources = readYaml('sources.yaml');
if (!validateSources(sources)) fail('sources.yaml', explain(validateSources));
const sourceIds = new Set();
for (const s of sources) {
  if (sourceIds.has(s.id)) fail('sources.yaml', `duplicate id ${s.id}`);
  sourceIds.add(s.id);
  if (s.jo) s.jo.urls = { ar: JO_AR(s.jo.year, s.jo.issue), fr: JO_FR(s.jo.year, s.jo.issue) };
}

// ---------- Rules ----------
const rules = [];
for (const file of walk('rules').filter((f) => f.endsWith('.yaml')).sort()) {
  const rule = readYaml(file);
  if (!validateRule(rule)) {
    fail(file, explain(validateRule));
    continue;
  }
  const expectedId = relative('rules', file).replace(/\.yaml$/, '').split(/[\\/]/).join('.');
  if (rule.id !== expectedId) fail(file, `id should be ${expectedId}`);

  let previousEnd = null;
  rule.versions.forEach((v, i) => {
    const where = `${file} version ${i + 1}`;
    for (const id of v.sources) if (!sourceIds.has(id)) fail(where, `unknown source ${id}`);
    if (v.valid_from && v.valid_to && v.valid_from > v.valid_to) fail(where, 'valid_from is after valid_to');
    if (i > 0) {
      if (previousEnd === null) fail(where, 'the previous version never ends');
      else if (!v.valid_from || v.valid_from <= previousEnd) fail(where, 'overlaps the previous version');
    }
    previousEnd = v.valid_to;
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
    if (c.source && !sourceIds.has(c.source)) fail(`${file} ${c.id}`, `unknown source ${c.source}`);
  }
  vectors.push(v);
}

if (errors.length) {
  console.error(`✗ ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

// ---------- Bundles ----------
const pkg = readJson('package.json');
const spec = {
  $comment: 'Generated by scripts/build.mjs from rules/, sources.yaml and vectors/. Do not edit by hand.',
  name: 'dzkit-spec',
  version: pkg.version,
  sources,
  rules,
};
const out = {
  'dist/dzkit-spec.json': JSON.stringify(spec, null, 2) + '\n',
  'dist/vectors.json': JSON.stringify({ name: 'dzkit-spec vectors', version: pkg.version, suites: vectors }, null, 2) + '\n',
};

if (check) {
  const stale = Object.entries(out).filter(([p, c]) => !existsSync(join(root, p)) || readFileSync(join(root, p), 'utf8') !== c);
  if (stale.length) {
    console.error(`✗ dist/ is out of date (${stale.map(([p]) => p).join(', ')}). Run: npm run build`);
    process.exit(1);
  }
} else {
  mkdirSync(join(root, 'dist'), { recursive: true });
  for (const [p, c] of Object.entries(out)) writeFileSync(join(root, p), c);
}

const caseCount = vectors.reduce((a, v) => a + v.cases.length, 0);
console.log(`✓ ${sources.length} sources, ${rules.length} rules, ${vectors.length} suites with ${caseCount} test cases${check ? ', dist/ up to date' : ', dist/ written'}`);
