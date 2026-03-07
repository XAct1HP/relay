"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const supabase = createClient();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("username, bio")
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
        setChecking(false);
        return;
      }

      if (data) {
        setUsername(data.username ?? "");
        setBio(data.bio ?? "");
      }

      setChecking(false);
    }

    loadProfile();
  }, [router, supabase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    const cleanedUsername = username.trim().toLowerCase();

    if (cleanedUsername.length < 3) {
      setMessage("Username must be at least 3 characters.");
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        username: cleanedUsername,
        bio: bio.trim(),
      })
      .eq("id", user.id);

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push(`/profile/${cleanedUsername}`);
    router.refresh();
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-900">
        <div className="mx-auto max-w-xl">
          <p>Loading profile...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-slate-500">
            Relay
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Set up your profile</h1>
          <p className="mt-2 text-sm text-slate-600">
            Create your reseller identity.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Username</label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="midwestkicks"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Bio</label>
              <textarea
                className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Specializing in Jordan 1s, SB Dunks, and clean VNDS pairs."
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save profile"}
            </button>
          </form>

          {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </div>
      </div>
    </main>
  );
}