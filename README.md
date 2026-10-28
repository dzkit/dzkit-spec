# dzkit-spec

**Algerian rules as data.** Tax, payroll, wilayas, licence plates, phone numbers and identifiers, written as plain YAML and JSON that any language can read. Every rule says **when it applies** and **which official text makes it law**, and comes with test cases that every implementation must pass.

This is the shared source for the dzkit packages ([dzkit-js](https://github.com/dzkit/dzkit-js) today, PHP, Python and others later), but you can use it directly in any project.

**Why you can trust it:** every value cites the text that makes it law, ranked by the hierarchy of Algerian legal texts; every source says how closely it was checked; a public [trust report](TRUST.md) shows the evidence for each rule and the work still open; and the Journal officiel is watched every week for changes. The rules for changing anything are in [GOVERNANCE.md](GOVERNANCE.md).

## What's inside

| Rule | Id |
|---|---|
| 69 wilayas, codes and French/Arabic names | `administrative.wilayas` |
| Licence plate format, categories, codes by date | `vehicles.plates` |
| Phone numbering plan and allocated blocks | `telecom.phone` |
| CCP key and RIP key | `banking.ccp-rip` |
| NIF and NIS formats | `business.nif-nis` |
| IRG on salaries (scale, abatements, smoothing) | `payroll.irg-salary` |
| CNAS contribution rates | `payroll.cnas` |
| Minimum wage (SNMG) since 2020 | `payroll.minimum-wage` |
| Words for amounts in French and Arabic | `language.amount-in-words` |

The current trust level of each rule, and its sources, are in [TRUST.md](TRUST.md).

## Use it from any language

Everything is bundled into two JSON files in [`dist/`](dist):

- **`dist/dzkit-spec.json`**: all sources and rules
- **`dist/vectors.json`**: all test cases

Fetch them from a tagged release so your app doesn't change under you:

```
https://raw.githubusercontent.com/dzkit/dzkit-spec/v0.2.0/dist/dzkit-spec.json
```

or copy them into your project. They're small and change only when a rule changes. Check `schema_version` (currently 2): it only changes when the format breaks.

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

## How trust works

**1. The hierarchy of texts.** [`hierarchy.yaml`](hierarchy.yaml) lists the kinds of Algerian legal texts from the most to the least authoritative: Constitution, ratified treaties, organic laws, laws and ordinances, presidential then executive decrees, arrêtés and regulator decisions, then official publications (consolidated codes, regulator pages, circulars), then secondary sources (references, datasets, press). Each source has one of these kinds, so the bundle knows its `rank` and `authority`. When two sources disagree, the higher one wins; within one text, the Arabic edition of the Journal officiel wins.

**2. Verification levels.** Each source records how closely it was checked: `original` (the official text itself was read, such as the Journal officiel PDF or the regulator's own page), `copy` (a faithful copy hosted elsewhere) or `report` (only press or guides). Nothing claims more than was checked.

**3. A trust level for every rule.** The build combines the two into one level per rule version, included in the bundle as `trust` and published in [TRUST.md](TRUST.md):

| Level | Meaning |
|---|---|
| Checked against the official text | A binding text or official publication was read in its official form or a faithful copy |
| Official text cited, checked through reliable reports | The binding text is identified, but its official PDF still needs opening |
| No official text; confirmed by real examples | Nothing official is published; real documents match |
| Standard convention | Language or formatting conventions, with a reference |

TRUST.md also lists the work still open, such as official texts to open or Journal officiel issues to find, so anyone can help raise the level of a rule.

**4. Freshness.** Each rule has a review cadence (`review.every_months`). Every week, one workflow scans new Journal officiel issues for the phrases each rule watches and opens an issue when one may affect a rule; another checks every source link and every review date.

## Every rule links to its source

`sources.yaml` lists each text: its kind and number, date, Journal officiel issue, articles, a short quote, what it amends, and how it was verified. For Journal officiel texts, the bundle adds links to the official PDFs on joradp.dz, in Arabic (the legally authoritative edition) and French:

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
  "articles": ["31"],
  "verification": { "read": "copy", "checked": "2026-10-28" },
  "authority": "legal-text",
  "rank": 4
}
```

Rule versions can say exactly which article supports which value:

```yaml
sources:
  - { source: loi-21-16, articles: ['31'], supports: 'scale, exemption, abatement and smoothing formulas' }
  - { source: dgi-bareme-irg, supports: rounding and reference amounts }
```

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
hierarchy.yaml          kinds of legal texts, ranked
sources.yaml            every text a rule relies on, and how it was verified
rules/<area>/*.yaml     one file per rule, with its dated versions
vectors/*.json          test cases, one file per operation
schema/                 JSON Schemas for sources, rules and test cases
scripts/build.mjs       validates everything, writes dist/ and TRUST.md
scripts/check-links.mjs checks every source link
scripts/watch-jo.mjs    scans new Journal officiel issues for watched phrases
dist/, TRUST.md         generated (don't edit by hand)
```

## Working on it

```bash
npm install
npm run build    # validate and regenerate dist/ and TRUST.md
npm run check    # what CI runs: validate and check the generated files are up to date
npm run links    # check every source link (needs network)
```

The build checks the files against the schemas, and also that every source and kind exists, that rules marked official cite a legal text or official publication, that versions don't overlap, that wilaya codes run without gaps, that IRG brackets increase, and that CNAS branches add up.

## Sources

Every rule comes from an official text, ranked by the hierarchy of Algerian legal texts. See the [trust report](TRUST.md) for the evidence behind each rule and the work still open.

## Not legal advice

This is reference material, maintained with care and linked to its sources so you can check every value. It is not legal or tax advice. When a value matters, check it against the official text, and please [open an issue](https://github.com/dzkit/dzkit-spec/issues) if you find a difference.

## Contributing

Issues and pull requests are welcome in العربية, Français or English. See [CONTRIBUTING.md](CONTRIBUTING.md) and the project's [governance](GOVERNANCE.md).

Especially useful:

- Opening an official text listed in the [trust report](TRUST.md) and confirming the passage
- Reporting a rule change from a new text in the Journal officiel
- Adding a rule that Algerian apps need, with its official source

## License

[MIT](LICENSE) © Siroukane and the dzkit contributors. Official texts belong to their publishers.
