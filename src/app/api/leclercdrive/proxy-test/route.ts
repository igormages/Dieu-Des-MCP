import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { probeLeclercHttpProxy } from "@/lib/leclercdrive/http";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const result = await probeLeclercHttpProxy();
  return NextResponse.json(result);
}
