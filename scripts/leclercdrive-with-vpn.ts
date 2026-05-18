/**
 * Lance une commande Leclerc Drive via WireGuard (même IP que le VPN Cod'iT).
 *
 * Prérequis macOS : `brew install wireguard-tools`
 * Souvent : `sudo wg-quick up …` (mot de passe admin).
 *
 * Usage:
 *   pnpm leclercdrive:vpn -- probe
 *   pnpm leclercdrive:vpn -- import-cookies -- cookies.txt
 *
 * Variable : LECLERCDRIVE_WG_CONF (défaut ressources/Cod'iT.conf)
 */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { resolveWireGuardConfigPath } from "../src/lib/leclercdrive/wg-config";

function run(cmd: string, args: string[], opts?: { allowFail?: boolean }): number {
  const r = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf8" });
  if (r.status !== 0 && !opts?.allowFail) {
    console.error(`Échec : ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
  return r.status ?? 0;
}

function wgQuickAvailable(): boolean {
  return spawnSync("which", ["wg-quick"], { encoding: "utf8" }).status === 0;
}

function main() {
  const conf = resolveWireGuardConfigPath();
  if (!conf || !fs.existsSync(conf)) {
    console.error(
      "Fichier WireGuard introuvable. Définissez LECLERCDRIVE_WG_CONF ou placez ressources/Cod'iT.conf"
    );
    process.exit(1);
  }

  const args = process.argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0) {
    console.error("Usage: pnpm leclercdrive:vpn -- <probe|import-cookies|harvest> [args…]");
    process.exit(1);
  }

  const sub = args[0];
  const subArgs = args.slice(1);
  const allowed = new Set(["probe", "import-cookies", "harvest"]);
  if (!allowed.has(sub)) {
    console.error("Sous-commande autorisée :", [...allowed].join(", "));
    process.exit(1);
  }

  if (!wgQuickAvailable()) {
    console.error("wg-quick absent. Installez : brew install wireguard-tools");
    console.error("");
    console.error("Alternative : activez le tunnel dans l’app WireGuard (import Cod'iT.conf),");
    console.error("puis lancez directement pnpm leclercdrive:probe (le trafic Node suit le VPN).");
    process.exit(1);
  }

  console.log("WireGuard :", conf);
  console.log("→ Montage du tunnel (sudo peut être demandé)…\n");

  const upStatus = run("wg-quick", ["up", conf], { allowFail: true });
  if (upStatus !== 0) {
    console.error("");
    console.error("Impossible de monter le VPN. Essayez :");
    console.error(`  sudo wg-quick up '${conf.replace(/'/g, "'\\''")}'`);
    console.error("Ou importez le profil dans l’app WireGuard et activez-le manuellement.");
    process.exit(1);
  }

  let exitCode = 0;
  try {
    const script =
      sub === "probe"
        ? "leclercdrive:probe"
        : sub === "import-cookies"
          ? "leclercdrive:import-cookies"
          : "leclercdrive:harvest";
    const pnpmArgs = ["run", script, ...(subArgs.length ? ["--", ...subArgs] : [])];
    const r = spawnSync("pnpm", pnpmArgs, { stdio: "inherit", encoding: "utf8" });
    exitCode = r.status ?? 1;
  } finally {
    console.log("\n→ Démontage du tunnel…");
    run("wg-quick", ["down", conf], { allowFail: true });
  }

  process.exit(exitCode);
}

main();
