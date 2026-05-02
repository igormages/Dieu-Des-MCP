import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  getAllServiceStatuses,
  getServiceKeys,
  setServiceKeys,
  deleteServiceKeys,
  isKvConfigured,
  SERVICE_DEFINITIONS,
} from "@/lib/keys/store";

function maskValue(value: string): string {
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const statuses = await getAllServiceStatuses();
  const kvReady = isKvConfigured();

  const services: Record<
    string,
    {
      label: string;
      configured: boolean;
      source: string;
      noKeysRequired: boolean;
      fields: { key: string; label: string; placeholder: string; maskedValue: string | null }[];
    }
  > = {};

  for (const [service, def] of Object.entries(SERVICE_DEFINITIONS)) {
    const keys = await getServiceKeys(service);
    const status = statuses[service];

    services[service] = {
      label: def.label,
      configured: status.configured,
      source: status.source,
      noKeysRequired: def.noKeysRequired ?? false,
      fields: def.fields.map((f) => ({
        ...f,
        maskedValue: keys?.[f.key] ? maskValue(keys[f.key]) : null,
      })),
    };
  }

  return NextResponse.json({ services, kvReady });
}

export async function PUT(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await request.json();
  const { service, keys } = body as {
    service: string;
    keys: Record<string, string>;
  };

  if (!service || !keys || !SERVICE_DEFINITIONS[service]) {
    return NextResponse.json(
      { error: "Service ou clés invalides" },
      { status: 400 }
    );
  }

  const def = SERVICE_DEFINITIONS[service];
  if (def.noKeysRequired) {
    return NextResponse.json(
      { error: "Ce service ne nécessite pas de clés API" },
      { status: 400 }
    );
  }

  for (const field of def.fields) {
    if (!keys[field.key]?.trim()) {
      return NextResponse.json(
        { error: `Le champ "${field.label}" est requis` },
        { status: 400 }
      );
    }
  }

  await setServiceKeys(service, keys);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const service = searchParams.get("service");

  if (!service || !SERVICE_DEFINITIONS[service]) {
    return NextResponse.json({ error: "Service invalide" }, { status: 400 });
  }

  const def = SERVICE_DEFINITIONS[service];
  if (def.noKeysRequired) {
    return NextResponse.json({ success: true });
  }

  await deleteServiceKeys(service);
  return NextResponse.json({ success: true });
}
