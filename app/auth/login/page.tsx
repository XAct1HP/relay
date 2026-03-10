"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]";
  const labelClassName = "mb-2 block text-sm font-medium text-white/72";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06070b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(88,101,242,0.12),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_22%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_28%,rgba(255,255,255,0.01))]" />
      <div className="absolute inset-0 bg-[#06070b]/78" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="hidden lg:block">
            <div className="max-w-xl">
              <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white/68 backdrop-blur">
                Relay Marketplace
              </div>

              <h1 className="mt-8 text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white">
                Sign in and get back
                <span className="block text-white/62">to selling.</span>
              </h1>

              <p className="mt-6 max-w-lg text-lg leading-8 text-white/60">
                Manage listings, respond to offers, track orders, and keep your
                reseller profile moving from one premium workspace.
              </p>

              <div className="mt-10 grid max-w-lg grid-cols-3 gap-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur">
                  <p className="text-xl font-semibold text-white">Fast</p>
                  <p className="mt-1 text-sm text-white/46">listings</p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur">
                  <p className="text-xl font-semibold text-white">Live</p>
                  <p className="mt-1 text-sm text-white/46">offers</p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur">
                  <p className="text-xl font-semibold text-white">Clean</p>
                  <p className="mt-1 text-sm text-white/46">checkout</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 rounded-[2rem] bg-white/[0.04] blur-3xl" />

            <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
              <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/68 lg:hidden">
                Relay Marketplace
              </div>

              <div className="mt-2 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                    Account Access
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Log in
                  </h2>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/58">
                  Secure
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
                Welcome back. Enter your details to access your Relay account.
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
                      className="text-xs font-medium text-white/42 transition hover:text-white/68"
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
                  className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Logging in..." : "Log in"}
                </button>
              </form>

              {message && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/70">
                  {message}
                </div>
              )}

              <div className="mt-6 border-t border-white/10 pt-6 text-sm text-white/56">
                Need an account?{" "}
                <Link
                  href="/auth/signup"
                  className="font-medium text-white underline underline-offset-4 transition hover:text-white/84"
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