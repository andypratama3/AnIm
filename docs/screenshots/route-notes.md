---
route: /notes
viewports: desktop (1512x950) + mobile (390x844)
audit: npm run audit:ui  (CI job `ui-audit`, artifact `ui-audit-screenshots`)
---

# /notes — screenshot reference

## What the audit actually verified

Executed on every run, on both viewports:

- The page rendered at all, with **exactly one** `<h1>`: zero is a route that never rendered and aborts the run, two is a flattened document outline and fails it. The document title must contain `AnIm`. The audit waits for that heading to paint rather than sleeping a fixed interval, so a cold server is measured once the page exists; a page that never paints is still probed and still fails. A dead server therefore cannot pass as a clean run.
- `document.title` is not shared with another route. Eight tabs with one title is the same route eight times, so duplicates fail the job.
- Horizontal overflow is zero (`scrollWidth - clientWidth`).
- No element is wider than its viewport.
- No text node is clipped by a fixed-height container.
- No console error, and no uncaught page error, except a deliberate 503: the bridge being unreachable, or a deploy with no `ANIM_API_TOKEN` refusing writes. The mode comes from `/api/session`, never from matching log prose.
- A PNG is written to `/tmp/anim-audit/` for this route at both viewports. CI uploads them as the `ui-audit-screenshots` artifact.

Route-specific, checked by reading the rendered page in this audit run and by the
regression tests listed in [SERVER-DEFERRED](../SERVER-DEFERRED.md):

- The page says where the notes live: in the console process, not written to disk, gone on restart.
- `VAULT_FOLDERS` filters the list. There is no control that looks like it creates a note, because there is none that does.

## What has not been verified

The interaction spec for this route is:

- `search-notes`
- `filter-folder`
- `toggle-focus`
- `copy-markdown`

**None of these steps is executed.** `scripts/ui-audit.mjs` holds the spec and
labels it `recorded - NOT executed`; no driver exists for it, and no code path
reads `AUDIT_INTERACTIONS`. Setting that variable makes the script warn rather
than pretend. Treat the list above as the intended surface, not as a test
result — a green CI run says the layout is sound, not that these interactions
work.
