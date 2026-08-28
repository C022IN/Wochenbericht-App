import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// Locale is read from a cookie (see i18n/request.ts) — no locale URL prefixes.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default function nextConfig(phase) {
  /** @type {import('next').NextConfig} */
  const config = {
    reactStrictMode: true,
    // Keep dev and build artifacts separate on Windows to avoid chunk-loader mismatches
    // when switching between `next dev` and `next build`.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    turbopack: {
      root: projectRoot
    },
    // Pin the tracing root to this project so include globs resolve against the right base
    // (a stray sibling Next checkout can otherwise make Next pick the wrong workspace root).
    outputFileTracingRoot: projectRoot,
    // Ensure the xlsx template is bundled into EVERY serverless function that reads it.
    // Next.js output file tracing does not follow dynamic fs.readFile() paths, and each API
    // route is its own lambda — so the weekly cron needs its own explicit include or the
    // Sunday email ENOENTs on the template and silently never sends.
    outputFileTracingIncludes: {
      "/api/export": ["./examples/empty/**"],
      "/api/cron/weekly-report": ["./examples/empty/**"]
    }
  };

  return withNextIntl(config);
}
