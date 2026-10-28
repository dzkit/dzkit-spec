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
// Writes <out>/result.json and, for each issue with matches or whose text can't be
// read, <out>/issue-YYYY-NNN.md (first line is the title, the rest the body).
//
// Fails (exit 1) when joradp.dz can't be reached, instead of reporting "no new issue":
// a watch that silently sees nothing is worse than one that fails.
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

// Lower case, no accents, single spaces, straight apostrophes. NFKC first turns the
// Arabic presentation forms that PDF text extraction often produces (U+FB50–U+FEFF)
// back into ordinary letters; then tatweel and short vowels are removed.
export const normalize = (text) =>
  text
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064b-\u0655\u0640]/g, '') // Arabic short vowels, hamza and madda marks, tatweel (so أ إ آ match ا)
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, ' ');

// Some PDFs store Arabic in visual order, so the extracted text reads backwards. The
// raw text is reversed before normalizing, so ligatures such as لا expand the right way.
const reversed = (s) => [...s].reverse().join('');
export const searchableForms = (raw, lang) => (lang === 'ar' ? [normalize(raw), normalize(reversed(raw))] : [normalize(raw)]);
export const countPhrase = (forms, needle) => Math.max(...forms.map((t) => t.split(needle).length - 1));

const HEADERS = { 'user-agent': 'dzkit-spec Journal officiel watch (+https://github.com/dzkit/dzkit-spec)' };

export class Unreachable extends Error {}

/**
 * Fetches a URL. Returns the PDF, or null when the server says it doesn't exist (404,
 * or a page that isn't a PDF). Throws Unreachable when the server can't be reached or
 * fails (network error, timeout, 5xx), after retries, so a dead site is never mistaken
 * for "no new issue".
 */
async function get(url, { range } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        headers: range ? { ...HEADERS, range: `bytes=0-${range - 1}` } : HEADERS,
      });
      if (res.status === 404 || res.status === 410) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.subarray(0, 4).toString() === '%PDF' ? buf : null;
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }
  }
  throw new Unreachable(`${url}: ${lastError?.message ?? lastError}`);
}

const download = (url) => get(url);

/** Whether an issue exists, reading only its first kilobyte. */
async function exists(year, issue) {
  const urls = joUrls(year, issue);
  return (await get(urls.fr, { range: 1024 })) !== null || (await get(urls.ar, { range: 1024 })) !== null;
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
    texts[lang] = buf ? searchableForms(pdfText(buf), lang) : [''];
  }
  const hits = [];
  for (const p of phrases) {
    const forms = texts[p.lang];
    if (!forms[0]) continue;
    const count = countPhrase(forms, p.needle);
    if (count) hits.push({ rule: p.rule, lang: p.lang, phrase: p.phrase, count });
  }
  return {
    year,
    issue,
    urls: { ar: joUrls(year, issue).ar.replace(BASE, 'https://www.joradp.dz/FTP'), fr: urls.fr.replace(BASE, 'https://www.joradp.dz/FTP') },
    searchable: { fr: texts.fr[0].length > 50, ar: texts.ar[0].length > 50 },
    hits,
  };
}

function unreadableMarkdown(r) {
  return [
    `Journal officiel ${r.year} nº ${r.issue}: text could not be read automatically`,
    'The watch could not extract searchable text from either edition of this issue (scanned pages, or a PDF it could not open), so it could not look for the watched phrases.',
    '',
    `- Arabic edition (authoritative): ${r.urls.ar}`,
    `- French edition: ${r.urls.fr}`,
    '',
    'To do:',
    "- [ ] Skim the table of contents for texts that could affect a rule (finance law, wilayas, SNMG, social security, numbering, plates)",
    '- [ ] Close this issue with a short note',
  ].join('\n') + '\n';
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

const onFatal = (e) => {
  if (e instanceof Unreachable) {
    console.error(`✗ joradp.dz could not be reached, so nothing was scanned: ${e.message}`);
    console.error('  The position is unchanged; the next run will try again.');
  } else console.error(e);
  process.exit(1);
};
process.on('unhandledRejection', onFatal);
process.on('uncaughtException', onFatal);

if (argv.includes('--bootstrap')) {
  let year = thisYear;
  let issue = await latestIssue(year);
  if (!issue) {
    year -= 1;
    issue = await latestIssue(year);
  }
  if (!issue) {
    console.error(`✗ No Journal officiel issue found for ${thisYear} or ${thisYear - 1}: the site's addresses may have changed.`);
    process.exit(1);
  }
  const result = { mode: 'bootstrap', last_seen: { year, issue }, issues: [] };
  writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(`Latest issue: ${year} nº ${issue}. Later runs will scan from there.`);
  process.exit(0);
}

const after = opt('after');
if (!/^\d{4}-\d+$/.test(after ?? '')) {
  console.error('Use --after YYYY-N (last issue already seen) or --bootstrap.');
  process.exit(2);
}
let [year, issue] = after.split('-').map(Number);
// The last issue seen must still be there; if not, the site or its addresses changed.
if (!(await exists(year, issue))) {
  console.error(`✗ Journal officiel ${year} nº ${issue}, the last issue scanned, is no longer found: the site's addresses may have changed.`);
  process.exit(1);
}
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

for (const r of scanned) {
  const file = join(OUT, `issue-${r.year}-${pad(r.issue)}.md`);
  if (r.hits.length) writeFileSync(file, issueMarkdown(r));
  else if (!r.searchable.fr && !r.searchable.ar) writeFileSync(file, unreadableMarkdown(r));
}
const result = { mode: 'scan', last_seen: { year, issue }, issues: scanned };
writeFileSync(join(OUT, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`Scanned ${scanned.length} new issue(s); ${scanned.filter((s) => s.hits.length).length} with matches. Last seen: ${year} nº ${issue}.`);
