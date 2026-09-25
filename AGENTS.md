# Repository instructions

After every repository change, run `npm run desktop:build` before reporting the work complete. This command rebuilds the renderer, Electron code, and packaged macOS app. `npm run build` and `npm run desktop:compile` alone do not satisfy this requirement.

Check that `release/mac-arm64/AI Presentation Studio.app` was updated by the build. If packaging fails, report the failure and the reason; do not claim the app was rebuilt.
