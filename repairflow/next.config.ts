import type { NextConfig } from "next";

/**
 * Configuration Next.js.
 * - `serverExternalPackages` : les bibliothèques natives (SQLite) et les moteurs Prisma
 *   ne doivent pas être empaquetés par Turbopack.
 * - En-têtes de sécurité appliqués à toutes les réponses.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: __dirname },
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "@prisma/client", "pg", "exceljs"],
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
