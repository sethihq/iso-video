import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    ignoreIssue: [
      // @ffmpeg/ffmpeg only builds its worker from a runtime URL when load() gets
      // a classWorkerURL. We never pass one, so the bundled default worker is used.
      {
        path: "**/@ffmpeg/ffmpeg/dist/esm/classes.js",
        title: /^Module not found: Can't resolve .*<dynamic>/,
      },
    ],
  },
};

export default nextConfig;
