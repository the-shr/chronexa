/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,

  experimental: {
    // Screenshot uploads are a few hundred KB; the 1 MB default is too tight.
    serverActions: { bodySizeLimit: '10mb' },
  },

  async headers() {
    const securityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // The dashboard shows employees' screens -- never allow it to be framed.
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "img-src 'self' data:",
          "style-src 'self' 'unsafe-inline'",
          // Next injects inline bootstrap scripts; dev additionally needs eval.
          process.env.NODE_ENV === 'production'
            ? "script-src 'self' 'unsafe-inline'"
            : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "connect-src 'self'",
          "frame-ancestors 'none'",
          "base-uri 'self'",
          "form-action 'self'",
          "object-src 'none'",
        ].join('; '),
      },
    ];

    if (process.env.NODE_ENV === 'production') {
      securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }

    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
