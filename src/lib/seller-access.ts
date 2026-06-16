import "server-only";

import { createAdminClient } from "@/lib/supabase-admin";
import { createServerClientInstance } from "@/lib/supabase-server";

export async function requireSellerSession() {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, stripe_account_id, display_name, full_name, username, email")
    .eq("id", user.id)
    .single();

  if (error || !profile || profile.role !== "seller") {
    throw new Error("Forbidden");
  }

  return {
    user,
    profile,
    supabase,
    adminClient: createAdminClient(),
  };
}
