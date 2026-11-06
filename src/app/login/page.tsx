import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Giriş" };

async function NextField({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <LoginForm next={next ?? "/"} withUser={!!process.env.ADMIN_USER} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p lang="en" className="text-[13px] tracking-[0.18em] text-mute uppercase">Private Issues</p>
        <h1 className="mt-2 text-[34px] leading-none font-medium tracking-tight">admin</h1>
        <Suspense fallback={<div className="skeleton mt-10 h-28" />}>
          <NextField searchParams={searchParams as Promise<{ next?: string }>} />
        </Suspense>
      </div>
    </main>
  );
}
