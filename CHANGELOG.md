# Changelog

Every data change is listed with its source. See [GOVERNANCE.md](GOVERNANCE.md) for how versions are numbered.

## 0.4.0 — 2026-10-28

The complete contract: every function a dzkit package offers now has a definition and test cases, so a port in any language can be written from this repository alone.

### Operations
- New operations in OPERATIONS.md, each with test cases: `rip.format`, `ccp.validate`, `phone.validate` (by type, and allocated blocks only), `phone.format` (national and international), `plate.format`, `irg.breakdown` (every step, for payslips) and `salary.net-to-gross` (smallest gross to the centime, including around the 30 000 DA dip).
- `plate.parse` returns `category_name`; `wilaya.lookup` returns `parent` and `valid_from` for wilayas created after 1984.
- OPERATIONS.md opens with the list of the 17 operations every implementation provides.
- `irg.breakdown` defines `smoothing` as the second abatement only, rounded to the centime, and 0 when no smoothing formula applies.
- An unknown phone `type` or `style` is the error `invalid-option`.

### Test cases
- 339 cases, up from 273. Breakdown and net-to-gross values come from the exact reference computation; net-to-gross was found by walking up from below, a different method from dzkit-js's search, and both agree.

### Documentation
- **PORTING.md**: how to write a dzkit package in another language: names, using the spec, the test runner, errors, exact arithmetic per language, text and dates, framework packages, the repository checklist and how to publish without tokens on npm, PyPI, pub.dev and Packagist.

### Tooling
- GitHub Actions pinned to commits in every workflow. The watcher's temporary folder is ignored by git.

## 0.3.0 — 2026-10-28

The behaviour contract. Implementations must be updated: `schema_version` is now 3, and the rule `business.nif-nis` is split in two.

### Format
- **OPERATIONS.md** defines what every implementation must do for each operation: accepted inputs and separators, Arabic-Indic digits (٠–٩ and ۰–۹), rejection versus error, rounding to the centime (half up on the amount as written), and how dates select a rule version.
- Test cases can now expect an error: a case has either `expected` (`null` = rejected) or `error` (`invalid-amount`, `invalid-option` or `no-rule-for-date`). `schema_version` is 3.
- The build fails when two versions of a rule leave a gap, when a wilaya starts before its rule version, or before the wilaya it was created from.

### Data
- `business.nif-nis` is split into **`business.nif`** (status `confirmed`: the lengths come from references, no legal text found yet) and **`business.nis`** (status `official`, décret exécutif n° 97-396). The trust report no longer gives the NIF the decree's level.
- `administrative.wilayas` now applies from 1984-02-04 (loi n° 84-09). Codes 49 to 58 carry `valid_from: 2019-12-11` and their `parent`. New sources: loi n° 19-12 (wilayas 49–58) and décret présidentiel n° 21-117 (JO 2021 nº 22, their names). A lookup before 1984 or before a wilaya existed is rejected.
- `vehicles.plates`: the first version has no start date, so plates issued before 2023 are covered.
- `payroll.irg-salary`: the result of the progressive scale is rounded half up to the centime before the abatements; the only other rounding is the final one. Salaries with centimes differed by 0.1 DA in about 3.7 % of cases depending on the reading.
- `language.amount-in-words`: the Arabic construct form (مائتا دينار، ألفا دينار، خمسون ألف دينار) and the limits (0 to 999 999 999 999.99 DA) are written down.

### Test cases
- 273 cases, up from 144: every IRG bracket and abatement boundary, retired and disabled limits, gross-to-net with centimes and around the 30 000 DA threshold, Arabic construct forms, rounding to the centime, limits of amounts in words, Arabic-Indic digits and separators for every identifier, non-text input, wilayas by date, plates around 1 January 2027, and every error code.
- IRG and gross-to-net values come from an exact (rational-arithmetic) computation of the rules, independent of any implementation.

### Tooling
- The Journal officiel watch fails when joradp.dz can't be reached, instead of reporting no new issue; checks that the last issue seen still exists; reads only the first kilobyte to check that an issue exists; matches Arabic text extracted as presentation forms or in reverse order; and opens an issue when an issue's text can't be read.
- Both weekly workflows re-enable their schedules, which GitHub turns off after 60 days without a commit. The health check closes its issues once the problem is fixed.
- GOVERNANCE.md: one versioning rule shared by every dzkit package.

## 0.2.0 — 2026-10-28

Trust model. **Breaking for early readers of 0.1.0:** `schema_version` is now 2.

### Format
- `hierarchy.yaml`: the kinds of Algerian legal texts, from the Constitution to circulars, each with a rank and an authority (`legal-text`, `official-publication` or `secondary`). Sources now use these kinds; the bundle includes the hierarchy and each source's computed `authority` and `rank`.
- Sources: `checked` and `read_via` are replaced by `verification: { read, via, checked }`, where `read` is `original`, `copy` or `report`. New `amends` field.
- Rules: required `review: { every_months, triggers }` and optional `watch` phrases for the Journal officiel. Citations can name the articles and the part of the data they support.
- Each rule version in the bundle carries a computed `trust` (level, strongest source, last checked, review due).
- The build fails when a rule marked official cites no legal text or official publication.

### Data
- New sources: loi n° 84-09 (territorial organisation) and décret n° 84-79 (names of the wilayas), the base texts amended in 2026.
- French spelling of amounts now cites the Académie française; Arabic counted-noun rules cite a published grammar guide.
- Verification levels recorded for every source: 2 rules are checked against the official text (IRG, phone numbering), 5 through reliable reports. TRUST.md lists the texts still to open.

### Tooling
- TRUST.md, generated by the build.
- Weekly Journal officiel watch, opening an issue when a new issue mentions a watched phrase.
- Weekly health check: source links and overdue reviews, one issue per problem.
- GOVERNANCE.md, issue templates.

## 0.1.0 — 2026-10-28

First version: wilayas, licence plates, phone numbering, CCP/RIP, NIF/NIS, IRG on salaries, CNAS, minimum wage and amounts in words, with 26 sources and 144 test cases.
