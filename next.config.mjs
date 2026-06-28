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
    // Ensure the xlsx template is included in the Vercel serverless function bundle.
    // Next.js output file tracing does not follow dynamic fs.readFile() paths.
    outputFileTracingIncludes: {
      "/api/export": ["./examples/empty/**"]
    }
  };

  return withNextIntl(config);
}
