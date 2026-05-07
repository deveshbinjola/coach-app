/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // Cloudflare Pages deploys this app via @cloudflare/next-on-pages. The
  // adapter handles the runtime conversion automatically, no extra config
  // needed for production.
  //
  // OPTIONAL local-dev parity: uncomment the block below to simulate the
  // Cloudflare runtime when running `next dev`. Without it, local dev runs
  // on Node and prod runs on Workers, which is fine 99% of the time but
  // can hide compatibility bugs.
  //
  // import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';
  // if (process.env.NODE_ENV === 'development') {
  //   await setupDevPlatform();
  // }
};

export default nextConfig;
