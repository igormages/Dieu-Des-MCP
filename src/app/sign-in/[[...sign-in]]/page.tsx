import { SignIn } from "@clerk/nextjs";

interface PageProps {
  searchParams: Promise<{ redirect_url?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { redirect_url: redirectUrl } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <SignIn forceRedirectUrl={redirectUrl} />
    </div>
  );
}
