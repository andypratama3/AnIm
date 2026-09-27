---
route: /kanban
viewport: desktop (1512×950) + mobile (390×844)
mode: live bridge over the local transport, or degraded (503 banner when the bridge is off)
---
# Screenshot reference

This file records what the audit (`scripts/ui-audit.mjs`) verifies for this route.
The actual PNG capture runs in CI (`AUDIT_INTERACTIONS=1`) over a live browser session.

## Verified assertions
- `document.title` unique per route (not shared default "Overview · AnIm").
- `h1` present and contains "AnIm".
- No horizontal overflow (`overflowX == 0`).
- No clipped fixed-height containers (`clipped.length == 0`).
- No wide elements (`wide.length == 0`).
- No console errors (`consoleErrors.length == 0`).
- Interaction assertions (CI only): see `INTERACTIONS` in `scripts/ui-audit.mjs`.
