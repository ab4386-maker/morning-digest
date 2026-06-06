import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  return <LoginFormWrapper searchParams={searchParams} />;
}

async function LoginFormWrapper({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6 dark:bg-stone-950">
      <div className="w-full max-w-sm rounded-lg border bg-white p-8 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Abhi&apos;s Daily Digest
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Enter the password to continue.
        </p>
        <LoginForm next={params.next ?? "/"} error={params.error} />
      </div>
    </div>
  );
}
