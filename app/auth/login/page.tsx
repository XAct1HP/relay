"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  const inputClassName =
    "w-full rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-white/20";

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-md">
          <p className="relay-eyebrow">Relay</p>
          <h1 className="relay-title">Log in</h1>
          <p className="relay-subtitle">Welcome back to Relay.</p>

          <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl">
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/75">
                  Email
                </label>
                <input
                  type="email"
                  className={inputClassName}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/75">
                  Password
                </label>
                <input
                  type="password"
                  className={inputClassName}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full border border-white/10 bg-white/[0.08] px-4 py-2.5 font-medium text-white transition hover:bg-white/[0.12] disabled:opacity-50"
              >
                {loading ? "Logging in..." : "Log in"}
              </button>
            </form>

            {message && <p className="mt-4 text-sm text-white/65">{message}</p>}

            <p className="mt-6 text-sm text-white/60">
              Need an account?{" "}
              <Link
                href="/auth/signup"
                className="font-medium text-white underline underline-offset-4"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}