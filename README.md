# dzkit-spec

**Algerian rules as data.** Tax, payroll, wilayas, licence plates, phone numbers and identifiers, written as plain YAML and JSON that any language can read. Every rule says **when it applies** and **which official text makes it law**, and comes with test cases that every implementation must pass.

This is the shared source for the dzkit packages ([dzkit-js](https://github.com/dzkit/dzkit-js) today, PHP, Python and others later), but you can use it directly in any project.

## What's inside

| Rule | Id | Status |
|---|---|---|
| 69 wilayas, codes and French/Arabic names | `administrative.wilayas` | Official |
| Licence plate format, categories, codes by date | `vehicles.plates` | Official |
| Phone numbering plan and allocated blocks | `telecom.phone` | Official |
| CCP key and RIP key | `banking.ccp-rip` | Confirmed |
| NIF and NIS formats | `business.nif-nis` | Official |
| IRG on salaries (scale, abatements, smoothing) | `payroll.irg-salary` | Official |
| CNAS contribution rates | `payroll.cnas` | Official |
| Minimum wage (SNMG) since 2020 | `payroll.minimum-wage` | Official |
| Words for amounts in French and Arabic | `language.amount-in-words` | Convention |

**Status** means: *official*, taken from or confirmed against an official text; *confirmed*, no official text is published, but real examples match; *convention*, standard practice.

## Use it from any language

Everything is bundled into two JSON files in [`dist/`](dist):

- **`dist/dzkit-spec.json`**: all sources and rules
- **`dist/vectors.json`**: all test cases

Fetch them from a tagged release so your app doesn't change under you:

```
https://raw.githubusercontent.com/dzkit/dzkit-spec/v0.1.0/dist/dzkit-spec.json
```

or copy them into your project. They're small and change only when a rule changes.

**JavaScript**
```js
const spec = await (await fetch(URL)).json();
const irg = spec.rules.find((r) => r.id === 'payroll.irg-salary');
```

**PHP**
```php
$spec = json_decode(file_get_contents($url), true);
$irg = array_values(array_filter($spec['rules'], fn ($r) => $r['id'] === 'payroll.irg-salary'))[0];
```

**Python**
```python
spec = json.load(urllib.request.urlopen(url))
irg = next(r for r in spec["rules"] if r["id"] == "payroll.irg-salary")
```

## Rules have dates

Each rule is a list of **versions**. A version applies from `valid_from` to `valid_to` (inclusive); `null` as `valid_to` means it's still in force. To apply a rule as of a given day, pick the version whose range contains that day:

```yaml
id: payroll.minimum-wage
versions:
  - valid_from: 2020-06-01
    valid_to: 2025-12-31
    sources: [decret-presidentiel-21-137]
    data: { monthly: 20000 }
  - valid_from: 2026-01-01
    valid_to: null
    sources: [decret-presidentiel-26-01]
    data: { monthly: 24000 }
```

This lets an app recompute an old payslip with the rules of its time, or reject a plate with a wilaya code that isn't issued yet. A `valid_from` of `null` means the version applied at least since its earliest source, but the exact start isn't recorded yet.

## Every rule links to its source

`sources.yaml` lists each text: its type and number, date, Journal officiel issue, articles, a short quote, the pages it was read through, and the date it was last checked. For Journal officiel texts, the bundle adds links to the official PDFs on joradp.dz, in Arabic (the legally authoritative edition) and French:

```json
{
  "id": "loi-21-16",
  "kind": "law",
  "number": "21-16",
  "title": { "fr": "Loi de finances pour 2022" },
  "jo": {
    "year": 2021, "issue": 100,
    "urls": {
      "ar": "https://www.joradp.dz/FTP/jo-arabe/2021/A2021100.pdf",
      "fr": "https://www.joradp.dz/FTP/JO-FRANCAIS/2021/F2021100.pdf"
    }
  },
  "articles": ["31"]
}
```

A weekly workflow checks that every link still answers and opens an issue when one breaks.

## Test cases: one suite for every language

`vectors/` holds inputs and expected outputs for each operation, in a language-neutral format:

```json
{
  "operation": "irg.calculate",
  "cases": [
    { "id": "salaried-32000", "input": { "taxable": 32000, "regime": "salaried", "date": "2026-10-28" },
      "expected": { "irg": 957.8 }, "source": "dgi-bareme-irg" }
  ]
}
```

An implementation maps each operation to its own function (`calculateIrg` in JS, `calculate_irg` in Python…) and runs every case. `expected: null` means the input must be rejected. Each expected value names the source it comes from. dzkit-js passes all 144 cases.

| Operation | What it checks |
|---|---|
| `rip.validate`, `rip.from-ccp` | RIP and CCP keys, including real RIP numbers |
| `phone.parse` | Types, operators, allocated blocks, rejected inputs |
| `plate.parse` | Plates before and after 1 January 2027 |
| `nif.validate`, `nis.validate` | Identifier formats |
| `irg.calculate`, `salary.gross-to-net` | The DGI's published IRG amounts |
| `words.number-fr`, `words.amount-fr`, `words.number-ar`, `words.amount-ar` | Spelling and agreement |
| `wilaya.lookup` | Names, including the 2026 wilayas |

## Repository layout

```
sources.yaml        every text a rule relies on
rules/<area>/*.yaml one file per rule, with its versions
vectors/*.json      test cases, one file per operation
schema/             JSON Schemas for the three formats above
scripts/build.mjs   validates everything and writes dist/
dist/               generated bundles (don't edit by hand)
```

## Working on it

```bash
npm install
npm run build    # validate and regenerate dist/
npm run check    # what CI runs: validate and check dist/ is up to date
npm run links    # check every source link (needs network)
```

The build checks the files against the schemas, and also that every source exists, versions don't overlap, wilaya codes run without gaps, IRG brackets increase, and CNAS branches add up.

See [CONTRIBUTING.md](CONTRIBUTING.md) to report a rule change or add a rule.

## Not legal advice

This is reference data, maintained with care and linked to its sources so you can check every value. It is not legal or tax advice. When a value matters, check it against the official text, and please [open an issue](https://github.com/dzkit/dzkit-spec/issues) if you find a difference.

## License

[MIT](LICENSE). Official texts belong to their publishers.
