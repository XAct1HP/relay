import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { parseTagImportText } from "@/lib/relay-tags";
import { logRelayAuditEvent } from "@/lib/relay-audit";

export async function GET(request: NextRequest) {
  try {
    const { adminClient } = await requireAdminSession();
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim().toLowerCase() || "";

    const tagsQuery = adminClient
      .from("relay_tags")
      .select(`
        *,
        seller:profiles!relay_tags_assigned_seller_id_fkey(id, username, display_name, full_name),
        order:orders!relay_tags_assigned_order_id_fkey(id)
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    const [tagsResult, sellersResult, requestsResult, countsResult] = await Promise.all([
      tagsQuery,
      adminClient
        .from("profiles")
        .select("id, username, display_name, full_name, seller_tier")
        .eq("role", "seller")
        .order("created_at", { ascending: false }),
      adminClient
        .from("seller_tag_requests")
        .select(`
          *,
          seller:profiles!seller_tag_requests_seller_id_fkey(id, username, display_name, full_name, seller_tier)
        `)
        .order("created_at", { ascending: false })
        .limit(100),
      adminClient
        .from("relay_tags")
        .select("status"),
    ]);

    if (tagsResult.error) {
      throw new Error(tagsResult.error.message);
    }

    const filteredTags = (tagsResult.data || []).filter((tag) => {
      if (!query) {
        return true;
      }

      const sellerName = [
        tag.seller?.display_name,
        tag.seller?.full_name,
        tag.seller?.username,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return [
        tag.tag_serial_number,
        tag.barcode_value,
        tag.source_batch_label,
        tag.order?.id,
        sellerName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });

    const tagCounts = (countsResult.data || []).reduce<Record<string, number>>((acc, tag) => {
      acc[tag.status] = (acc[tag.status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      tags: filteredTags,
      sellers: sellersResult.data || [],
      requests: requestsResult.data || [],
      counts: {
        unused: (tagCounts.unassigned || 0) + (tagCounts.assigned_to_seller || 0),
        assigned: tagCounts.assigned_to_seller || 0,
        used:
          (tagCounts.bound_to_order || 0) +
          (tagCounts.submitted_by_seller || 0) +
          (tagCounts.shipped || 0) +
          (tagCounts.buyer_scanned || 0) +
          (tagCounts.completed || 0),
        disputed: tagCounts.disputed || 0,
        voided: tagCounts.voided || 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Relay tags" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, adminClient } = await requireAdminSession();
    const body = await request.json();
    const action = body?.action as "create" | "import";
    const batchLabel = typeof body?.batchLabel === "string" ? body.batchLabel.trim() : null;
    const assignSellerId = typeof body?.assignSellerId === "string" && body.assignSellerId.trim() ? body.assignSellerId : null;
    const importedAt = new Date().toISOString();

    let rows: Array<{ tag_serial_number: string; barcode_value: string | null; assigned_seller_id: string | null; status: string; assigned_to_seller_at: string | null; assigned_by_admin_id: string | null; source_batch_label: string | null; imported_at: string }> = [];

    if (action === "create") {
      const serial = String(body?.serial || "").trim();
      if (!serial) {
        return NextResponse.json({ error: "Tag serial is required" }, { status: 400 });
      }

      rows = [{
        tag_serial_number: serial.toUpperCase(),
        barcode_value: body?.barcode ? String(body.barcode).trim().toUpperCase() : null,
        assigned_seller_id: assignSellerId,
        status: assignSellerId ? "assigned_to_seller" : "unassigned",
        assigned_to_seller_at: assignSellerId ? importedAt : null,
        assigned_by_admin_id: assignSellerId ? user.id : null,
        source_batch_label: batchLabel,
        imported_at: importedAt,
      }];
    } else if (action === "import") {
      const rawText = String(body?.rawText || "");
      const parsed = parseTagImportText(rawText);

      if (parsed.length === 0) {
        return NextResponse.json({ error: "No valid tag rows were found in the import input" }, { status: 400 });
      }

      rows = parsed.map((row) => ({
        tag_serial_number: row.serial,
        barcode_value: row.barcode,
        assigned_seller_id: assignSellerId,
        status: assignSellerId ? "assigned_to_seller" : "unassigned",
        assigned_to_seller_at: assignSellerId ? importedAt : null,
        assigned_by_admin_id: assignSellerId ? user.id : null,
        source_batch_label: batchLabel,
        imported_at: importedAt,
      }));
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const serials = rows.map((row) => row.tag_serial_number);
    const { data: existingTags, error: existingError } = await adminClient
      .from("relay_tags")
      .select("id, tag_serial_number")
      .in("tag_serial_number", serials);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const existingSerials = new Set((existingTags || []).map((tag) => tag.tag_serial_number));
    const insertRows = rows.filter((row) => !existingSerials.has(row.tag_serial_number));
    const skippedSerials = rows
      .filter((row) => existingSerials.has(row.tag_serial_number))
      .map((row) => row.tag_serial_number);

    let data: any[] = [];
    if (insertRows.length > 0) {
      const { data: insertedTags, error } = await adminClient
        .from("relay_tags")
        .insert(insertRows)
        .select("*");

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      data = insertedTags || [];
    }

    await logRelayAuditEvent(adminClient, {
      actorUserId: user.id,
      actorRole: "admin",
      eventType: "relay_tag.inventory_imported",
      sellerId: assignSellerId,
      metadata: {
        action,
        batchLabel,
        importedCount: rows.length,
      },
    });

    return NextResponse.json({
      tags: data || [],
      importedCount: insertRows.length,
      skippedSerials,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Relay tags" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 403 }
    );
  }
}
