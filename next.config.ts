import type { NextConfig } from "next";

// Static export: the app has no server. Everything a visitor enters stays in their browser.
// GitHub Pages serves a project site under /<repo>, so the deploy workflow sets BASE_PATH.
const basePath = process.env.BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
