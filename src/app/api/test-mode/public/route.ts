import { NextResponse } from "next/server";
import { isRelayTestModeEnabled } from "@/lib/test-mode";

export async function GET() {
  return NextResponse.json({
    enabled: isRelayTestModeEnabled(),
    marketplacePreviewEnabled: isRelayTestModeEnabled(),
  });
}
