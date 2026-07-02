import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local-dev DB) loads WASM assets from disk; bundling breaks its
  // asset paths. Keep it external — it is never used in production.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
