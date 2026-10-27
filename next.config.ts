import type { NextConfig } from "next";

// Static export: the app has no server. Everything a visitor enters stays in their browser.
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
