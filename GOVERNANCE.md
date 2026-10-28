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

dzkit-spec follows [semantic versioning](https://semver.org) for its data:

- **Major** (1.0 → 2.0): a breaking change to the format (`schema_version` changes). Implementations must be updated.
- **Minor** (0.2 → 0.3): new rules, new rule versions, new sources or test cases. Implementations keep working and should update.
- **Patch** (0.2.0 → 0.2.1): corrections of wrong values, wording, links.

Every release is tagged (`vX.Y.Z`) and listed in [CHANGELOG.md](CHANGELOG.md), with each data change and its source. Implementations should pin a tag rather than follow `main`.

## Roles

- **Maintainers** review and merge pull requests, run releases and answer watch and health issues. A maintainer must not approve their own pull request for an official rule.
- **Contributors** report changes, add sources and test cases, and open official texts to raise verification levels. Contributors who make several good changes are invited to become maintainers.

Discussions happen in GitHub issues, in العربية, Français or English.

## Limits

dzkit-spec is reference data, not legal or tax advice. It is maintained with care and every value links to its source so anyone can check it. If a value matters for a decision, check the official text, and report any difference in an issue.
