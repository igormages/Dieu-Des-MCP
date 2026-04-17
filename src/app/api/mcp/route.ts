import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerQontoTools } from "@/lib/qonto/tools";
import { registerGitHubTools } from "@/lib/github/tools";
import { registerAnthropicTools } from "@/lib/anthropic/tools";
import { registerMicrosoftTools } from "@/lib/microsoft/tools";
import { registerAppleTools } from "@/lib/apple/tools";
import { registerAwsTools } from "@/lib/aws/tools";
import { registerGoogleCloudTools } from "@/lib/googlecloud/tools";
import { registerOpenAITools } from "@/lib/openai/tools";
import { registerVercelTools } from "@/lib/vercel/tools";
import { registerOvhTools } from "@/lib/ovh/tools";
import { registerAmazonTools } from "@/lib/amazon/tools";
import { registerScalewayTools } from "@/lib/scaleway/tools";
import { registerHostingerTools } from "@/lib/hostinger/tools";
import { registerOrangeTools } from "@/lib/orange/tools";
import { registerWebflowTools } from "@/lib/webflow/tools";
import { registerSetappTools } from "@/lib/setapp/tools";
import { verifyBearerToken } from "@/lib/auth/verify";

const handler = createMcpHandler(
  (server) => {
    registerQontoTools(server);
    registerGitHubTools(server);
    registerAnthropicTools(server);
    registerMicrosoftTools(server);
    registerAppleTools(server);
    registerAwsTools(server);
    registerGoogleCloudTools(server);
    registerOpenAITools(server);
    registerVercelTools(server);
    registerOvhTools(server);
    registerAmazonTools(server);
    registerScalewayTools(server);
    registerHostingerTools(server);
    registerOrangeTools(server);
    registerWebflowTools(server);
    registerSetappTools(server);
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
