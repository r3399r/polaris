import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  // A static export only in production. `next dev` cannot run an exported
  // build, and the two share .next, so switching between them needs
  // `rm -rf .next` -- which is why deploy.sh does that before building.
  output: isProduction ? 'export' : undefined,
  // The S3 website endpoint resolves a directory to its IndexDocument, so every
  // route has to be emitted as a directory containing an index.html.
  trailingSlash: true,
  // Everything below is for `next dev` only, and none of it can reach the
  // export: `output: 'export'` emits static files and has nowhere to run a
  // rewrite, and nothing serves them but S3.
  //
  // Deployed, the api is a second origin on the same CloudFront distribution
  // as this bundle, so `/api/*` is simply there. `next dev` serves only the
  // bundle, so the same paths are proxied to a deployed environment and the
  // browser still sees one origin: no CORS, and no api url compiled into
  // anything. Set DEV_API_ORIGIN in webapp/.env.local; see .env.local.example.
  ...(isProduction
    ? {}
    : {
        // `trailingSlash` otherwise answers /api/db with a 308 to /api/db/,
        // and the rewrite never fires -- measured, not assumed. fetch follows
        // the redirect, so the call would arrive at the api with the slash
        // still on it, and hono matches paths exactly: that is a 404. Which
        // directories the export emits comes from `trailingSlash` itself, not
        // from this redirect, so dev loses nothing by skipping it.
        skipTrailingSlashRedirect: true,
        rewrites: async () => {
          const origin = process.env.DEV_API_ORIGIN;
          // Unset, nothing is rewritten and /api/* 404s from the dev server,
          // which the page shows as a failed request -- the truth: there is
          // no api here. A rewrite pointing at itself would be the same
          // outcome by a stranger route.
          if (!origin) return [];

          return [
            {
              source: '/api/:path*',
              destination: `${origin.replace(/\/$/, '')}/api/:path*`,
            },
          ];
        },
      }),
};

export default nextConfig;
