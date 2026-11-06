import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-[13px] tracking-[0.18em] text-mute uppercase">404</p>
      <p className="mt-2 text-[22px] font-medium">Burada bir şey yok.</p>
      <Link href="/" className="mt-6 text-[14px] underline">
        Panele dön
      </Link>
    </main>
  );
}
