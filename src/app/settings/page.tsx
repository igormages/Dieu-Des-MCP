import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold">MCP Aggregator</h1>
            <p className="text-sm text-gray-500">Configuration des services</p>
          </div>
          <a
            href="/"
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Retour
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        <SettingsForm />
      </main>
    </div>
  );
}
