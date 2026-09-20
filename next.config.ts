import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@modelcontextprotocol/sdk", "undici"],
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource/api/mcp",
        destination: "/.well-known/oauth-protected-resource",
      },
    ];
  },
};

export default nextConfig;
