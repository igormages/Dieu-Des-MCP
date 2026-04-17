import { Octokit } from "@octokit/rest";
import { getServiceKeys } from "@/lib/keys/store";

export async function getOctokit(): Promise<Octokit> {
  const keys = await getServiceKeys("github");
  const token = keys?.personalAccessToken;

  if (!token) {
    throw new Error(
      "Le token GitHub n'est pas configuré. Rendez-vous sur /settings pour l'ajouter."
    );
  }

  return new Octokit({ auth: token });
}

export interface RepoInfo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  language: string | null;
  default_branch: string;
  stargazers_count: number;
  open_issues_count: number;
  updated_at: string | null;
}

export interface IssueInfo {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: string | null;
  labels: string[];
  created_at: string;
  updated_at: string;
  body: string | null;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  state: string;
  html_url: string;
  user: string | null;
  head_ref: string;
  base_ref: string;
  draft: boolean;
  mergeable: boolean | null;
  created_at: string;
  updated_at: string;
}

export async function listRepos(params?: {
  type?: "all" | "owner" | "public" | "private" | "member";
  sort?: "created" | "updated" | "pushed" | "full_name";
  perPage?: number;
  page?: number;
}): Promise<RepoInfo[]> {
  const octokit = await getOctokit();
  const { data } = await octokit.repos.listForAuthenticatedUser({
    type: params?.type ?? "owner",
    sort: params?.sort ?? "updated",
    per_page: params?.perPage ?? 30,
    page: params?.page ?? 1,
  });

  return data.map((repo) => ({
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    html_url: repo.html_url,
    private: repo.private,
    language: repo.language,
    default_branch: repo.default_branch,
    stargazers_count: repo.stargazers_count,
    open_issues_count: repo.open_issues_count,
    updated_at: repo.updated_at,
  }));
}

export async function listIssues(params: {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  labels?: string;
  sort?: "created" | "updated" | "comments";
  perPage?: number;
  page?: number;
}): Promise<IssueInfo[]> {
  const octokit = await getOctokit();
  const { data } = await octokit.issues.listForRepo({
    owner: params.owner,
    repo: params.repo,
    state: params.state ?? "open",
    labels: params.labels,
    sort: params.sort ?? "created",
    per_page: params.perPage ?? 30,
    page: params.page ?? 1,
  });

  return data.map((issue) => ({
    number: issue.number,
    title: issue.title,
    state: issue.state ?? "open",
    html_url: issue.html_url,
    user: issue.user?.login ?? null,
    labels: issue.labels
      .map((l) => (typeof l === "string" ? l : l.name ?? ""))
      .filter(Boolean),
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    body: issue.body ?? null,
  }));
}

export async function createIssue(params: {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}): Promise<IssueInfo> {
  const octokit = await getOctokit();
  const { data } = await octokit.issues.create({
    owner: params.owner,
    repo: params.repo,
    title: params.title,
    body: params.body,
    labels: params.labels,
    assignees: params.assignees,
  });

  return {
    number: data.number,
    title: data.title,
    state: data.state ?? "open",
    html_url: data.html_url,
    user: data.user?.login ?? null,
    labels: data.labels
      .map((l) => (typeof l === "string" ? l : l.name ?? ""))
      .filter(Boolean),
    created_at: data.created_at,
    updated_at: data.updated_at,
    body: data.body ?? null,
  };
}

export async function listPullRequests(params: {
  owner: string;
  repo: string;
  state?: "open" | "closed" | "all";
  sort?: "created" | "updated" | "popularity" | "long-running";
  perPage?: number;
  page?: number;
}): Promise<PullRequestInfo[]> {
  const octokit = await getOctokit();
  const { data } = await octokit.pulls.list({
    owner: params.owner,
    repo: params.repo,
    state: params.state ?? "open",
    sort: params.sort ?? "created",
    per_page: params.perPage ?? 30,
    page: params.page ?? 1,
  });

  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    html_url: pr.html_url,
    user: pr.user?.login ?? null,
    head_ref: pr.head.ref,
    base_ref: pr.base.ref,
    draft: pr.draft ?? false,
    mergeable: null,
    created_at: pr.created_at,
    updated_at: pr.updated_at,
  }));
}

export async function getRepo(params: {
  owner: string;
  repo: string;
}): Promise<RepoInfo> {
  const octokit = await getOctokit();
  const { data } = await octokit.repos.get({
    owner: params.owner,
    repo: params.repo,
  });

  return {
    name: data.name,
    full_name: data.full_name,
    description: data.description,
    html_url: data.html_url,
    private: data.private,
    language: data.language,
    default_branch: data.default_branch,
    stargazers_count: data.stargazers_count,
    open_issues_count: data.open_issues_count,
    updated_at: data.updated_at,
  };
}

export async function createRepo(params: {
  name: string;
  description?: string;
  isPrivate?: boolean;
  autoInit?: boolean;
  gitignoreTemplate?: string;
}): Promise<RepoInfo> {
  const octokit = await getOctokit();
  const { data } = await octokit.repos.createForAuthenticatedUser({
    name: params.name,
    description: params.description,
    private: params.isPrivate ?? true,
    auto_init: params.autoInit ?? true,
    gitignore_template: params.gitignoreTemplate,
  });

  return {
    name: data.name,
    full_name: data.full_name,
    description: data.description,
    html_url: data.html_url,
    private: data.private,
    language: data.language,
    default_branch: data.default_branch,
    stargazers_count: data.stargazers_count,
    open_issues_count: data.open_issues_count,
    updated_at: data.updated_at,
  };
}

export async function searchCode(params: {
  query: string;
  perPage?: number;
  page?: number;
}): Promise<{ total_count: number; items: { name: string; path: string; repository: string; html_url: string; }[] }> {
  const octokit = await getOctokit();
  const { data } = await octokit.search.code({
    q: params.query,
    per_page: params.perPage ?? 10,
    page: params.page ?? 1,
  });

  return {
    total_count: data.total_count,
    items: data.items.map((item) => ({
      name: item.name,
      path: item.path,
      repository: item.repository.full_name,
      html_url: item.html_url,
    })),
  };
}
