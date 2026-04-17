import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  listRepos,
  listIssues,
  createIssue,
  createRepo,
  listPullRequests,
  getRepo,
  searchCode,
} from "./client";

export function registerGitHubTools(server: McpServer) {
  server.tool(
    "github_list_repos",
    "Liste les repositories GitHub de l'utilisateur authentifié",
    {
      type: z
        .enum(["all", "owner", "public", "private", "member"])
        .optional()
        .describe("Type de repos à lister (défaut: owner)"),
      sort: z
        .enum(["created", "updated", "pushed", "full_name"])
        .optional()
        .describe("Tri des résultats (défaut: updated)"),
      per_page: z.number().int().min(1).max(100).optional(),
      page: z.number().int().min(1).optional(),
    },
    async (params) => {
      const repos = await listRepos({
        type: params.type,
        sort: params.sort,
        perPage: params.per_page,
        page: params.page,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(repos, null, 2) }],
      };
    }
  );

  server.tool(
    "github_get_repo",
    "Récupère les détails d'un repository GitHub spécifique",
    {
      owner: z.string().describe("Propriétaire du repo (user ou org)"),
      repo: z.string().describe("Nom du repository"),
    },
    async (params) => {
      const repo = await getRepo(params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(repo, null, 2) }],
      };
    }
  );

  server.tool(
    "github_list_issues",
    "Liste les issues d'un repository GitHub avec filtres optionnels",
    {
      owner: z.string().describe("Propriétaire du repo"),
      repo: z.string().describe("Nom du repository"),
      state: z
        .enum(["open", "closed", "all"])
        .optional()
        .describe("Filtre par état (défaut: open)"),
      labels: z
        .string()
        .optional()
        .describe("Labels séparés par des virgules"),
      sort: z
        .enum(["created", "updated", "comments"])
        .optional()
        .describe("Tri des résultats"),
      per_page: z.number().int().min(1).max(100).optional(),
      page: z.number().int().min(1).optional(),
    },
    async (params) => {
      const issues = await listIssues({
        owner: params.owner,
        repo: params.repo,
        state: params.state,
        labels: params.labels,
        sort: params.sort,
        perPage: params.per_page,
        page: params.page,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(issues, null, 2) }],
      };
    }
  );

  server.tool(
    "github_create_issue",
    "Crée une nouvelle issue dans un repository GitHub",
    {
      owner: z.string().describe("Propriétaire du repo"),
      repo: z.string().describe("Nom du repository"),
      title: z.string().describe("Titre de l'issue"),
      body: z.string().optional().describe("Description de l'issue (Markdown)"),
      labels: z
        .array(z.string())
        .optional()
        .describe("Labels à attacher"),
      assignees: z
        .array(z.string())
        .optional()
        .describe("Utilisateurs à assigner"),
    },
    async (params) => {
      const issue = await createIssue(params);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(issue, null, 2) }],
      };
    }
  );

  server.tool(
    "github_create_repo",
    "Crée un nouveau repository GitHub (privé par défaut)",
    {
      name: z.string().describe("Nom du repository"),
      description: z.string().optional().describe("Description du repository"),
      private: z
        .boolean()
        .optional()
        .describe("Repository privé (défaut: true)"),
      auto_init: z
        .boolean()
        .optional()
        .describe("Initialiser avec un README (défaut: true)"),
      gitignore_template: z
        .string()
        .optional()
        .describe("Template .gitignore (ex: Node, Python, Go)"),
    },
    async (params) => {
      const repo = await createRepo({
        name: params.name,
        description: params.description,
        isPrivate: params.private,
        autoInit: params.auto_init,
        gitignoreTemplate: params.gitignore_template,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(repo, null, 2) }],
      };
    }
  );

  server.tool(
    "github_list_pull_requests",
    "Liste les pull requests d'un repository GitHub",
    {
      owner: z.string().describe("Propriétaire du repo"),
      repo: z.string().describe("Nom du repository"),
      state: z
        .enum(["open", "closed", "all"])
        .optional()
        .describe("Filtre par état (défaut: open)"),
      sort: z
        .enum(["created", "updated", "popularity", "long-running"])
        .optional(),
      per_page: z.number().int().min(1).max(100).optional(),
      page: z.number().int().min(1).optional(),
    },
    async (params) => {
      const prs = await listPullRequests({
        owner: params.owner,
        repo: params.repo,
        state: params.state,
        sort: params.sort,
        perPage: params.per_page,
        page: params.page,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(prs, null, 2) }],
      };
    }
  );

  server.tool(
    "github_search_code",
    "Recherche du code dans les repositories GitHub",
    {
      query: z
        .string()
        .describe("Requête de recherche (syntaxe GitHub search)"),
      per_page: z.number().int().min(1).max(100).optional(),
      page: z.number().int().min(1).optional(),
    },
    async (params) => {
      const results = await searchCode({
        query: params.query,
        perPage: params.per_page,
        page: params.page,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
      };
    }
  );
}
