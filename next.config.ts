import type { NextConfig } from 'next';

// Sent on every response once TTMS is on the public internet. They are set here
// rather than in a proxy so they are applied by the CDN without invoking a
// function on every request.
//
// Deliberately NOT set: Cross-Origin-Opener-Policy. Sign-in is
// `signInWithPopup`, and a COOP header severs the handle to that popup, so the
// sign-in silently never completes.
const securityHeaders = [
  // Stop a browser second-guessing a Content-Type. Uploaded BOLs and licences
  // are served back through our own routes, so a mislabelled file must not be
  // allowed to execute as a script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // The signing page carries a legal signature. Nobody should be able to frame
  // it inside another site and collect that signature under their own branding.
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

// HTTPS-only in production, but not locally: `npm run dev` is plain http, and
// pinning HSTS against localhost would break every other local project too.
if (process.env.NODE_ENV === 'production') {
  securityHeaders.push({
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  });
}

const nextConfig: NextConfig = {
  serverExternalPackages: ['@react-pdf/renderer'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
