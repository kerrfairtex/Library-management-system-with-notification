import type { NextConfig } from "next";

// Security headers applied to every response (defense-in-depth; React
// escaping already covers XSS, CSP adds a second layer, frame-ancestors
// blocks clickjacking of the desk UI).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/**
 * CSP for the 3D bookshelf. The shelf uses Three.js with canvas rendering,
 * needs `unsafe-inline` for dynamic styles, and loads models/textures from
 * the same origin.
 */
const shelfCSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "worker-src 'self' blob:";

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/shelf(.*)",
        headers: [
          ...securityHeaders,
          { key: "Content-Security-Policy", value: shelfCSP },
        ],
      },
    ];
  },
};

export default nextConfig;
