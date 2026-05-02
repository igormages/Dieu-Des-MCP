import { put } from "@vercel/blob";

/**
 * Publie l’audio MP3 sur Vercel Blob et retourne une URL HTTPS publique.
 * Nécessite BLOB_READ_WRITE_TOKEN (création d’un Blob Store sur le projet Vercel).
 */
export async function publishTtsMp3Url(audio: Uint8Array): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token?.trim()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN est manquant : ajoutez un store Vercel Blob au projet et la variable d’environnement pour obtenir un lien MP3."
    );
  }

  const blob = await put(`tts/elevenlabs-${Date.now()}.mp3`, Buffer.from(audio), {
    access: "public",
    token,
    contentType: "audio/mpeg",
    addRandomSuffix: true,
  });

  return blob.url;
}
