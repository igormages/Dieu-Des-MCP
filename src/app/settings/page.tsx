import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-sm font-bold text-white">
              M
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">
                MCP Aggregator
              </h1>
              <p className="text-xs text-gray-500">Configuration</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-600">
              /api/mcp
            </span>
            <UserButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900">Services</h2>
          <p className="mt-1 text-sm text-gray-500">
            Ajoutez vos clés API pour chaque service. Elles seront accessibles
            par les outils MCP.
          </p>
        </div>
        <SettingsForm />
      </main>
    </div>
  );
}
