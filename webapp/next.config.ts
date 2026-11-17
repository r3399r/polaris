import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A static export only in production. `next dev` cannot run an exported
  // build, and the two share .next, so switching between them needs
  // `rm -rf .next` -- which is why deploy.sh does that before building.
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  // The S3 website endpoint resolves a directory to its IndexDocument, so every
  // route has to be emitted as a directory containing an index.html.
  trailingSlash: true,
};

export default nextConfig;
