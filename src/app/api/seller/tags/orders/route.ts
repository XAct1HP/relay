import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: orders, error } = await supabase
      .from("tag_orders")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch tag orders:", error);
      return NextResponse.json({ error: "Failed to load tag orders" }, { status: 500 });
    }

    return NextResponse.json({ orders: orders || [] });
  } catch (error) {
    console.error("Tag orders error:", error);
    return NextResponse.json({ error: "Failed to load tag orders" }, { status: 500 });
  }
}
