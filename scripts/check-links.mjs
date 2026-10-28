// Checks that every link in sources.yaml (including the generated Journal officiel
// PDF links) still answers. Run weekly by .github/workflows/links.yml.
// Exits with 1 and lists the broken links when any fails.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(root, 'dist/dzkit-spec.json'), 'utf8'));

const links = [];
for (const s of spec.sources) {
  if (s.url) links.push([s.id, 'url', s.url]);
  if (s.jo) {
    links.push([s.id, 'jo-ar', s.jo.urls.ar]);
    links.push([s.id, 'jo-fr', s.jo.urls.fr]);
  }
}

async function probe(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
        headers: { 'user-agent': 'dzkit-spec link check (+https://github.com/dzkit/dzkit-spec)' },
      });
      if (res.ok) return { ok: true, status: res.status, type: res.headers.get('content-type') ?? '' };
      if (method === 'GET') return { ok: false, status: res.status };
    } catch (e) {
      if (method === 'GET') return { ok: false, status: e.name };
    }
  }
}

const broken = [];
for (const [id, kind, url] of links) {
  const r = await probe(url);
  const pdfExpected = kind.startsWith('jo-');
  const ok = r.ok && (!pdfExpected || r.type.includes('pdf'));
  console.log(`${ok ? '✓' : '✗'} ${id} ${kind} ${r.status} ${url}`);
  if (!ok) broken.push(`${id} (${kind}): ${url} → ${r.status}${pdfExpected && r.ok ? ' (not a PDF)' : ''}`);
}

if (broken.length) {
  console.error(`\n${broken.length} broken link(s):\n  ${broken.join('\n  ')}`);
  process.exit(1);
}
console.log(`\nAll ${links.length} links answer.`);
