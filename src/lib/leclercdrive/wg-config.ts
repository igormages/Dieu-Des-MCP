import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_WG_BASENAME = "Cod'iT.conf";

/** Chemin vers le fichier WireGuard (hors dépôt git — contient des clés privées). */
export function resolveWireGuardConfigPath(): string | undefined {
  const fromEnv = process.env.LECLERCDRIVE_WG_CONF?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv);
  }
  const defaultPath = path.join(process.cwd(), "ressources", DEFAULT_WG_BASENAME);
  return fs.existsSync(defaultPath) ? defaultPath : undefined;
}

export function wireGuardConfigExists(): boolean {
  const p = resolveWireGuardConfigPath();
  return Boolean(p && fs.existsSync(p));
}
