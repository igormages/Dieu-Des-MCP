import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  octopusForceRelogin,
  octopusGetChargeDevices,
  octopusGetChargeSchedule,
  octopusGetSessionStatus,
  octopusLogout,
  octopusSetChargeTargetTime,
} from "./client";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerOctopusTools(server: McpServer): void {
  server.tool(
    "octopus_get_session",
    "Vérifie la session Octopus Energy (API Kraken mobile, api.oefr-kraken.energy).",
    {},
    async () => jsonText(await octopusGetSessionStatus())
  );

  server.tool(
    "octopus_get_charge_devices",
    "Liste les véhicules Smart Flex connectés (GetSmartFlexDevices).",
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
    "Lit l'heure cible de recharge Smart Flex pour chaque jour (GetSmartFlexDevicePreferences).",
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
    "Change l'heure cible de recharge Smart Flex (SetSmartFlexDevicePreferences). Applique la même heure aux 7 jours.",
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
    "octopus_relogin",
    "Rafraîchit la session Octopus : utilise le refresh token longue durée en priorité, sinon email/mot de passe.",
    {},
    async () => jsonText(await octopusForceRelogin())
  );

  server.tool(
    "octopus_kraken_get_session",
    "Alias de octopus_get_session (compatibilité).",
    {},
    async () => jsonText(await octopusGetSessionStatus())
  );

  server.tool(
    "octopus_kraken_relogin",
    "Alias de octopus_relogin (compatibilité).",
    {},
    async () => jsonText(await octopusForceRelogin())
  );

  server.tool(
    "octopus_logout",
    "Efface la session Octopus en cache.",
    {},
    async () => jsonText(await octopusLogout())
  );
}
