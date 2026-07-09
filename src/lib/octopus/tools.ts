import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  octopusForceRelogin,
  octopusGetCagnotte,
  octopusGetSessionStatus,
  octopusLogout,
  octopusUseCagnotte,
} from "./client";

function jsonText(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function registerOctopusTools(server: McpServer): void {
  server.tool(
    "octopus_get_session",
    "Vérifie la session Octopus Energy (connexion email/mot de passe octopusenergy.fr).",
    {},
    async () => jsonText(await octopusGetSessionStatus())
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
    "Force une nouvelle connexion Octopus Energy (efface la session cache puis re-login).",
    {},
    async () => jsonText(await octopusForceRelogin())
  );

  server.tool(
    "octopus_logout",
    "Efface la session Octopus Energy en cache.",
    {},
    async () => jsonText(await octopusLogout())
  );
}
