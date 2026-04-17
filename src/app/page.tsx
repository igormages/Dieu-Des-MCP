import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">MCP Aggregator</h1>
        <p className="mt-2 text-gray-500">
          Gateway MCP pour Qonto &amp; GitHub
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="mb-3 text-sm font-medium text-gray-500">
          Endpoint MCP
        </p>
        <code className="block rounded-lg bg-gray-50 px-4 py-2.5 font-mono text-sm">
          /api/mcp
        </code>
      </div>

      <div className="flex items-center gap-4">
        {userId ? (
          <Link
            href="/settings"
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Configurer les services
          </Link>
        ) : (
          <Link
            href="/sign-in"
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          >
            Se connecter
          </Link>
        )}
      </div>
    </main>
  );
}
