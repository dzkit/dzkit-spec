# Governance

How dzkit-spec decides what is true, how it changes, and how you can rely on it.

## Principles

1. **Every value has a source.** No rule, version or test value without a source in `sources.yaml`. If no source can be found, the value doesn't go in.
2. **The law decides, in order.** When sources disagree, the higher one in [`hierarchy.yaml`](hierarchy.yaml) wins: the Constitution, then ratified treaties, organic laws, laws and ordinances, decrees, arrêtés, and finally official publications and circulars. Within one text, the **Arabic edition of the Journal officiel** is authoritative.
3. **Say how sure we are.** Each version has a *status* (official, confirmed by examples, or convention) and each source a *verification level* (read in the original, in a copy, or only through reports). The build turns these into a trust level for every rule, published in [TRUST.md](TRUST.md). We never claim more than we checked.
4. **History is kept.** A rule that changes gets a new version with dates; the old version stays, so apps can recompute old documents. Past versions are edited only to fix a mistake, never to apply a later change.
5. **Identifiers are permanent.** Rule ids, source ids and test-case operation names never change meaning and are never reused. A rule that disappears is ended with `valid_to`, not deleted.

## How a change is accepted

| Change | Needs |
|---|---|
| New source, rule or version marked **official** | The source in `sources.yaml` with its Journal officiel issue when one exists, test cases with values from the source, and a review by a maintainer who **opened the cited text** |
| Setting a source to `read: original` | The reviewer opened the official text itself (Journal officiel PDF or the issuer's own page) and checked the cited passage |
| **Confirmed** or **convention** rules | At least two independent examples or references, and a maintainer review |
| Fixing a wrong value | An issue or pull request showing the source of the right value; the fix is listed in the changelog as a correction |
| Schema changes | Discussion in an issue first, because every implementation depends on the format |

All changes go through pull requests, and CI must pass: the build validates every file against the schemas and checks the rules for consistency.

## Keeping it current

- **Journal officiel watch:** every week a workflow scans the new issues of the Journal officiel for the phrases each rule watches, and opens an issue when one may affect a rule.
- **Health check:** every week a workflow checks that every source link still answers and that no rule is past its review date (`review.every_months` in each rule).
- **Yearly:** after each finance law (loi de finances), maintainers review every payroll and tax rule, even when the watch reported nothing.

When a text changes a rule, the goal is to publish the new version **within two weeks** of its publication in the Journal officiel.

## Versions of this repository

dzkit-spec follows [semantic versioning](https://semver.org), with the same rule as every dzkit package: **could this change make an implementation give a different result, or stop working?** If yes, it's a minor version before 1.0 (a major one after); if no, a patch.

| Change | Before 1.0 | From 1.0 |
|---|---|---|
| Corrected value (it didn't match its source), wording, links, sources, trust levels | patch | patch |
| New rule, or new test cases for behaviour already in [OPERATIONS.md](OPERATIONS.md) | patch | minor |
| New rule version (a new text changes results from a date) | minor | major |
| New or changed behaviour in OPERATIONS.md | minor | major |
| Format change (`schema_version` changes) | minor | major |

Every release is tagged (`vX.Y.Z`) and listed in [CHANGELOG.md](CHANGELOG.md), with each data change and its source. Implementations should pin a tag rather than follow `main`.

## Roles

- **Maintainers** review and merge pull requests, run releases and answer watch and health issues. A maintainer must not approve their own pull request for an official rule.
- **Contributors** report changes, add sources and test cases, and open official texts to raise verification levels. Contributors who make several good changes are invited to become maintainers.

Discussions happen in GitHub issues, in العربية, Français or English.

## Limits

dzkit-spec is reference data, not legal or tax advice. It is maintained with care and every value links to its source so anyone can check it. If a value matters for a decision, check the official text, and report any difference in an issue.
