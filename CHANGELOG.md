# Changelog

## 0.3.0 — 2026-11-15

- Bundle the original Java 1.20.1 block PNGs and JSON models as a 451 KiB compressed resource library. Schematics use vanilla resources automatically, including when fully offline.
- Layer custom texture packs over the vanilla base, retaining inherited models and textures; add Restore vanilla without resetting progress or the camera.
- Preserve the resource source/version in projects and exported lessons; retain the complete default library when opening another schematic in an exported page.
- Keep explicit fallback labels for unsupported blocks and built-in entity models. Record provenance hashes and separate Minecraft asset rights from the MIT code license.
- Prevent neighbouring atlas textures from bleeding into each other when zooming out.
- Verify default texture pixels against the source PNG, partial-pack inheritance, offline exports, bilingual labels and library integrity.

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
