# Repository instructions

After every repository change, run `npm run desktop:build` before reporting the work complete. This command rebuilds the renderer, Electron code, and packaged macOS app. `npm run build` and `npm run desktop:compile` alone do not satisfy this requirement.

Check that `release/mac-arm64/AI Presentation Studio.app` was updated by the build. If packaging fails, report the failure and the reason; do not claim the app was rebuilt.

## Presentation authoring

When editing presentation JSON or examples, represent an element entrance as `{ "entrance": <type>, "order": <positive integer> }`. Elements without animation are visible immediately, and elements with the same order reveal together. Do not author `delayMs` or `durationMs`; presenter and narration advances supply timing, and the app supplies entrance duration. Use reveals sparingly and preserve compatible shared identities for slide-to-slide Morph.
