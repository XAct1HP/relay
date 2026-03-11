"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type StudioProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  theme_background: string | null;
  theme_card: string | null;
  theme_accent: string | null;
  theme_glow: string | null;
};

type SellerPost = {
  id: string;
  caption: string | null;
  image_url: string | null;
  created_at: string;
};

type Props = {
  profile: StudioProfile;
  posts: SellerPost[];
};

const PROFILE_BUCKET = "profile-assets";
const POSTS_BUCKET = "seller-posts";
const MAX_ASSET_MB = 6;

const presets = [
  {
    name: "Midnight",
    background: "#0b1020",
    accent: "#8b5cf6",
    glow: "#8b5cf6",
    card: "#1a2033",
  },
  {
    name: "Arctic",
    background: "#08111f",
    accent: "#60a5fa",
    glow: "#60a5fa",
    card: "#182235",
  },
  {
    name: "Rose",
    background: "#140c16",
    accent: "#f472b6",
    glow: "#f472b6",
    card: "#2a1623",
  },
  {
    name: "Forest",
    background: "#0a1512",
    accent: "#34d399",
    glow: "#34d399",
    card: "#162922",
  },
];

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) return `rgba(255,255,255,${alpha})`;

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function ProfileStudioForm({ profile, posts }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [bannerUrl, setBannerUrl] = useState(profile.banner_url ?? "");
  const [themeBackground, setThemeBackground] = useState(profile.theme_background ?? "#0b1020");
  const [themeCard, setThemeCard] = useState(profile.theme_card ?? "#1a2033");
  const [themeAccent, setThemeAccent] = useState(profile.theme_accent ?? "#8b5cf6");
  const [themeGlow, setThemeGlow] = useState(profile.theme_glow ?? "#8b5cf6");

  const [postCaption, setPostCaption] = useState("");
  const [postImageUrl, setPostImageUrl] = useState("");

  const [savingAppearance, setSavingAppearance] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState<"avatar" | "banner" | "post" | null>(null);
  const [message, setMessage] = useState("");

  async function uploadFile(file: File, bucket: string, folder: string) {
    if (!file.type.startsWith("image/")) {
      throw new Error("Only image uploads are supported.");
    }

    if (file.size > MAX_ASSET_MB * 1024 * 1024) {
      throw new Error(`Image must be smaller than ${MAX_ASSET_MB} MB.`);
    }

    const ext = file.name.split(".").pop() || "png";
    const path = `${profile.id}/${folder}-${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleAppearanceSubmit(e: FormEvent) {
    e.preventDefault();
    setSavingAppearance(true);
    setMessage("");

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        banner_url: bannerUrl.trim() || null,
        theme_background: themeBackground.trim() || "#0b1020",
        theme_card: themeCard.trim() || "#1a2033",
        theme_accent: themeAccent.trim() || "#8b5cf6",
        theme_glow: themeGlow.trim() || "#8b5cf6",
      })
      .eq("id", profile.id);

    if (error) {
      setMessage(error.message);
      setSavingAppearance(false);
      return;
    }

    setSavingAppearance(false);
    setMessage("Storefront updated.");
    router.refresh();
  }

  async function handleCreatePost(e: FormEvent) {
    e.preventDefault();
    setSavingPost(true);
    setMessage("");

    if (!postCaption.trim() && !postImageUrl.trim()) {
      setMessage("Add a caption or an image to publish a post.");
      setSavingPost(false);
      return;
    }

    const { error } = await supabase.from("seller_posts").insert({
      profile_id: profile.id,
      caption: postCaption.trim() || null,
      image_url: postImageUrl.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      setSavingPost(false);
      return;
    }

    setPostCaption("");
    setPostImageUrl("");
    setSavingPost(false);
    setMessage("Post published.");
    router.refresh();
  }

  async function handleDeletePost(postId: string) {
    const confirmed = window.confirm("Delete this post?");
    if (!confirmed) return;

    setMessage("");

    const { error } = await supabase
      .from("seller_posts")
      .delete()
      .eq("id", postId)
      .eq("profile_id", profile.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.refresh();
  }

  async function handleAssetUpload(
    e: ChangeEvent<HTMLInputElement>,
    kind: "avatar" | "banner" | "post"
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAsset(kind);
      setMessage("");

      const bucket = kind === "post" ? POSTS_BUCKET : PROFILE_BUCKET;
      const folder = kind;
      const url = await uploadFile(file, bucket, folder);

      if (kind === "avatar") setAvatarUrl(url);
      if (kind === "banner") setBannerUrl(url);
      if (kind === "post") setPostImageUrl(url);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingAsset(null);
      e.target.value = "";
    }
  }

  function applyPreset(preset: (typeof presets)[number]) {
    setThemeBackground(preset.background);
    setThemeAccent(preset.accent);
    setThemeGlow(preset.glow);
    setThemeCard(preset.card);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="space-y-8">
        <form
          onSubmit={handleAppearanceSubmit}
          className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
        >
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.22em] text-white/38">
              Appearance
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Profile visuals
            </h2>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            {presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                className="rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                {preset.name}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/72">
                Display Name
              </label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Vaulted Soles"
                className="w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/72">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Curated pairs, rare sizes, and clean inventory shots."
                className="min-h-28 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/72">
                  Avatar / Logo
                </label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                    {uploadingAsset === "avatar" ? "Uploading..." : avatarUrl ? "Replace Avatar" : "Upload Avatar"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAssetUpload(e, "avatar")}
                    />
                  </label>
                  <span className="text-sm text-white/50">
                    {avatarUrl ? "Avatar uploaded" : "No avatar uploaded"}
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/72">
                  Banner
                </label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                    {uploadingAsset === "banner" ? "Uploading..." : bannerUrl ? "Replace Banner" : "Upload Banner"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAssetUpload(e, "banner")}
                    />
                  </label>
                  <span className="text-sm text-white/50">
                    {bannerUrl ? "Banner uploaded" : "No banner uploaded"}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/72">
                  Background Color
                </label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    value={themeBackground}
                    onChange={(e) => setThemeBackground(e.target.value)}
                    className="h-12 w-16 rounded-xl border border-white/10 bg-transparent"
                  />
                  <input
                    value={themeBackground}
                    onChange={(e) => setThemeBackground(e.target.value)}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/72">
                  Accent Color
                </label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    value={themeAccent}
                    onChange={(e) => setThemeAccent(e.target.value)}
                    className="h-12 w-16 rounded-xl border border-white/10 bg-transparent"
                  />
                  <input
                    value={themeAccent}
                    onChange={(e) => setThemeAccent(e.target.value)}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/72">
                  Card Background
                </label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    value={themeCard}
                    onChange={(e) => setThemeCard(e.target.value)}
                    className="h-12 w-16 rounded-xl border border-white/10 bg-transparent"
                  />
                  <input
                    value={themeCard}
                    onChange={(e) => setThemeCard(e.target.value)}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-white/72">
                  Glow Color
                </label>
                <div className="flex gap-3">
                  <input
                    type="color"
                    value={themeGlow}
                    onChange={(e) => setThemeGlow(e.target.value)}
                    className="h-12 w-16 rounded-xl border border-white/10 bg-transparent"
                  />
                  <input
                    value={themeGlow}
                    onChange={(e) => setThemeGlow(e.target.value)}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingAppearance}
            className="mt-6 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {savingAppearance ? "Saving..." : "Save Storefront"}
          </button>
        </form>

        <form
          onSubmit={handleCreatePost}
          className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl"
        >
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.22em] text-white/38">
              Feed
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Publish a post
            </h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/72">
                Caption
              </label>
              <textarea
                value={postCaption}
                onChange={(e) => setPostCaption(e.target.value)}
                placeholder="New inventory landing this week."
                className="min-h-28 w-full rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-white/20"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/72">
                Post Image
              </label>
              <div className="flex items-center gap-3">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-full border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]">
                  {uploadingAsset === "post" ? "Uploading..." : postImageUrl ? "Replace Post Image" : "Upload Post Image"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleAssetUpload(e, "post")}
                  />
                </label>
                <span className="text-sm text-white/50">
                  {postImageUrl ? "Post image uploaded" : "No post image uploaded"}
                </span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingPost}
            className="mt-6 rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {savingPost ? "Publishing..." : "Publish Post"}
          </button>
        </form>
      </div>

      <div className="space-y-8">
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-5 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
          <div
            className="overflow-hidden rounded-[1.75rem] border border-white/10"
            style={{ backgroundColor: themeBackground }}
          >
            <div className="relative h-44">
              {bannerUrl ? (
                <img
                  src={bannerUrl}
                  alt="Banner preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${withAlpha(themeAccent, 0.2)} 0%, rgba(255,255,255,0.06) 35%, rgba(0,0,0,0.1) 100%)`,
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
            </div>

            <div className="relative px-5 pb-5">
              <div className="-mt-12 flex items-end gap-4">
                <div className="relative h-24 w-24 overflow-hidden rounded-[1.5rem] border border-white/15 bg-black/25">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-2xl font-semibold text-white"
                      style={{ background: withAlpha(themeAccent, 0.2) }}
                    >
                      {profile.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                <div className="pb-1">
                  <p className="text-xl font-semibold text-white">
                    {displayName.trim() || `@${profile.username}`}
                  </p>
                  <p className="mt-1 text-sm text-white/58">@{profile.username}</p>
                </div>
              </div>

              <div
                className="mt-4 rounded-[1.25rem] border border-white/10 p-4"
                style={{ background: withAlpha(themeCard, 0.35) }}
              >
                <p className="text-sm leading-7 text-white/70">
                  {bio.trim() || "Your storefront bio will preview here."}
                </p>
              </div>
            </div>
          </div>

          <Link
            href={`/profile/${profile.username}`}
            className="mt-5 inline-flex rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            View live profile
          </Link>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-2xl">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.22em] text-white/38">
              Existing posts
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              Manage feed
            </h2>
          </div>

          {posts.length === 0 ? (
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-5 text-white/58">
              No posts yet.
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="overflow-hidden rounded-[1.4rem] border border-white/10 bg-white/[0.03]"
                >
                  {post.image_url && (
                    <div className="relative h-44">
                      <img
                        src={post.image_url}
                        alt="Post image"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}

                  <div className="p-4">
                    <p className="text-sm leading-7 text-white/72">
                      {post.caption || "Image-only post"}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-4">
                      <p className="text-xs text-white/40">
                        {new Date(post.created_at).toLocaleDateString()}
                      </p>

                      <button
                        type="button"
                        onClick={() => handleDeletePost(post.id)}
                        className="rounded-full border border-red-300/20 bg-red-300/[0.10] px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-300/[0.16]"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {message && (
            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/72">
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}