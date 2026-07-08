import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { buildFallbackUsername } from "@/lib/test-mode";

function generateStrongPassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*+=?";
  const all = upper + lower + digits + symbols;

  // Ensure at least one of each character class
  const seed = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];

  const remainingLength = Math.max(length - seed.length, 4);
  const buffer = new Uint32Array(remainingLength);
  crypto.getRandomValues(buffer);

  for (let i = 0; i < remainingLength; i++) {
    seed.push(all[buffer[i] % all.length]);
  }

  // Fisher-Yates shuffle
  for (let i = seed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [seed[i], seed[j]] = [seed[j], seed[i]];
  }

  return seed.join("");
}

function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
    const { adminClient } = await requireAdminSession();

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const rawDisplayName =
      typeof body?.displayName === "string" ? body.displayName.trim() : "";
    const displayName = rawDisplayName || email?.split("@")[0] || "Founding Seller";

    if (!email) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 }
      );
    }

    // Reject if the auth user already exists
    const { data: existingProfiles } = await adminClient
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .limit(1);

    if (existingProfiles && existingProfiles.length > 0) {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 }
      );
    }

    const password = generateStrongPassword(16);

    // Create the auth user (auto-confirm so they can log in immediately)
    const { data: createdUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          founding_seller: true,
          display_name: displayName,
        },
      });

    if (createError || !createdUser?.user) {
      return NextResponse.json(
        {
          error:
            createError?.message ||
            "Failed to create the founding seller account.",
        },
        { status: 500 }
      );
    }

    const userId = createdUser.user.id;

    // Upsert profile row with founding-seller privileges. Retry with a fresh
    // username suffix if the generated one collides with an existing profile.
    let profileError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const username = buildFallbackUsername(email);
      const { error } = await adminClient
        .from("profiles")
        .upsert(
          {
            id: userId,
            email,
            full_name: displayName,
            display_name: displayName,
            username,
            role: "seller",
            is_verified_seller: true,
            seller_application_status: "approved",
            onboarding_stripe_only: true,
          },
          { onConflict: "id" }
        );

      if (!error) {
        profileError = null;
        break;
      }

      profileError = error;
      const message = String(error.message || "").toLowerCase();
      const isUsernameCollision =
        message.includes("username") &&
        (message.includes("duplicate") || message.includes("unique"));
      if (!isUsernameCollision) {
        break;
      }
    }

    if (profileError) {
      // Best-effort cleanup so we don't leave an orphaned auth user
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      return NextResponse.json(
        {
          error: `Failed to create founding seller profile: ${profileError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
        displayName,
      },
      password,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create founding seller.";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
