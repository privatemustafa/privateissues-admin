"use client";

import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-10 space-y-3">
      <input type="hidden" name="next" value={next} />
      <input
        type="password"
        name="password"
        autoFocus
        autoComplete="current-password"
        placeholder="Şifre"
        className="h-13 w-full rounded-2xl border border-line bg-card px-4 text-[17px] outline-none focus:border-ink"
      />
      <button
        disabled={pending}
        className="h-13 w-full rounded-2xl bg-ink text-[15px] font-medium text-paper transition active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "…" : "Giriş"}
      </button>
      {state?.error && <p className="pt-1 text-sm text-late">{state.error}</p>}
    </form>
  );
}
