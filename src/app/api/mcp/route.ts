import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerQontoTools } from "@/lib/qonto/tools";
import { registerGitHubTools } from "@/lib/github/tools";
import { verifyBearerToken } from "@/lib/auth/verify";

const handler = createMcpHandler(
  (server) => {
    registerQontoTools(server);
    registerGitHubTools(server);
  },
  {
    capabilities: {
      tools: {},
    },
  },
  {
    basePath: "/api",
  }
);

const authHandler = withMcpAuth(handler, verifyBearerToken, {
  required: false,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
