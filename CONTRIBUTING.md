# Contributing

Thanks for helping keep these rules right. Issues and pull requests are welcome in العربية, Français or English.

## Report a rule change

A finance law, decree or regulator changed something? Open an issue with:
- what changed, and from which date
- the official text: type, number, date, and Journal officiel issue if you have it
- example values, if the text gives any

You don't need to edit any file.

## Change a rule

1. **Add the source** to `sources.yaml` first: `id`, `kind` (one of [hierarchy.yaml](hierarchy.yaml)), `number`, `date`, `title`, `jo: { year, issue }` for Journal officiel texts, the `articles`, a short `quote`, `amends` if it changes another source, and `verification`:
   - `read: original` only if you opened the official text itself (the Journal officiel PDF, or the issuer's own page)
   - `read: copy` for a faithful copy hosted elsewhere, `read: report` for press or guides, listing those pages under `via`
   - `checked`: today's date
2. **Never edit a past version.** End the current version (`valid_to: <day before>`) and add a new one with `valid_from`. Old values must stay, so apps can recompute old documents.
3. **Add test cases** in `vectors/` with the values from the source, and set each case's `source`.
4. Run `npm run build` and commit the regenerated `dist/` and `TRUST.md`.

## Raise a rule's trust level

[TRUST.md](TRUST.md) lists official texts that were only read through reports. Open one (the Arabic PDF is authoritative), check the cited passage, and either open an issue with the "I checked an official text" form, or set `verification.read: original` and today's `checked` date in a pull request. This is one of the most useful contributions.

## Add a rule

- Put it in `rules/<area>/<name>.yaml`; its `id` must be `<area>.<name>`.
- Set `review.every_months` (12 for anything a finance law can change) and `watch` phrases that would appear in a Journal officiel text changing the rule. Pick precise phrases: "wilaya" alone appears in almost every issue.
- Describe the shape of `data` in the rule's `description`, in plain words, so someone porting it to another language understands it without reading code.
- Add a test-case file for each operation, named `<operation>.json`.

## Change what an operation does

[OPERATIONS.md](OPERATIONS.md) says what every implementation must do: accepted inputs, rejection or error, rounding, dates. When you change it, add or change test cases for every point, in the same pull request. A change that makes an existing case give a different result is a minor version before 1.0 (see GOVERNANCE.md), because every implementation must follow it.

## Status levels

- `official`: the value is in an official text you can link to
- `confirmed`: nothing official is published, but the value matches real examples (say which in the sources)
- `convention`: standard practice with no single reference

When in doubt, use the lower level and explain in `notes`.

## Rules of thumb

- Every value needs a source. If you can't find one, open an issue instead.
- Keep quotes short: a sentence, not a page.
- Never commit personal data: anonymise real examples (keep only what the rule needs).

## Releasing (maintainers)

1. In a pull request, update `version` in `package.json`, add a `## X.Y.Z — date` section to `CHANGELOG.md` and run `npm run build`.
2. Once it's merged, create a release on GitHub with the tag `vX.Y.Z`, targeting `main`, and publish it.
3. The release workflow checks the tag, `package.json` and `CHANGELOG.md` agree, validates everything, and attaches `dzkit-spec.json`, `vectors.json` and `SHA256SUMS` to the release.

If it fails, fix the cause in a pull request, then run the workflow again from the Actions tab with the tag. Use a new patch version for any data change: a published version never changes.
