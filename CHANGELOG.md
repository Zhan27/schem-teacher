# Changelog

## 0.2.0 — 2026-11-15

- Add Chinese / English interface switching, stored preference and English entry links (`?lang=en`).
- Translate lesson labels, material names, validation messages, print pages and CSV exports; keep user names and registry IDs unchanged.
- Restore the current group, slice, selected map layer and camera when reopening projects or offline lessons.
- Validate incoming projects and resources before replacing the current model; roll back failed/cancelled replanning.
- Release old WebGL resources and cancelled worker URLs; preserve the camera during resource import.
- Improve mobile language controls and keep dimension labels inside the drawing area.
- Expand unit and browser regression tests; retain the original .schem v3 and local-only workflow.

## 0.1.0 — 2026-11-14

- Initial public local schematic lesson editor, original examples and GitHub Pages deployment.
