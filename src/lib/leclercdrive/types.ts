export interface LeclercDriveConfig {
  username: string;
  password: string;
  pointLivraison: string;
  storePath: string;
  storeSlug: string;
  coursesHost: string;
  secureHost: string;
  eUniversContexte: number;
}

export interface LeclercDriveCredentials {
  username: string;
  password: string;
  pointLivraison?: string;
  storePath?: string;
  storeSlug?: string;
  coursesHost?: string;
  secureHost?: string;
  eUniversContexte?: number;
}
