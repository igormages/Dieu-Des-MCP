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
  /** Cookie datadome copié depuis le navigateur (contourne le captcha serveur). */
  datadomeCookie?: string;
  /** Export complet des cookies navigateur (chaîne ou JSON). */
  browserCookies?: string;
  /** URL page magasin depuis le navigateur (évite la découverte multi-silos). */
  storeUrl?: string;
  /** Proxy HTTP sortant (ex. http://user:pass@51.159.164.44:3128), prioritaire sur l’env. */
  httpProxy?: string;
  pointLivraison?: string;
  storePath?: string;
  storeSlug?: string;
  coursesHost?: string;
  secureHost?: string;
  eUniversContexte?: number;
}
