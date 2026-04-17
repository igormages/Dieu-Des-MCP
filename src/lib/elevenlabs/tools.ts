import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSubscription, listVoices, listModels, listProjects, textToSpeech, createProject } from "./client";

export function registerElevenLabsTools(server: McpServer) {
  server.tool(
    "elevenlabs_get_subscription",
    "Récupère les infos d'abonnement ElevenLabs (caractères restants, limite mensuelle, plan, etc.)",
    {},
    async () => {
      const sub = await getSubscription();
      return { content: [{ type: "text" as const, text: JSON.stringify(sub, null, 2) }] };
    }
  );

  server.tool(
    "elevenlabs_list_voices",
    "Liste toutes les voix disponibles sur ElevenLabs (bibliothèque + voix personnalisées)",
    {},
    async () => {
      const result = await listVoices();
      return { content: [{ type: "text" as const, text: JSON.stringify(result.voices, null, 2) }] };
    }
  );

  server.tool(
    "elevenlabs_list_models",
    "Liste les modèles de synthèse vocale disponibles sur ElevenLabs",
    {},
    async () => {
      const models = await listModels();
      return { content: [{ type: "text" as const, text: JSON.stringify(models, null, 2) }] };
    }
  );

  server.tool(
    "elevenlabs_list_projects",
    "Liste les projets podcast ElevenLabs",
    {},
    async () => {
      const result = await listProjects();
      return { content: [{ type: "text" as const, text: JSON.stringify(result.projects, null, 2) }] };
    }
  );

  server.tool(
    "elevenlabs_text_to_speech",
    "Génère un fichier audio MP3 à partir d'un texte avec une voix ElevenLabs. Retourne l'audio encodé en base64.",
    {
      text: z.string().describe("Texte à synthétiser en audio"),
      voiceId: z.string().describe("ID de la voix ElevenLabs à utiliser (obtenu via elevenlabs_list_voices)"),
      modelId: z.string().optional().describe("ID du modèle (défaut: eleven_multilingual_v2)"),
      stability: z.number().min(0).max(1).optional().describe("Stabilité de la voix 0-1 (défaut: 0.5)"),
      similarityBoost: z.number().min(0).max(1).optional().describe("Ressemblance à la voix 0-1 (défaut: 0.75)"),
    },
    async ({ text, voiceId, modelId, stability, similarityBoost }) => {
      const base64Audio = await textToSpeech(voiceId, text, modelId, stability, similarityBoost);
      return {
        content: [
          {
            type: "text" as const,
            text: `Audio MP3 généré (${text.length} caractères).\nBase64:\n${base64Audio}`,
          },
        ],
      };
    }
  );

  server.tool(
    "elevenlabs_create_project",
    "Crée un nouveau projet podcast sur ElevenLabs",
    {
      name: z.string().describe("Nom du projet"),
      defaultTitleVoiceId: z.string().describe("ID de la voix pour les titres"),
      defaultParagraphVoiceId: z.string().describe("ID de la voix pour les paragraphes"),
      defaultModelId: z.string().optional().describe("ID du modèle (défaut: eleven_multilingual_v2)"),
    },
    async ({ name, defaultTitleVoiceId, defaultParagraphVoiceId, defaultModelId }) => {
      const result = await createProject(name, defaultTitleVoiceId, defaultParagraphVoiceId, defaultModelId);
      return { content: [{ type: "text" as const, text: JSON.stringify(result.project, null, 2) }] };
    }
  );
}
