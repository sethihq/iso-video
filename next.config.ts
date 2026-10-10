import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Automatic memoization, so the editor re-renders only what changed
  reactCompiler: true,
};

export default nextConfig;
