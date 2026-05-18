# MCP Aggregator

Serveur **Model Context Protocol (MCP)** unifié : une seule URL expose des dizaines d’outils pour vos assistants IA (Cursor, Claude Desktop, etc.), avec gestion des clés API via une interface web sécurisée.

Déployé typiquement sur **Vercel** (Next.js 16), authentification **Clerk**, stockage des secrets **Upstash Redis**.

## Fonctionnalités

- **Point d’entrée MCP unique** : `POST /api/mcp` (protocole MCP via [`mcp-handler`](https://www.npmjs.com/package/mcp-handler))
- **Interface `/settings`** : saisie et test des clés par service (masquées, persistées dans Redis)
- **Fallback variables d’environnement** : chaque service peut aussi être configuré via `.env` (utile en local ou CI)
- **OAuth / Bearer** : intégration Clerk pour protéger l’UI ; le endpoint MCP accepte un token Bearer (session Clerk) — voir [Sécurité](#sécurité)

### Services exposés

| Catégorie | Services |
|-----------|----------|
| Cloud & infra | GitHub, Google Cloud, Vercel, OVH, Scaleway, Hostinger |
| Finance | Qonto, Pennylane (COD'IT) |
| IA & média | Anthropic, OpenAI, OpenRouter, ElevenLabs |
| Microsoft & Apple | Microsoft 365, App Store Connect |
| Web & contenu | Webflow, Feedly, Club iGen (RSS public) |
| Métier COD'IT | CoditVentePres, Pennylane |
| Courses & alimentation | Cookidoo, Biocoop, Leclerc Drive |

Les outils détaillés sont définis dans `src/lib/<service>/tools.ts`.

## Prérequis

- Node.js 20+
- Compte [Clerk](https://clerk.com) (auth)
- Base [Upstash Redis](https://upstash.com) sur Vercel (KV) pour `/settings`
- Optionnel : [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (`BLOB_READ_WRITE_TOKEN`) pour les sorties audio OpenRouter / ElevenLabs

## Installation locale

```bash
git clone <url-du-repo>
cd dieudesmcp
pnpm install   # ou npm install
cp .env.example .env
# Renseigner Clerk + Upstash (minimum)
pnpm dev
```

Ouvrir [http://localhost:3000](http://localhost:3000) → connexion → **Réglages** pour configurer les clés.

## Variables d’environnement

Copier `.env.example` vers `.env`. Minimum requis :

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clé publique Clerk |
| `CLERK_SECRET_KEY` | Secret Clerk |
| `KV_REST_API_URL` | URL REST Upstash |
| `KV_REST_API_TOKEN` | Token Upstash |

Les clés des services (GitHub, Qonto, Cookidoo, etc.) peuvent être saisies dans l’UI **ou** définies en variables — voir `src/lib/keys/store.ts` (`getFromEnv`) pour la liste complète (`GITHUB_PERSONAL_ACCESS_TOKEN`, `COOKIDOO_USERNAME`, `LECLERCDRIVE_HTTP_PROXY`, …).

## Connexion d’un client MCP

URL du serveur (exemple production) :

```
https://votre-domaine.vercel.app/api/mcp
```

Dans **Cursor** : *Settings → MCP → Add server* → type `sse` ou `http` selon la doc du client, avec l’URL ci-dessus et un **Bearer token** Clerk si l’auth MCP est activée.

Métadonnées OAuth : `/.well-known/oauth-protected-resource`

## Scripts utiles

| Commande | Usage |
|----------|--------|
| `pnpm dev` | Serveur de développement |
| `pnpm build` / `pnpm start` | Production locale |
| `pnpm test:cookidoo` | Tests unitaires Cookidoo |
| `pnpm test:biocoop` | Tests unitaires Biocoop |
| `pnpm cookidoo:smoke-e2e` | Smoke test Cookidoo (`COOKIDOO_E2E=1`) |
| `pnpm leclercdrive:harvest` | Récupération session Leclerc (Playwright/CDP) |
| `pnpm leclercdrive:import-cookies` | Import cookies Netscape en CLI |

## Leclerc Drive — proxy HTTP (optionnel)

Le déploiement Vercel peut nécessiter un **proxy HTTP** vers un VPS pour contourner les restrictions réseau / DataDome. Configuration dans `docker/leclercdrive-proxy/` et champ *URL proxy* dans les réglages Leclerc Drive.

```bash
cd docker/leclercdrive-proxy
./setup-auth.sh   # génère passwd + affiche l’URL à mettre dans LECLERCDRIVE_HTTP_PROXY
```

## Architecture

```
Client MCP (Cursor, etc.)
        │  HTTP/SSE
        ▼
/api/mcp  ──► outils (qonto, github, cookidoo, …)
        │
/settings ──► Clerk auth ──► /api/keys ──► Upstash Redis (mcp:keys:*)
```

- **Next.js App Router** : `src/app/`
- **Logique MCP** : `src/lib/<provider>/`
- **Clés** : préfixe Redis `mcp:keys:{service}` (une instance = un jeu de clés partagé entre tous les utilisateurs Clerk de cette instance)

## Sécurité

> **Usage prévu : instance personnelle ou équipe de confiance**, pas un SaaS multi-tenant public.

1. **Ne jamais committer** `.env`, cookies, captures HAR avec session, configs WireGuard (déjà dans `.gitignore`).
2. Les fichiers `ressources/**/*.har` servent au reverse-engineering local ; **ne les publiez pas** s’ils contiennent des cookies de session réels.
3. Le endpoint MCP est configuré avec `required: false` sur l’auth Bearer : en exposition Internet, **renforcer** (`required: true`) ou placer l’API derrière un accès restreint.
4. Tous les utilisateurs d’une même instance partagent les clés Redis : isoler par déploiement si plusieurs personnes ont des comptes Clerk distincts.
5. L’automatisation Cookidoo / Biocoop / Leclerc Drive peut être soumise aux **CGU** des sites concernés — à votre charge juridique.

## Déploiement Vercel

1. Importer le repo sur Vercel
2. Lier **Upstash Redis** (Marketplace) → `KV_REST_*`
3. Configurer **Clerk** → variables Clerk
4. Optionnel : Blob store → `BLOB_READ_WRITE_TOKEN`
5. `pnpm build` (automatique au deploy)

## Licence

Projet actuellement marqué `"private": true` dans `package.json`. Définir une licence (MIT, Apache-2.0, …) avant une diffusion open source publique.

## Structure du dépôt

```
src/app/           # Pages Next.js, routes API (mcp, keys, import cookies)
src/lib/           # Clients et outils MCP par intégration
scripts/           # CLI (harvest session, smoke tests)
docker/            # Proxy Leclerc Drive
ressources/        # Captures HAR de référence (dev uniquement)
```
