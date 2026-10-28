# Contributing

Thanks for helping keep these rules right. Issues and pull requests are welcome in العربية, Français or English.

## Report a rule change

A finance law, decree or regulator changed something? Open an issue with:
- what changed, and from which date
- the official text: type, number, date, and Journal officiel issue if you have it
- example values, if the text gives any

You don't need to edit any file.

## Change a rule

1. **Add the source** to `sources.yaml` first: `id`, `kind`, `number`, `date`, `title`, `jo: { year, issue }` for Journal officiel texts, the `articles`, a short `quote`, and `checked` (today's date). If you read it through another page, list that page under `read_via`.
2. **Never edit a past version.** End the current version (`valid_to: <day before>`) and add a new one with `valid_from`. Old values must stay, so apps can recompute old documents.
3. **Add test cases** in `vectors/` with the values from the source, and set each case's `source`.
4. Run `npm run build` and commit the regenerated `dist/`.

## Add a rule

- Put it in `rules/<area>/<name>.yaml`; its `id` must be `<area>.<name>`.
- Describe the shape of `data` in the rule's `description`, in plain words, so someone porting it to another language understands it without reading code.
- Add a test-case file for each operation, named `<operation>.json`.

## Status levels

- `official`: the value is in an official text you can link to
- `confirmed`: nothing official is published, but the value matches real examples (say which in the sources)
- `convention`: standard practice with no single reference

When in doubt, use the lower level and explain in `notes`.

## Rules of thumb

- Every value needs a source. If you can't find one, open an issue instead.
- Keep quotes short: a sentence, not a page.
- Never commit personal data: anonymise real examples (keep only what the rule needs).
