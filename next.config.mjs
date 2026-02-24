import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

export default function nextConfig(phase) {
  /** @type {import('next').NextConfig} */
  const config = {
    reactStrictMode: true,
    // Keep dev and build artifacts separate on Windows to avoid chunk-loader mismatches
    // when switching between `next dev` and `next build`.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"
  };

  return config;
}
