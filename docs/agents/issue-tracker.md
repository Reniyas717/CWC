# Issue tracker: Local Markdown

Tickets and specs live as Markdown files in `.scratch/`.

## Conventions

- Use one directory per feature: `.scratch/<feature-slug>/`.
- Write the spec to `.scratch/<feature-slug>/spec.md`.
- Write one ticket per file at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Record triage state in a `Status:` line near the top of each ticket; see [triage-labels.md](triage-labels.md).
- Append comments and conversation history under `## Comments`.

When asked to publish to the issue tracker, create the appropriate local file. When asked to fetch a ticket, read its referenced path.

## Wayfinding

- Use `.scratch/<effort>/map.md` as the map and numbered files in its `issues/` directory as child tickets.
- Record the ticket type in a `Type:` line and the wayfinding state (`claimed` or `resolved`) in a `Status:` line. Record dependencies in a `Blocked by: NN, NN` line.
- Find the first numbered open, unblocked, unclaimed ticket. A dependency is cleared when its ticket is resolved.
- Claim a ticket by setting `Status: claimed` and saving it before starting work.
- Resolve it by adding an `## Answer`, setting `Status: resolved`, and appending a summary and link to the map's Decisions-so-far.
