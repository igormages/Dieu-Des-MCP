import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerQontoTools } from "@/lib/qonto/tools";
import { registerGitHubTools } from "@/lib/github/tools";
import { registerAnthropicTools } from "@/lib/anthropic/tools";
import { registerMicrosoftTools } from "@/lib/microsoft/tools";
import { registerAppleTools } from "@/lib/apple/tools";
import { registerGoogleCloudTools } from "@/lib/googlecloud/tools";
import { registerOpenAITools } from "@/lib/openai/tools";
import { registerVercelTools } from "@/lib/vercel/tools";
import { registerOvhTools } from "@/lib/ovh/tools";
import { registerScalewayTools } from "@/lib/scaleway/tools";
import { registerHostingerTools } from "@/lib/hostinger/tools";
import { registerWebflowTools } from "@/lib/webflow/tools";
import { registerFeedlyTools } from "@/lib/feedly/tools";
import { registerElevenLabsTools } from "@/lib/elevenlabs/tools";
import { registerClubigenTools } from "@/lib/clubigen/tools";
import { registerCookidooTools } from "@/lib/cookidoo/tools";
import { verifyBearerToken } from "@/lib/auth/verify";

const handler = createMcpHandler(
  (server) => {
    registerQontoTools(server);
    registerGitHubTools(server);
    registerAnthropicTools(server);
    registerMicrosoftTools(server);
    registerAppleTools(server);
    registerGoogleCloudTools(server);
    registerOpenAITools(server);
    registerVercelTools(server);
    registerOvhTools(server);
    registerScalewayTools(server);
    registerHostingerTools(server);
    registerWebflowTools(server);
    registerFeedlyTools(server);
    registerElevenLabsTools(server);
    registerClubigenTools(server);
    registerCookidooTools(server);
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
