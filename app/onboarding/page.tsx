"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function hasRequiredShippingProfile(profile: {
  ship_from_name?: string | null;
  ship_from_street1?: string | null;
  ship_from_city?: string | null;
  ship_from_state?: string | null;
  ship_from_zip?: string | null;
  ship_from_country?: string | null;
}) {
  return Boolean(
    profile.ship_from_name?.trim() &&
      profile.ship_from_street1?.trim() &&
      profile.ship_from_city?.trim() &&
      profile.ship_from_state?.trim() &&
      profile.ship_from_zip?.trim() &&
      profile.ship_from_country?.trim()
  );
}

export default function OnboardingPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  const [shipFromName, setShipFromName] = useState("");
  const [shipFromPhone, setShipFromPhone] = useState("");
  const [shipFromStreet1, setShipFromStreet1] = useState("");
  const [shipFromStreet2, setShipFromStreet2] = useState("");
  const [shipFromCity, setShipFromCity] = useState("");
  const [shipFromState, setShipFromState] = useState("");
  const [shipFromZip, setShipFromZip] = useState("");
  const [shipFromCountry, setShipFromCountry] = useState("US");

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [originalUsername, setOriginalUsername] = useState("");

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");
  const [isEditingExistingProfile, setIsEditingExistingProfile] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from("profiles")
        .select(`
          username,
          bio,
          ship_from_name,
          ship_from_phone,
          ship_from_street1,
          ship_from_street2,
          ship_from_city,
          ship_from_state,
          ship_from_zip,
          ship_from_country
        `)
        .eq("id", user.id)
        .single();

      if (error) {
        setMessage(error.message);
        setChecking(false);
        return;
      }

      if (data) {
        const loadedUsername = data.username ?? "";

        setUsername(loadedUsername);
        setOriginalUsername(loadedUsername);
        setBio(data.bio ?? "");
        setShipFromName(data.ship_from_name ?? "");
        setShipFromPhone(data.ship_from_phone ?? "");
        setShipFromStreet1(data.ship_from_street1 ?? "");
        setShipFromStreet2(data.ship_from_street2 ?? "");
        setShipFromCity(data.ship_from_city ?? "");
        setShipFromState(data.ship_from_state ?? "");
        setShipFromZip(data.ship_from_zip ?? "");
        setShipFromCountry(data.ship_from_country ?? "US");

        const hasStartedProfile = Boolean(
          (data.username ?? "").trim() || (data.bio ?? "").trim()
        );
        setIsEditingExistingProfile(hasStartedProfile);
      }

      setChecking(false);
    }

    loadProfile();
  }, [router, supabase]);

  async function isUsernameTaken(cleanedUsername: string, userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanedUsername)
      .neq("id", userId)
      .maybeSingle();

    if (error) {
      return { taken: false, error: error.message };
    }

    return { taken: Boolean(data), error: null as string | null };
  }

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
    const cleanedBio = bio.trim();
    const cleanedShipFromName = shipFromName.trim();
    const cleanedShipFromPhone = shipFromPhone.trim();
    const cleanedShipFromStreet1 = shipFromStreet1.trim();
    const cleanedShipFromStreet2 = shipFromStreet2.trim();
    const cleanedShipFromCity = shipFromCity.trim();
    const cleanedShipFromState = shipFromState.trim().toUpperCase();
    const cleanedShipFromZip = shipFromZip.trim();
    const cleanedShipFromCountry = shipFromCountry.trim().toUpperCase() || "US";

    if (cleanedUsername.length < 3) {
      setMessage("Username must be at least 3 characters.");
      setLoading(false);
      return;
    }

    if (!/^[a-z0-9_]+$/.test(cleanedUsername)) {
      setMessage("Username can only contain lowercase letters, numbers, and underscores.");
      setLoading(false);
      return;
    }

    if (!cleanedShipFromName) {
      setMessage("Ship-from name is required.");
      setLoading(false);
      return;
    }

    if (!cleanedShipFromStreet1) {
      setMessage("Ship-from street address is required.");
      setLoading(false);
      return;
    }

    if (!cleanedShipFromCity) {
      setMessage("Ship-from city is required.");
      setLoading(false);
      return;
    }

    if (!cleanedShipFromState) {
      setMessage("Ship-from state is required.");
      setLoading(false);
      return;
    }

    if (!cleanedShipFromZip) {
      setMessage("Ship-from ZIP code is required.");
      setLoading(false);
      return;
    }

    if (!cleanedShipFromCountry) {
      setMessage("Ship-from country is required.");
      setLoading(false);
      return;
    }

    const usernameChanged = cleanedUsername !== originalUsername.trim().toLowerCase();

    if (usernameChanged) {
      const usernameCheck = await isUsernameTaken(cleanedUsername, user.id);

      if (usernameCheck.error) {
        setMessage(usernameCheck.error);
        setLoading(false);
        return;
      }

      if (usernameCheck.taken) {
        setMessage("That username is already taken.");
        setLoading(false);
        return;
      }
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        username: cleanedUsername,
        bio: cleanedBio,
        ship_from_name: cleanedShipFromName,
        ship_from_phone: cleanedShipFromPhone || null,
        ship_from_street1: cleanedShipFromStreet1,
        ship_from_street2: cleanedShipFromStreet2 || null,
        ship_from_city: cleanedShipFromCity,
        ship_from_state: cleanedShipFromState,
        ship_from_zip: cleanedShipFromZip,
        ship_from_country: cleanedShipFromCountry,
      })
      .eq("id", user.id);

    if (error) {
      if (error.message.toLowerCase().includes("duplicate key")) {
        setMessage("That username is already taken.");
      } else {
        setMessage(error.message);
      }
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push(`/profile/${cleanedUsername}`);
    router.refresh();
  }

  if (checking) {
    return (
      <main className="relay-page">
        <div className="relay-site-bg" />
        <div className="relay-page-shell">
          <div className="mx-auto max-w-xl">
            <p className="text-white">Loading profile...</p>
          </div>
        </div>
      </main>
    );
  }

  const shippingComplete = hasRequiredShippingProfile({
    ship_from_name: shipFromName,
    ship_from_street1: shipFromStreet1,
    ship_from_city: shipFromCity,
    ship_from_state: shipFromState,
    ship_from_zip: shipFromZip,
    ship_from_country: shipFromCountry,
  });

  const inputClassName =
    "w-full rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-white/20";
  const labelClassName = "mb-2 block text-sm font-medium text-white/75";

  return (
    <main className="relay-page">
      <div className="relay-site-bg" />
      <div className="relay-page-shell">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="relay-eyebrow">Relay</p>
              <h1 className="relay-title">
                {isEditingExistingProfile ? "Edit your profile info" : "Set up your profile"}
              </h1>
              <p className="relay-subtitle">
                Manage your username, bio, and private ship-from details here.
              </p>
            </div>

            <Link
              href="/profile/studio"
              className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:bg-white/[0.06]"
            >
              Open Storefront Studio
            </Link>
          </div>

          {!shippingComplete && (
            <div className="mt-6 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/70 backdrop-blur-xl">
              Your ship-from address is required before you can finish onboarding.
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="mt-8 space-y-6 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-6 text-white shadow-[0_10px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl"
          >
            <div>
              <h2 className="text-lg font-semibold text-white">Public Profile</h2>
              <p className="mt-1 text-sm text-white/50">
                This information is visible on your Relay profile.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className={labelClassName}>Username</label>
                  <input
                    type="text"
                    className={inputClassName}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="midwestkicks"
                    required
                  />
                  <p className="mt-2 text-xs text-white/45">
                    Must be unique. Use lowercase letters, numbers, and underscores only.
                  </p>
                </div>

                <div>
                  <label className={labelClassName}>Bio</label>
                  <textarea
                    className="min-h-28 w-full rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-2 text-white outline-none placeholder:text-white/30 focus:border-white/20"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Specializing in Jordan 1s, SB Dunks, and clean VNDS pairs."
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <h2 className="text-lg font-semibold text-white">Private Shipping Profile</h2>
              <p className="mt-1 text-sm text-white/50">
                This is private and only used for shipping quotes and prepaid labels.
                It is never shown on your public profile.
              </p>

              <div className="mt-4 space-y-4">
                <div>
                  <label className={labelClassName}>Ship-From Name</label>
                  <input
                    type="text"
                    className={inputClassName}
                    value={shipFromName}
                    onChange={(e) => setShipFromName(e.target.value)}
                    placeholder="Xavier Aviles"
                    required
                  />
                </div>

                <div>
                  <label className={labelClassName}>Phone</label>
                  <input
                    type="text"
                    className={inputClassName}
                    value={shipFromPhone}
                    onChange={(e) => setShipFromPhone(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div>
                  <label className={labelClassName}>Street Address</label>
                  <input
                    type="text"
                    className={inputClassName}
                    value={shipFromStreet1}
                    onChange={(e) => setShipFromStreet1(e.target.value)}
                    placeholder="123 Main St"
                    required
                  />
                </div>

                <div>
                  <label className={labelClassName}>Apt / Unit</label>
                  <input
                    type="text"
                    className={inputClassName}
                    value={shipFromStreet2}
                    onChange={(e) => setShipFromStreet2(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label className={labelClassName}>City</label>
                    <input
                      type="text"
                      className={inputClassName}
                      value={shipFromCity}
                      onChange={(e) => setShipFromCity(e.target.value)}
                      placeholder="Detroit"
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClassName}>State</label>
                    <input
                      type="text"
                      className={inputClassName}
                      value={shipFromState}
                      onChange={(e) => setShipFromState(e.target.value)}
                      placeholder="MI"
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClassName}>ZIP</label>
                    <input
                      type="text"
                      className={inputClassName}
                      value={shipFromZip}
                      onChange={(e) => setShipFromZip(e.target.value)}
                      placeholder="48197"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClassName}>Country</label>
                  <input
                    type="text"
                    className={inputClassName}
                    value={shipFromCountry}
                    onChange={(e) => setShipFromCountry(e.target.value)}
                    placeholder="US"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 font-medium text-white transition hover:bg-white/[0.12] disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save profile"}
            </button>

            {message && <p className="text-sm text-white/65">{message}</p>}
          </form>
        </div>
      </div>
    </main>
  );
}