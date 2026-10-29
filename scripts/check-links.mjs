// Checks that every link in sources.yaml (including the generated Journal officiel
// PDF links) still answers. Run weekly by .github/workflows/health.yml.
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

/**
 * Why a request failed, in a few words. Node's fetch only says "fetch failed"; the
 * reason is in `cause`: a certificate problem (common on .dz sites that don't send
 * their full certificate chain), a refused or reset connection, a timeout, a DNS error.
 */
function reason(e) {
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return 'timeout (30 s)';
  const c = e?.cause;
  const code = c?.code ?? c?.errno;
  const known = {
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'certificate chain incomplete on the server',
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'certificate chain incomplete on the server',
    CERT_HAS_EXPIRED: 'certificate expired',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'self-signed certificate',
    ERR_TLS_CERT_ALTNAME_INVALID: 'certificate is for another domain',
    ENOTFOUND: 'domain not found (DNS)',
    ECONNREFUSED: 'connection refused',
    ECONNRESET: 'connection reset by the server',
    ETIMEDOUT: 'connection timed out',
    EHOSTUNREACH: 'host unreachable',
    UND_ERR_CONNECT_TIMEOUT: 'connection timed out',
    UND_ERR_SOCKET: 'connection closed by the server',
  };
  if (code) return `${code}${known[code] ? `: ${known[code]}` : ''}`;
  return c?.message ?? e?.message ?? String(e);
}

async function attempt(url, method) {
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000),
      headers: { 'user-agent': 'dzkit-spec link check (+https://github.com/dzkit/dzkit-spec)' },
    });
    return { ok: res.ok, status: `HTTP ${res.status}`, type: res.headers.get('content-type') ?? '' };
  } catch (e) {
    return { ok: false, status: reason(e) };
  }
}

/** HEAD first (cheap), then GET; one more try after a pause, as official sites are often slow. */
async function probe(url) {
  let last;
  for (let round = 0; round < 2; round++) {
    if (round) await new Promise((r) => setTimeout(r, 5_000));
    for (const method of ['HEAD', 'GET']) {
      last = await attempt(url, method);
      if (last.ok) return last;
    }
  }
  return last;
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
