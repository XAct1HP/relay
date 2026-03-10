"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const supabase = createClient();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setMessage("Account created. You can now log in.");
    setLoading(false);
    router.push("/auth/login");
  }

  const inputClassName =
    "w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none transition placeholder:text-white/30 focus:border-white/20 focus:bg-white/[0.06]";
  const labelClassName = "mb-2 block text-sm font-medium text-white/72";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06070b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(129,140,248,0.12),transparent_24%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.05),transparent_24%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.02),transparent_25%,rgba(255,255,255,0.01))]" />
      <div className="absolute inset-0 bg-[#06070b]/78" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6 py-12">
        <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[0.92fr_1.08fr]">
          <div className="relative order-2 lg:order-1">
            <div className="absolute inset-0 rounded-[2rem] bg-white/[0.035] blur-3xl" />
            <div className="relative rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-white/38">
                    Create account
                  </p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                    Join Relay
                  </h1>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/58">
                  New seller
                </div>
              </div>

              <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
                Create your account to start listing sneakers, building your
                profile, and handling offers in one place.
              </p>

              <form onSubmit={handleSignup} className="mt-8 space-y-5">
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
                  <label className={labelClassName}>Password</label>
                  <input
                    type="password"
                    className={inputClassName}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a secure password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex w-full items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Creating account..." : "Create account"}
                </button>
              </form>

              {message && (
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white/70">
                  {message}
                </div>
              )}

              <div className="mt-6 border-t border-white/10 pt-6 text-sm text-white/56">
                Already have an account?{" "}
                <Link
                  href="/auth/login"
                  className="font-medium text-white underline underline-offset-4 transition hover:text-white/84"
                >
                  Log in
                </Link>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="mx-auto max-w-xl lg:ml-auto">
              <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white/68 backdrop-blur">
                Build your Relay identity
              </div>

              <h2 className="mt-8 text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white">
                Start with an account.
                <span className="block text-white/60">Grow into a brand.</span>
              </h2>

              <div className="mt-8 space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur">
                  <p className="text-base font-semibold text-white">Create your seller profile</p>
                  <p className="mt-2 text-sm leading-7 text-white/55">
                    Build trust with a username, bio, reviews, and order history.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur">
                  <p className="text-base font-semibold text-white">List and negotiate faster</p>
                  <p className="mt-2 text-sm leading-7 text-white/55">
                    Upload inventory, send offers, and move buyers through checkout.
                  </p>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur">
                  <p className="text-base font-semibold text-white">Keep everything in one system</p>
                  <p className="mt-2 text-sm leading-7 text-white/55">
                    Messages, orders, labels, and sales all live inside Relay.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}