/**
 * Vérifie la session Leclerc Drive (cookies Redis + APIs).
 *
 * Usage: pnpm leclercdrive:probe
 */
import "dotenv/config";
import {
  getLeclercDriveConfig,
  leclercdriveDiagnose,
  leclercdriveGetConnectedUser,
} from "../src/lib/leclercdrive/client";
import { fetchPublicIp } from "../src/lib/leclercdrive/external-ip";
import { wireGuardConfigExists } from "../src/lib/leclercdrive/wg-config";
import { getLeclercHttpProxyForLogs, resolveLeclercHttpProxy } from "../src/lib/leclercdrive/http";

async function main() {
  const cfg = await getLeclercDriveConfig();
  console.log("Compte :", cfg.username);
  console.log("Magasin :", cfg.storePath ?? cfg.coursesHost ?? "(auto)");

  const publicIp = await fetchPublicIp();
  console.log("IP publique (sortie Leclerc) :", publicIp ?? "(inconnue)");
  const proxy = await resolveLeclercHttpProxy();
  if (proxy) {
    console.log("Proxy HTTP :", getLeclercHttpProxyForLogs(proxy));
  } else if (wireGuardConfigExists()) {
    console.log(
      "VPN : fichier WG présent — utilisez pnpm leclercdrive:vpn -- probe ou activez WireGuard"
    );
  }

  const diag = await leclercdriveDiagnose();
  console.log("\n--- Diagnostic ---");
  console.log(JSON.stringify(diag, null, 2));

  console.log("\n--- Compte connecté ---");
  try {
    const user = await leclercdriveGetConnectedUser();
    console.log("OK", JSON.stringify(user, null, 2));
  } catch (e) {
    console.log("ÉCHEC :", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
