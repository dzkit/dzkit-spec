// Looks for new Journal officiel issues and searches their text for each rule's
// `watch` phrases. Used weekly by .github/workflows/jo-watch.yml.
//
//   node scripts/watch-jo.mjs --after 2026-57     scan issues published after 2026 nº 57
//   node scripts/watch-jo.mjs --bootstrap         only find the latest issue (first run)
//
// Options: --out <dir> (default watch-out), --max <n> issues per run (default 20),
//          --today YYYY-MM-DD (for tests). Env JO_BASE overrides https://www.joradp.dz/FTP.
// Needs `pdftotext` (poppler-utils).
//
// Writes <out>/result.json and, for each issue with matches, <out>/issue-YYYY-NNN.md
// (first line is the title, the rest the body).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const BASE = (process.env.JO_BASE ?? 'https://www.joradp.dz/FTP').replace(/\/$/, '');
const OUT = opt('out', 'watch-out');
const MAX = Number(opt('max', 20));
const TODAY = opt('today', new Date().toISOString().slice(0, 10));
const thisYear = Number(TODAY.slice(0, 4));

const pad = (n) => String(n).padStart(3, '0');
export const joUrls = (year, issue) => ({
  fr: `${BASE}/JO-FRANCAIS/${year}/F${year}${pad(issue)}.pdf`,
  ar: `${BASE}/jo-arabe/${year}/A${year}${pad(issue)}.pdf`,
});

// Lower case, no accents, single spaces, straight apostrophes.
export const normalize = (text) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ْ]/g, '') // Arabic short vowels
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ');

async function download(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: { 'user-agent': 'dzkit-spec Journal officiel watch (+https://github.com/dzkit/dzkit-spec)' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.subarray(0, 4).toString() === '%PDF' ? buf : null;
  } catch {
    return null;
  }
}

async function exists(year, issue) {
  return (await download(joUrls(year, issue).fr)) !== null || (await download(joUrls(year, issue).ar)) !== null;
}

function pdfText(buf) {
  const file = join(tmpdir(), `jo-${process.pid}-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(file, buf);
  try {
    return execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { maxBuffer: 256 * 1024 * 1024 }).toString();
  } catch {
    return '';
  } finally {
    rmSync(file, { force: true });
  }
}

/** Latest existing issue of a year, assuming issues are numbered without gaps. */
async function latestIssue(year) {
  if (!(await exists(year, 1))) return 0;
  let lo = 1;
  let hi = 2;
  while (hi < 400 && (await exists(year, hi))) {
    lo = hi;
    hi *= 2;
  }
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (await exists(year, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function watchList() {
  const spec = JSON.parse(readFileSync(join(root, 'dist/dzkit-spec.json'), 'utf8'));
  return spec.rules.flatMap((r) =>
    ['fr', 'ar'].flatMap((lang) => (r.watch?.[lang] ?? []).map((phrase) => ({ rule: r.id, lang, phrase, needle: normalize(phrase) }))),
  );
}

async function scan(year, issue, phrases) {
  const urls = joUrls(year, issue);
  const texts = {};
  for (const lang of ['fr', 'ar']) {
    const buf = await download(urls[lang]);
    texts[lang] = buf ? normalize(pdfText(buf)) : '';
  }
  const hits = [];
  for (const p of phrases) {
    const text = texts[p.lang];
    if (!text) continue;
    const count = text.split(p.needle).length - 1;
    if (count) hits.push({ rule: p.rule, lang: p.lang, phrase: p.phrase, count });
  }
  return {
    year,
    issue,
    urls: { ar: joUrls(year, issue).ar.replace(BASE, 'https://www.joradp.dz/FTP'), fr: urls.fr.replace(BASE, 'https://www.joradp.dz/FTP') },
    searchable: { fr: texts.fr.length > 50, ar: texts.ar.length > 50 },
    hits,
  };
}

function issueMarkdown(r) {
  const rules = [...new Set(r.hits.map((h) => h.rule))];
  const lines = [
    `Journal officiel ${r.year} nº ${r.issue} may affect: ${rules.join(', ')}`,
    `A new issue of the Journal officiel mentions phrases watched by ${rules.length === 1 ? 'a rule' : 'these rules'}.`,
    '',
    `- Arabic edition (authoritative): ${r.urls.ar}`,
    `- French edition: ${r.urls.fr}`,
    '',
    '| Rule | Phrase | Edition | Times |',
    '|---|---|---|---|',
    ...r.hits.map((h) => `| \`${h.rule}\` | ${h.phrase} | ${h.lang} | ${h.count} |`),
    '',
    'To do:',
    '- [ ] Open the issue and find the texts that mention these phrases',
    '- [ ] Decide whether a rule changes; if it does, add the source and a new rule version (see CONTRIBUTING.md)',
    '- [ ] Close this issue with a short note either way',
  ];
  return lines.join('\n') + '\n';
}

// ---------- Main ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

if (argv.includes('--bootstrap')) {
  let year = thisYear;
  let issue = await latestIssue(year);
  if (!issue) {
    year -= 1;
    issue = await latestIssue(year);
  }
  const result = { mode: 'bootstrap', last_seen: issue ? { year, issue } : null, issues: [] };
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(issue ? `Latest issue: ${year} nº ${issue}. Later runs will scan from there.` : 'No issue found.');
  process.exit(0);
}

const after = opt('after');
if (!/^\d{4}-\d+$/.test(after ?? '')) {
  console.error('Use --after YYYY-N (last issue already seen) or --bootstrap.');
  process.exit(2);
}
let [year, issue] = after.split('-').map(Number);
const phrases = watchList();
const scanned = [];
while (scanned.length < MAX) {
  if (await exists(year, issue + 1)) {
    issue += 1;
    const r = await scan(year, issue, phrases);
    scanned.push(r);
    console.log(`${year} nº ${issue}: ${r.hits.length ? r.hits.map((h) => `${h.rule} ("${h.phrase}" ×${h.count})`).join(', ') : 'no watched phrase'}${r.searchable.fr || r.searchable.ar ? '' : ' (no searchable text)'}`);
  } else if (year < thisYear && (await exists(year + 1, 1))) {
    year += 1;
    issue = 0;
  } else break;
}

for (const r of scanned.filter((s) => s.hits.length)) writeFileSync(join(OUT, `issue-${r.year}-${pad(r.issue)}.md`), issueMarkdown(r));
const result = { mode: 'scan', last_seen: { year, issue }, issues: scanned };
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`Scanned ${scanned.length} new issue(s); ${scanned.filter((s) => s.hits.length).length} with matches. Last seen: ${year} nº ${issue}.`);
