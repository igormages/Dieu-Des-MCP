import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { importBiocoopCookiesFromRaw } from "@/lib/biocoop/import-cookies-server";
import { getServiceKeys } from "@/lib/keys/store";

const MAX_FILE_BYTES = 512_000;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const keys = await getServiceKeys("biocoop");
  const storePath = keys?.storePath?.trim();
  if (!storePath) {
    return NextResponse.json(
      { error: "Configurez d'abord le chemin magasin Biocoop ci-dessus." },
      { status: 400 }
    );
  }

  let raw = "";
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (file instanceof File) {
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: "Fichier trop volumineux (max 512 Ko)." },
          { status: 400 }
        );
      }
      raw = await file.text();
    } else {
      const text = form.get("text");
      if (typeof text === "string") raw = text;
    }
  } else {
    const body = (await request.json()) as { text?: string };
    raw = body.text?.trim() ?? "";
  }

  if (!raw.trim()) {
    return NextResponse.json(
      { error: "Fichier cookies.txt ou contenu vide." },
      { status: 400 }
    );
  }

  try {
    const summary = await importBiocoopCookiesFromRaw(raw);
    return NextResponse.json({ ok: true, storePath, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import impossible";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
