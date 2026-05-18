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

async function main() {
  const cfg = await getLeclercDriveConfig();
  console.log("Compte :", cfg.username);
  console.log("Magasin :", cfg.storePath ?? cfg.coursesHost ?? "(auto)");

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
