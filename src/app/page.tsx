import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/settings");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-gray-50 p-8">
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900 text-2xl font-bold text-white">
          M
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          MCP Aggregator
        </h1>
        <p className="mt-2 text-lg text-gray-500">
          Connectez vos services en un seul point MCP
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link
          href="/sign-in"
          className="flex items-center justify-center rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-gray-800 hover:shadow-md"
        >
          Se connecter
        </Link>
        <Link
          href="/sign-up"
          className="flex items-center justify-center rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-all hover:border-gray-400 hover:bg-gray-50"
        >
          Créer un compte
        </Link>
      </div>
    </main>
  );
}
