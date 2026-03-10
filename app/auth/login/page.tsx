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
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/28 transition focus:border-white/20 focus:bg-white/[0.06]";
  const labelClassName =
    "mb-2 block text-sm font-medium text-white/72";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06070b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(139,92,246,0.14),transparent_28%),linear-gradient(to_bottom,rgba(255,255,255,0.02),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 bg-[#06070b]/70" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="hidden lg:block">
            <div className="max-w-xl">
              <div className="inline-flex items-center rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white/70 backdrop-blur">
                The professional platform for sneaker resellers
              </div>

              <h1 className="mt-8 text-5xl font-semibold leading-[0.94] tracking-[-0.05em] text-white">
                Welcome back to
                <span className="block bg-gradient-to-r from-white via-white to-white/55 bg-clip-text text-transparent">
                  Relay.
                </span>
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-8 text-white/64">
                Sign in to manage listings, negotiate offers, track orders, and
                grow your reseller profile in one place.
              </p>

              <div className="mt-10 grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                  <div className="text-2xl font-semibold text-white">1%</div>
                  <div className="mt-1 text-sm text-white/55">platform fee</div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                  <div className="text-2xl font-semibold text-white">Offers</div>
                  <div className="mt-1 text-sm text-white/55">native deal flow</div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
                  <div className="text-2xl font-semibold text-white">Profiles</div>
                  <div className="mt-1 text-sm text-white/55">built to sell</div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-blue-500/18 via-transparent to-violet-500/14 blur-2xl" />

            <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8">
              <div className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
                    Relay access
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">
                    Log in to your account
                  </p>
                </div>

                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  Secure
                </div>
              </div>

              <div className="inline-flex items-center rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-white/70 backdrop-blur lg:hidden">
                Relay
              </div>

              <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Log in
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/62 sm:text-base">
                Access your listings, conversations, offers, and orders.
              </p>

              <form onSubmit={handleLogin} className="mt-8 space-y-5">
                <div>
                  <label className={labelClassName}>Email</label>
                  <input
                    type="email"
                    className={inputClassName}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className={labelClassName}>Password</label>
                    <button
                      type="button"
                      className="text-xs font-medium text-white/45 transition hover:text-white/70"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    className={inputClassName}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:scale-[1.01] hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Logging in..." : "Log in"}
                </button>
              </form>

              {message && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/70">
                  {message}
                </div>
              )}

              <div className="mt-6 border-t border-white/10 pt-6 text-sm text-white/58">
                Need an account?{" "}
                <Link
                  href="/auth/signup"
                  className="font-medium text-white underline underline-offset-4 transition hover:text-white/85"
                >
                  Sign up
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}