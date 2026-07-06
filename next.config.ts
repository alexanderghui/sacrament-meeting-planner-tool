import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (and the postgres driver) must load from node_modules at runtime
  // rather than being bundled — bundling breaks PGlite's filesystem paths.
  // unpdf bundles a serverless pdf.js build for parsing uploaded LCR roster
  // PDFs; keep it external so its internals aren't re-bundled.
  serverExternalPackages: ["@electric-sql/pglite", "unpdf"],
  experimental: {
    // Roster PDFs are tiny (~60KB for 330 members) but a large ward could push
    // past the 1MB default; give some headroom for the uploaded file.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
