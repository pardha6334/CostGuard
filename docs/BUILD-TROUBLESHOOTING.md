# Build troubleshooting

## EPERM: operation not permitted, open '.next\trace' (Windows)

This happens when something else is using the `.next` folder (e.g. a dev server, IDE, or antivirus), so the build can’t write the trace file.

**Fix:**

1. Stop any running dev server (`npm run dev`) and close any terminal/IDE that might be using the project.
2. Remove the build output and rebuild:
   ```bash
   npm run clean
   npm run build
   ```
   Or in one step: `npm run build:clean`
3. If it still fails, enable **Windows Developer Mode** (Settings → Privacy & security → For developers → Developer Mode). This can resolve file-access issues during builds.

## Sentry deprecation warning

The warning about `sentry.client.config.ts` and `instrumentation-client.ts` is from Sentry/Next.js for future Turbopack support. It does not break the build. You can ignore it or later move client Sentry setup into `instrumentation-client.ts` when you switch to Turbopack.

## Vitest CJS deprecation

The message “The CJS build of Vite's Node API is deprecated” comes from Vitest/Vite. Tests still run (28/28). You can ignore it until Vitest provides a stable ESM setup.
