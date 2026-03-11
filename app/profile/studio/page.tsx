import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileStudioForm from "@/app/components/profile-studio-form";

export default async function ProfileStudioPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profileResult, postsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(`
        id,
        username,
        display_name,
        bio,
        avatar_url,
        banner_url,
        theme_background,
        theme_card,
        theme_accent,
        theme_glow
      `)
      .eq("id", user.id)
      .single(),
    supabase
      .from("seller_posts")
      .select("id, caption, image_url, created_at")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (profileResult.error || !profileResult.data) {
    redirect("/onboarding");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#06070b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.12),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_24%)]" />
      <div className="absolute inset-0 bg-[#06070b]/80" />

      <div className="relative mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10 max-w-3xl">
          <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.24em] text-white/68 backdrop-blur">
            Relay Profile Studio
          </div>

          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Design your storefront.
          </h1>

          <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
            Customize your seller page, upload profile visuals, and publish posts.
          </p>
        </div>

        <ProfileStudioForm
          profile={profileResult.data}
          posts={postsResult.data ?? []}
        />
      </div>
    </main>
  );
}