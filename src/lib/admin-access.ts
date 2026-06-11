import "server-only";

import { NextRequest } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export async function requireAdminSession() {
  const supabase = await createServerClientInstance();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: adminProfile, error } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (error || adminProfile?.role !== "admin") {
    throw new Error("Forbidden");
  }

  return {
    user,
    supabase,
    adminClient: createAdminClient(),
  };
}

export async function requireAdminBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Unauthorized");
  }

  const token = authHeader.replace("Bearer ", "");
  const adminClient = createAdminClient();
  const {
    data: { user },
    error: authError,
  } = await adminClient.auth.getUser(token);

  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: adminProfile, error } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (error || adminProfile?.role !== "admin") {
    throw new Error("Forbidden");
  }

  return {
    user,
    adminClient,
  };
}
