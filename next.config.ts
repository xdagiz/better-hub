import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        { source: "/:owner/:repo", destination: "/repos/:owner/:repo" },
        {
          source: "/:owner/:repo/:path*",
          destination: "/repos/:owner/:repo/:path*",
        },
      ],
    };
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "github.com",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "user-images.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
