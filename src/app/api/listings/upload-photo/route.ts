import { NextRequest, NextResponse } from "next/server";
import { createServerClientInstance } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function getSafeExtension(file: File): string {
  const extensionFromName = file.name.split(".").pop()?.trim().toLowerCase();
  if (extensionFromName) {
    return extensionFromName.replace(/[^a-z0-9]/g, "") || "jpg";
  }

  const extensionFromType = file.type.split("/").pop()?.trim().toLowerCase();
  return extensionFromType?.replace(/[^a-z0-9]/g, "") || "jpg";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClientInstance();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No photo was provided." }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are supported." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Photo is too large. Maximum size is 10MB." }, { status: 400 });
    }

    const admin = createAdminClient();
    const extension = getSafeExtension(file);
    const filePath = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage
      .from("listing-images")
      .upload(filePath, buffer, {
        upsert: false,
        contentType: file.type || "image/jpeg",
      });

    if (uploadError) {
      console.error("Listing photo upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: publicUrlData } = admin.storage.from("listing-images").getPublicUrl(filePath);

    return NextResponse.json({
      path: filePath,
      url: publicUrlData.publicUrl,
    });
  } catch (error) {
    console.error("Listing photo upload route error:", error);
    return NextResponse.json({ error: "Failed to upload photo." }, { status: 500 });
  }
}
