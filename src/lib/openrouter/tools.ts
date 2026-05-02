import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  chatCompletion,
  decodeDataUrl,
  getCredits,
  getGeneration,
  getKeyInfo,
  listModels,
  type OpenRouterChatMessage,
} from "./client";
import { publishOpenRouterImage } from "./publish-image";

const DEFAULT_IMAGE_MODEL = "google/gemini-2.5-flash-image-preview";
const DEFAULT_TEXT_MODEL = "anthropic/claude-sonnet-4.6";

export function registerOpenRouterTools(server: McpServer) {
  server.tool(
    "openrouter_get_key_info",
    "Récupère les infos d'utilisation de la clé OpenRouter (crédits utilisés, restants, limites journalière/hebdo/mensuelle).",
    {},
    async () => {
      const res = await getKeyInfo();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(res.data, null, 2) }],
      };
    }
  );

  server.tool(
    "openrouter_get_credits",
    "Récupère le solde global de crédits OpenRouter (total acheté vs total utilisé).",
    {},
    async () => {
      const res = await getCredits();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                total_credits: res.data.total_credits,
                total_usage: res.data.total_usage,
                remaining: res.data.total_credits - res.data.total_usage,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "openrouter_list_models",
    "Liste les modèles disponibles sur OpenRouter (200+). Filtres par modalités d'entrée/sortie.",
    {
      inputModalities: z
        .string()
        .optional()
        .describe("Modalités d'entrée (séparées par virgule, ex: 'text,image')."),
      outputModalities: z
        .string()
        .optional()
        .describe("Modalités de sortie (ex: 'image' pour les modèles de génération d'images)."),
      onlyImageGeneration: z
        .boolean()
        .optional()
        .describe("Raccourci : ne lister que les modèles qui génèrent des images."),
      search: z
        .string()
        .optional()
        .describe("Filtre côté client par sous-chaîne (sur id ou name, insensible à la casse)."),
    },
    async ({ inputModalities, outputModalities, onlyImageGeneration, search }) => {
      const res = await listModels({
        inputModalities,
        outputModalities: onlyImageGeneration ? "image" : outputModalities,
      });
      const lower = search?.toLowerCase();
      const filtered = lower
        ? res.data.filter(
            (m) => m.id.toLowerCase().includes(lower) || m.name.toLowerCase().includes(lower)
          )
        : res.data;
      const summary = filtered.map((m) => ({
        id: m.id,
        name: m.name,
        context_length: m.context_length,
        max_output_length: m.max_output_length,
        input_modalities: m.input_modalities,
        output_modalities: m.output_modalities,
        pricing: m.pricing,
        supported_features: m.supported_features,
        deprecation_date: m.deprecation_date,
      }));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ count: summary.length, models: summary }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "openrouter_get_generation",
    "Récupère les détails (cost, tokens) d'une génération OpenRouter à partir de son ID.",
    {
      id: z.string().describe("ID de la génération (champ 'id' de la réponse chat completion)."),
    },
    async ({ id }) => {
      const res = await getGeneration(id);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(res.data, null, 2) }],
      };
    }
  );

  server.tool(
    "openrouter_chat",
    "Envoie un message (chat completion) à n'importe quel modèle OpenRouter et renvoie la réponse texte. Format provider/model (ex: 'anthropic/claude-sonnet-4.6', 'openai/gpt-5', 'google/gemini-2.5-pro').",
    {
      model: z
        .string()
        .optional()
        .describe(`Modèle au format provider/model. Défaut : ${DEFAULT_TEXT_MODEL}.`),
      prompt: z.string().describe("Message utilisateur (texte simple)."),
      system: z.string().optional().describe("Instructions système (rôle assistant)."),
      temperature: z.number().min(0).max(2).optional().describe("Température (0-2)."),
      maxTokens: z.number().int().min(1).optional().describe("Limite de tokens en sortie."),
      topP: z.number().min(0).max(1).optional().describe("Top-p sampling."),
    },
    async ({ model, prompt, system, temperature, maxTokens, topP }) => {
      const messages: OpenRouterChatMessage[] = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });
      const res = await chatCompletion({
        model: model ?? DEFAULT_TEXT_MODEL,
        messages,
        temperature,
        maxTokens,
        topP,
      });
      const text = res.choices[0]?.message.content ?? "";
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: res.id,
                model: res.model,
                finish_reason: res.choices[0]?.finish_reason,
                usage: res.usage,
                response: text,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "openrouter_generate_image",
    "Génère une ou plusieurs images via OpenRouter (modèles multimodaux). Par défaut : upload sur Vercel Blob et retour d'URLs publiques. Option 'base64' pour debug.",
    {
      prompt: z.string().describe("Description textuelle de l'image à générer."),
      model: z
        .string()
        .optional()
        .describe(
          `Modèle d'image multimodal. Défaut : ${DEFAULT_IMAGE_MODEL}. Autres exemples : 'google/gemini-3-pro-image-preview', 'openai/gpt-image-1'.`
        ),
      aspectRatio: z
        .enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"])
        .optional()
        .describe("Ratio d'aspect (si supporté par le modèle)."),
      imageSize: z
        .enum(["1K", "2K", "4K"])
        .optional()
        .describe("Résolution cible (si supporté)."),
      referenceImageUrl: z
        .string()
        .url()
        .optional()
        .describe("URL d'une image de référence à inclure dans le prompt (édition / inspiration)."),
      delivery: z
        .enum(["url", "base64"])
        .optional()
        .describe(
          "url : upload Vercel Blob et lien public (défaut, requiert BLOB_READ_WRITE_TOKEN). base64 : image inline."
        ),
    },
    async ({ prompt, model, aspectRatio, imageSize, referenceImageUrl, delivery }) => {
      const userContent: OpenRouterChatMessage["content"] = referenceImageUrl
        ? [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: referenceImageUrl } },
          ]
        : prompt;

      const res = await chatCompletion({
        model: model ?? DEFAULT_IMAGE_MODEL,
        messages: [{ role: "user", content: userContent }],
        withImage: true,
        imageConfig:
          aspectRatio || imageSize
            ? { aspectRatio, imageSize }
            : undefined,
      });

      const message = res.choices[0]?.message;
      const images = message?.images ?? [];
      const mode = delivery ?? "url";

      const decoded: Array<{ mimeType: string; bytes: Uint8Array; raw: string }> = [];
      for (const img of images) {
        const dataUrl = img.image_url?.url;
        if (!dataUrl) continue;
        const parsed = decodeDataUrl(dataUrl);
        if (parsed) {
          decoded.push({ mimeType: parsed.mimeType, bytes: parsed.bytes, raw: dataUrl });
        } else if (dataUrl.startsWith("http")) {
          decoded.push({ mimeType: "image/unknown", bytes: new Uint8Array(), raw: dataUrl });
        }
      }

      if (decoded.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  warning:
                    "Le modèle n'a renvoyé aucune image. Vérifie que le modèle supporte 'output_modalities: image' (utilise openrouter_list_models avec onlyImageGeneration: true).",
                  model: res.model,
                  textResponse: message?.content,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (mode === "base64") {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  format: "base64",
                  generationId: res.id,
                  model: res.model,
                  textResponse: message?.content,
                  images: decoded.map((d) => ({
                    mimeType: d.mimeType,
                    sizeBytes: d.bytes.byteLength,
                    dataUrl: d.raw,
                  })),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const uploaded: Array<{ url: string; mimeType: string; sizeBytes: number }> = [];
      for (const d of decoded) {
        if (d.bytes.byteLength === 0 && d.raw.startsWith("http")) {
          uploaded.push({ url: d.raw, mimeType: d.mimeType, sizeBytes: 0 });
        } else {
          const published = await publishOpenRouterImage(d.bytes, d.mimeType);
          uploaded.push({
            url: published.url,
            mimeType: d.mimeType,
            sizeBytes: published.sizeBytes,
          });
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                format: "url",
                generationId: res.id,
                model: res.model,
                usage: res.usage,
                textResponse: message?.content,
                images: uploaded,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "openrouter_chat_with_image_input",
    "Envoie un prompt + une image (URL ou base64) à un modèle vision OpenRouter (Claude, GPT-4o, Gemini…) et renvoie la réponse texte.",
    {
      model: z
        .string()
        .optional()
        .describe(`Modèle vision. Défaut : ${DEFAULT_TEXT_MODEL}.`),
      prompt: z.string().describe("Question / instruction sur l'image."),
      imageUrl: z
        .string()
        .optional()
        .describe("URL HTTPS publique de l'image OU data:image/...;base64,xxx."),
      imageBase64: z
        .string()
        .optional()
        .describe("Image encodée en base64 (sans préfixe). Mutuellement exclusif avec imageUrl."),
      mimeType: z
        .string()
        .optional()
        .describe("MIME type si imageBase64 fourni (défaut image/jpeg)."),
      system: z.string().optional().describe("Instructions système."),
      maxTokens: z.number().int().optional().describe("Limite de tokens en sortie."),
    },
    async ({ model, prompt, imageUrl, imageBase64, mimeType, system, maxTokens }) => {
      if (!imageUrl && !imageBase64) {
        throw new Error("Fournir 'imageUrl' OU 'imageBase64'.");
      }
      const finalUrl = imageUrl
        ? imageUrl
        : `data:${mimeType ?? "image/jpeg"};base64,${imageBase64}`;
      const messages: OpenRouterChatMessage[] = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: finalUrl } },
        ],
      });
      const res = await chatCompletion({
        model: model ?? DEFAULT_TEXT_MODEL,
        messages,
        maxTokens,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                id: res.id,
                model: res.model,
                usage: res.usage,
                response: res.choices[0]?.message.content ?? "",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
