import { put } from "@vercel/blob";

/**
 * Publie une image générée sur Vercel Blob et retourne une URL HTTPS publique.
 * Nécessite BLOB_READ_WRITE_TOKEN (Vercel Blob store sur le projet).
 */
export async function publishOpenRouterImage(
  bytes: Uint8Array,
  mimeType: string
): Promise<{ url: string; sizeBytes: number }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token?.trim()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN est manquant : ajoutez un store Vercel Blob au projet pour obtenir un lien d'image."
    );
  }

  const ext = mimeTypeToExtension(mimeType);
  const blob = await put(`openrouter/img-${Date.now()}.${ext}`, Buffer.from(bytes), {
    access: "public",
    token,
    contentType: mimeType,
    addRandomSuffix: true,
  });

  return { url: blob.url, sizeBytes: bytes.byteLength };
}

function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    default:
      return "bin";
  }
}
