import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  octopusForceRelogin,
  octopusGetCagnotte,
  octopusGetSessionStatus,
  octopusLogout,
  octopusUseCagnotte,
} from "./client";
import {
  octopusGetChargeDevices,
  octopusGetChargeSchedule,
  octopusKrakenForceRelogin,
  octopusKrakenGetSessionStatus,
  octopusSetChargeTargetTime,
} from "./kraken-client";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerOctopusTools(server: McpServer): void {
  server.tool(
    "octopus_get_session",
    "Vérifie les sessions Octopus Energy : site web (cagnotte) et API Kraken mobile (recharge véhicule).",
    {},
    async () => jsonText(await octopusGetSessionStatus())
  );

  server.tool(
    "octopus_kraken_get_session",
    "Vérifie la session API Kraken (api.oefr-kraken.energy) — connexion email/mot de passe sans blocage Vercel.",
    {},
    async () => jsonText(await octopusKrakenGetSessionStatus())
  );

  server.tool(
    "octopus_get_charge_devices",
    "Liste les véhicules Smart Flex connectés (API Kraken mobile, HAR : GetSmartFlexDevices).",
    {
      accountNumber: z
        .string()
        .optional()
        .describe("Numéro de compte Octopus (ex. A-78F490A5)."),
      deviceId: z
        .string()
        .optional()
        .describe("ID du véhicule Smart Flex. Défaut : tous les véhicules."),
    },
    async ({ accountNumber, deviceId }) =>
      jsonText(await octopusGetChargeDevices({ accountNumber, deviceId }))
  );

  server.tool(
    "octopus_get_charge_schedule",
    "Lit l'heure cible de recharge Smart Flex pour chaque jour (API Kraken, HAR : GetSmartFlexDevicePreferences).",
    {
      accountNumber: z.string().optional().describe("Numéro de compte Octopus."),
      deviceId: z
        .string()
        .optional()
        .describe("ID du véhicule. Défaut : deviceId configuré ou premier véhicule."),
    },
    async ({ accountNumber, deviceId }) =>
      jsonText(await octopusGetChargeSchedule({ accountNumber, deviceId }))
  );

  server.tool(
    "octopus_set_charge_target_time",
    "Change l'heure cible de recharge Smart Flex (API Kraken, HAR : SetSmartFlexDevicePreferences). Applique la même heure aux 7 jours.",
    {
      time: z
        .string()
        .describe("Heure cible au format HH:MM (ex. 05:00)."),
      accountNumber: z.string().optional().describe("Numéro de compte Octopus."),
      deviceId: z
        .string()
        .optional()
        .describe("ID du véhicule. Défaut : deviceId configuré ou premier véhicule."),
      maxPercent: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Niveau de charge cible en %. Défaut : 100."),
    },
    async ({ time, accountNumber, deviceId, maxPercent }) =>
      jsonText(
        await octopusSetChargeTargetTime({ time, accountNumber, deviceId, maxPercent })
      )
  );

  server.tool(
    "octopus_get_cagnotte",
    "Affiche le solde de la cagnotte Octopus Energy et indique si elle est utilisable sur le prochain prélèvement (HAR : page /cagnotte).",
    {
      accountNumber: z
        .string()
        .optional()
        .describe("Numéro de compte Octopus (ex. A-78F490A5). Défaut : premier compte du profil."),
    },
    async ({ accountNumber }) => jsonText(await octopusGetCagnotte(accountNumber))
  );

  server.tool(
    "octopus_use_cagnotte",
    "Utilise la cagnotte Octopus Energy sur le prochain prélèvement (HAR : mutation CreateSourceFundRequest).",
    {
      accountNumber: z
        .string()
        .optional()
        .describe("Numéro de compte Octopus. Défaut : compte configuré ou premier compte."),
      amountCents: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Montant en centimes à utiliser. Défaut : total utilisable (balanceForecast)."),
      agreementId: z
        .number()
        .int()
        .optional()
        .describe("ID du contrat cible. Défaut : premier contrat éligible."),
    },
    async ({ accountNumber, amountCents, agreementId }) =>
      jsonText(await octopusUseCagnotte({ accountNumber, amountCents, agreementId }))
  );

  server.tool(
    "octopus_relogin",
    "Force une nouvelle connexion Octopus (web + API Kraken) : efface les sessions cache puis re-login.",
    {},
    async () => jsonText(await octopusForceRelogin())
  );

  server.tool(
    "octopus_kraken_relogin",
    "Force une nouvelle connexion API Kraken uniquement (api.oefr-kraken.energy).",
    {},
    async () => jsonText(await octopusKrakenForceRelogin())
  );

  server.tool(
    "octopus_logout",
    "Efface les sessions Octopus en cache (web + API Kraken).",
    {},
    async () => jsonText(await octopusLogout())
  );
}
