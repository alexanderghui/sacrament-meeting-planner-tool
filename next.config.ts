import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (and the postgres driver) must load from node_modules at runtime
  // rather than being bundled — bundling breaks PGlite's filesystem paths.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
