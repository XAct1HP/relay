"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";

/* ─────────────────────────────────────────────
   Navigation
   ───────────────────────────────────────────── */

const sections = [
  { id: "authentication", label: "Authentication" },
  { id: "upsert", label: "Inventory Upsert" },
  { id: "variant", label: "Variant Update" },
  { id: "prices", label: "Bulk Price Update" },
  { id: "deactivate", label: "Deactivate Listing" },
  { id: "deactivate-variant", label: "Deactivate Variant" },
  { id: "errors", label: "Error Reference" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "environments", label: "Environments" },
  { id: "sku-behavior", label: "SKU & Catalog" },
  { id: "build-with-ai", label: "Build with AI" },
  { id: "flow", label: "Example Flow" },
];

/* ─────────────────────────────────────────────
   Primitives
   ───────────────────────────────────────────── */

function Copy({ text }: { text: string }) {
  const [ok, set] = useState(false);
  const go = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      set(true);
      setTimeout(() => set(false), 1400);
    });
  }, [text]);
  return (
    <button
      onClick={go}
      className="absolute top-3 right-3 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-white/40 transition hover:bg-white/10 hover:text-white/70"
    >
      {ok ? "Copied" : "Copy"}
    </button>
  );
}

function Code({ label, code }: { label?: string; code: string }) {
  return (
    <div className="relative rounded-xl border border-white/8 bg-white/[0.025] overflow-hidden">
      {label && (
        <div className="border-b border-white/8 px-4 py-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">{label}</span>
        </div>
      )}
      <Copy text={code} />
      <pre className="overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed text-[#c9d6f0]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Tabs({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [i, setI] = useState(0);
  return (
    <div className="relative rounded-xl border border-white/8 bg-white/[0.025] overflow-hidden">
      <div className="flex border-b border-white/8">
        {tabs.map((t, idx) => (
          <button
            key={t.label}
            onClick={() => setI(idx)}
            className={`px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] transition ${
              idx === i ? "text-[#7ca6ff] border-b-2 border-[#7ca6ff] -mb-px" : "text-white/35 hover:text-white/55"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Copy text={tabs[i].code} />
      <pre className="overflow-x-auto px-4 py-3.5 text-[13px] leading-relaxed text-[#c9d6f0]">
        <code>{tabs[i].code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const c: Record<string, string> = {
    POST: "bg-emerald-500/15 text-emerald-400",
    PATCH: "bg-blue-500/15 text-blue-400",
    DELETE: "bg-red-500/15 text-red-400",
  };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${c[method] || "bg-white/10 text-white/60"}`}>
      {method}
    </span>
  );
}

function Param({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[12.5px] text-[#9db8e8]">{children}</code>;
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {head.map((h) => (
              <th key={h} className="py-2 pr-6 text-left text-[11px] font-medium uppercase tracking-wider text-white/40">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5">
              {row.map((cell, j) => (
                <td key={j} className={`py-2.5 pr-6 ${j === 0 ? "font-mono text-[13px] text-[#9db8e8]" : "text-white/55"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#7ca6ff]/15 bg-[#7ca6ff]/[0.04] px-5 py-4 text-sm text-white/65 leading-relaxed">
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Active section tracker
   ───────────────────────────────────────────── */

function useActiveSection() {
  const [active, setActive] = useState("authentication");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );
    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

/* ─────────────────────────────────────────────
   Page
   ───────────────────────────────────────────── */

export default function ApiPage() {
  const activeSection = useActiveSection();

  return (
    <main className="relative min-h-screen bg-transparent text-white">
      <Navbar />

      {/* ── Hero ── */}
      <div className="relative pt-[72px] border-b border-white/8 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: "url('/api-hero-bg.png')" }}
        />
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#7ca6ff]">
            Relay Inventory API
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            API Reference
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-white/55">
            Sync inventory, update pricing, manage variants, and automate listings
            for the Relay sneaker marketplace.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="#authentication" className="relay-button-accent text-sm">
              Get Started
            </Link>
            <Link href="/settings" className="relay-button-secondary text-sm">
              Get API Key
            </Link>
          </div>
          <p className="mt-8 text-xs text-white/30">
            AI &amp; Agents &mdash; Claude Code, Codex, and Cursor can read the full spec at{" "}
            <code className="text-white/45">relayco.app/llms-full.txt</code>{" "}
            or <code className="text-white/45">relayco.app/openapi.json</code>
          </p>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex w-full px-6 sm:px-10 lg:px-12 gap-6 sm:gap-10 lg:gap-12">

        {/* Sidebar */}
        <nav className="hidden lg:block w-48 flex-shrink-0 pt-10 sticky top-[92px] self-start max-h-[calc(100vh-120px)] overflow-y-auto relay-scrollbar">
          <div className="space-y-0.5">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`block rounded-lg px-3 py-1.5 text-[13px] transition ${
                  activeSection === s.id
                    ? "text-[#7ca6ff] bg-[#7ca6ff]/[0.06]"
                    : "text-white/40 hover:text-white/65"
                }`}
              >
                {s.label}
              </a>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1 py-10">
          <div className="space-y-20">

            {/* ─── Authentication ─── */}
            <section id="authentication" className="scroll-mt-28 space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Authentication</h2>
              <p className="text-[15px] leading-relaxed text-white/60">
                Every request must include a bearer token in the <Param>Authorization</Param> header.
                Approved sellers generate API keys from their Relay seller settings. Keys are shown
                only once at creation and are hashed with SHA-256 on the server.
              </p>
              <Code code="Authorization: Bearer relay_sk_test_xxxxxxxxxxxx" />
              <p className="text-[15px] leading-relaxed text-white/60">
                Staging keys use the prefix <Param>relay_sk_test_</Param>. Production keys
                use <Param>relay_sk_live_</Param>. Every response includes
                an <Param>x-relay-request-id</Param> header (UUID) for debugging.
              </p>
            </section>

            {/* ─── Upsert ─── */}
            <section id="upsert" className="scroll-mt-28 space-y-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <MethodBadge method="POST" />
                  <code className="text-[15px] text-white/70">/api/integrations/inventory/upsert</code>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Inventory Upsert</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                  Create new SKU listings or merge inventory into existing ones. If the seller
                  already has a listing for a given SKU, existing sizes update and new sizes are
                  added. If the SKU is new, a listing is created with all provided variants.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Request headers</h3>
                <Table
                  head={["Header", "Type", "Required", "Description"]}
                  rows={[
                    ["Authorization", "string", "Yes", "Bearer <API key>"],
                    ["Content-Type", "string", "Yes", "application/json"],
                  ]}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Request body</h3>
                <Table
                  head={["Field", "Type", "Required", "Description"]}
                  rows={[
                    ["items", "array", "Yes", "Array of inventory items to upsert."],
                    ["items[].sku", "string", "Yes", "Product SKU (e.g. DZ5485-612). Normalized to uppercase."],
                    ["items[].variants", "array", "Yes", "Size variants. At least one required."],
                    ["items[].variants[].size", "string", "Yes", "Size label (e.g. 10, 11.5). Unique within item."],
                    ["items[].variants[].quantity", "integer", "Yes", "Stock count. Integer >= 0."],
                    ["items[].variants[].price", "number", "Yes", "Price in USD. Must be > 0."],
                  ]}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Response <span className="text-white/40 font-normal">200</span></h3>
                <Table
                  head={["Field", "Type", "Description"]}
                  rows={[
                    ["created_count", "integer", "New variants created."],
                    ["updated_count", "integer", "Existing variants updated."],
                    ["skipped_count", "integer", "Variants skipped due to errors."],
                    ["item_errors", "array", "Per-item error objects (item_index, sku, field, message)."],
                  ]}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Code label="Request" code={`{
  "items": [
    {
      "sku": "DZ5485-612",
      "variants": [
        { "size": "10", "quantity": 1, "price": 350 },
        { "size": "11", "quantity": 2, "price": 360 }
      ]
    }
  ]
}`} />
                <Code label="Response" code={`{
  "created_count": 2,
  "updated_count": 0,
  "skipped_count": 0,
  "item_errors": []
}`} />
              </div>

              <Tabs tabs={[
                { label: "cURL", code: `curl -X POST https://relayco.app/api/integrations/inventory/upsert \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer relay_sk_test_xxxxxxxxxxxx" \\
  -d '{
    "items": [
      {
        "sku": "DZ5485-612",
        "variants": [
          { "size": "10", "quantity": 1, "price": 350 },
          { "size": "11", "quantity": 2, "price": 360 }
        ]
      }
    ]
  }'` },
                { label: "TypeScript", code: `const res = await fetch(
  "https://relayco.app/api/integrations/inventory/upsert",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer relay_sk_test_xxxxxxxxxxxx",
    },
    body: JSON.stringify({
      items: [
        {
          sku: "DZ5485-612",
          variants: [
            { size: "10", quantity: 1, price: 350 },
            { size: "11", quantity: 2, price: 360 },
          ],
        },
      ],
    }),
  }
);
const data = await res.json();` },
                { label: "Python", code: `import requests

res = requests.post(
    "https://relayco.app/api/integrations/inventory/upsert",
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer relay_sk_test_xxxxxxxxxxxx",
    },
    json={
        "items": [
            {
                "sku": "DZ5485-612",
                "variants": [
                    {"size": "10", "quantity": 1, "price": 350},
                    {"size": "11", "quantity": 2, "price": 360},
                ],
            }
        ]
    },
)
print(res.json())` },
              ]} />

              <Callout>
                <strong className="text-white/80">Notes.</strong>{" "}
                SKU is trimmed and uppercased before lookup. Relay keeps one listing per seller per
                SKU, so upserting an existing SKU merges variants. Matching catalog products are
                attached automatically; unresolved SKUs are skipped and returned in item_errors.
                Duplicate sizes within an item are rejected. Invalid rows are returned as item-level
                errors while valid rows in the same batch still process.
              </Callout>
            </section>

            {/* ─── Variant Update ─── */}
            <section id="variant" className="scroll-mt-28 space-y-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <MethodBadge method="PATCH" />
                  <code className="text-[15px] text-white/70">/api/integrations/inventory/variant</code>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Variant Update</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                  Update a single variant by SKU and size. Use this for live quantity changes, price
                  adjustments, and toggling a variant&apos;s active status. The variant must already
                  exist -- create it first via the upsert endpoint.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Request body</h3>
                <Table
                  head={["Field", "Type", "Required", "Description"]}
                  rows={[
                    ["sku", "string", "Yes", "Product SKU. Normalized to uppercase."],
                    ["size", "string", "Yes", "Size label of the variant to update."],
                    ["quantity", "integer", "Yes", "New stock count. Integer >= 0."],
                    ["price", "number", "Yes", "New price in USD. Must be > 0."],
                    ["active", "boolean", "Yes", "Whether the variant is purchasable."],
                  ]}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Response <span className="text-white/40 font-normal">200</span></h3>
                <Table
                  head={["Field", "Type", "Description"]}
                  rows={[
                    ["updated_count", "integer", "1 if updated, 0 otherwise."],
                    ["skipped_count", "integer", "1 if skipped."],
                    ["item_results", "array", "Single result object with item_index, sku, size, success, listing_id, variant_id, message/error."],
                  ]}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Code label="Request" code={`{
  "sku": "DZ5485-612",
  "size": "10",
  "quantity": 3,
  "price": 345,
  "active": true
}`} />
                <Code label="Response" code={`{
  "updated_count": 1,
  "skipped_count": 0,
  "item_results": [
    {
      "item_index": 0,
      "sku": "DZ5485-612",
      "size": "10",
      "success": true,
      "listing_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
      "variant_id": "f0e1d2c3-b4a5-6789-0abc-def123456789",
      "message": "Variant updated successfully."
    }
  ]
}`} />
              </div>

              <Callout>
                <strong className="text-white/80">Notes.</strong>{" "}
                All five fields are required on every request. If the variant is not found, the
                response returns success: false with an error directing you to the upsert endpoint.
                Setting active to false soft-deactivates the variant.
              </Callout>
            </section>

            {/* ─── Prices ─── */}
            <section id="prices" className="scroll-mt-28 space-y-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <MethodBadge method="PATCH" />
                  <code className="text-[15px] text-white/70">/api/integrations/inventory/prices</code>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Bulk Price Update</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                  Reprice multiple SKU-size pairs in one request. Only the price field is changed;
                  quantity and active status are preserved. Each update returns its own result.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Request body</h3>
                <Table
                  head={["Field", "Type", "Required", "Description"]}
                  rows={[
                    ["updates", "array", "Yes", "Array of price update objects."],
                    ["updates[].sku", "string", "Yes", "Product SKU. Normalized to uppercase."],
                    ["updates[].size", "string", "Yes", "Size label of the variant."],
                    ["updates[].price", "number", "Yes", "New price in USD. Must be > 0."],
                  ]}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Response <span className="text-white/40 font-normal">200</span></h3>
                <Table
                  head={["Field", "Type", "Description"]}
                  rows={[
                    ["updated_count", "integer", "Variants successfully repriced."],
                    ["skipped_count", "integer", "Variants that failed or were not found."],
                    ["item_results", "array", "Per-item result objects (same shape as variant update)."],
                  ]}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Code label="Request" code={`{
  "updates": [
    { "sku": "DZ5485-612", "size": "10", "price": 345 },
    { "sku": "DZ5485-612", "size": "11", "price": 355 }
  ]
}`} />
                <Code label="Response" code={`{
  "updated_count": 2,
  "skipped_count": 0,
  "item_results": [
    {
      "item_index": 0,
      "sku": "DZ5485-612",
      "size": "10",
      "success": true,
      "message": "Variant updated successfully."
    },
    {
      "item_index": 1,
      "sku": "DZ5485-612",
      "size": "11",
      "success": true,
      "message": "Variant updated successfully."
    }
  ]
}`} />
              </div>

              <Callout>
                <strong className="text-white/80">Notes.</strong>{" "}
                Each item is processed independently. One failure does not roll back others. Variants
                must already exist; missing variants return success: false.
              </Callout>
            </section>

            {/* ─── Deactivate Listing ─── */}
            <section id="deactivate" className="scroll-mt-28 space-y-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">POST</span>
                  <code className="text-[15px] text-white/70">/api/integrations/inventory/deactivate</code>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Deactivate Listing</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                  Soft-deactivate an entire SKU listing. All size variants become unavailable for
                  purchase without deleting order history or removing the listing record.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Request body</h3>
                <Table
                  head={["Field", "Type", "Required", "Description"]}
                  rows={[
                    ["sku", "string", "Yes", "Product SKU to deactivate. Normalized to uppercase."],
                  ]}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Response <span className="text-white/40 font-normal">200</span></h3>
                <Table
                  head={["Field", "Type", "Description"]}
                  rows={[
                    ["sku", "string", "The SKU that was deactivated."],
                    ["success", "boolean", "Whether the deactivation succeeded."],
                    ["listing_id", "string", "UUID of the listing (on success)."],
                    ["message", "string", "Success message."],
                    ["error", "string", "Error message if success is false."],
                  ]}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Code label="Request" code={`{
  "sku": "DZ5485-612"
}`} />
                <Code label="Response" code={`{
  "sku": "DZ5485-612",
  "success": true,
  "listing_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "message": "Listing deactivated successfully."
}`} />
              </div>

              <Callout>
                <strong className="text-white/80">Notes.</strong>{" "}
                This is a soft deactivation. The listing and variants remain in the database. If the
                SKU is not found for this seller, returns success: false. Listings with status
                &quot;removed&quot; are excluded from lookup.
              </Callout>
            </section>

            {/* ─── Deactivate Variant ─── */}
            <section id="deactivate-variant" className="scroll-mt-28 space-y-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="inline-block rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">POST</span>
                  <code className="text-[15px] text-white/70">/api/integrations/inventory/deactivate-variant</code>
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Deactivate Variant</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                  Soft-deactivate a single size variant under a SKU listing. The rest of the
                  listing remains active. Use this when a specific size sells out.
                </p>
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Request body</h3>
                <Table
                  head={["Field", "Type", "Required", "Description"]}
                  rows={[
                    ["sku", "string", "Yes", "Product SKU. Normalized to uppercase."],
                    ["size", "string", "Yes", "Size label to deactivate."],
                  ]}
                />
              </div>

              <div>
                <h3 className="mb-3 text-sm font-medium text-white/80">Response <span className="text-white/40 font-normal">200</span></h3>
                <Table
                  head={["Field", "Type", "Description"]}
                  rows={[
                    ["sku", "string", "SKU of the parent listing."],
                    ["size", "string", "The size that was deactivated."],
                    ["success", "boolean", "Whether it succeeded."],
                    ["listing_id", "string", "UUID of the parent listing (on success)."],
                    ["variant_id", "string", "UUID of the deactivated variant (on success)."],
                    ["message", "string", "Success message."],
                    ["error", "string", "Error message if success is false."],
                  ]}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Code label="Request" code={`{
  "sku": "DZ5485-612",
  "size": "10"
}`} />
                <Code label="Response" code={`{
  "sku": "DZ5485-612",
  "size": "10",
  "success": true,
  "listing_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "variant_id": "f0e1d2c3-b4a5-6789-0abc-def123456789",
  "message": "Variant deactivated successfully."
}`} />
              </div>

              <Callout>
                <strong className="text-white/80">Notes.</strong>{" "}
                Sets is_active to false. Price and quantity data are preserved. To reactivate, use
                the variant update endpoint with active: true.
              </Callout>
            </section>

            {/* ─── Error Reference ─── */}
            <section id="errors" className="scroll-mt-28 space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Error Reference</h2>
              <p className="text-[15px] leading-relaxed text-white/60">
                Every error response returns a JSON body with a
                single <Param>error</Param> string field.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-white/40">Status</th>
                      <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-white/40">Code</th>
                      <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-white/40">Message</th>
                      <th className="py-2 text-left text-[11px] font-medium uppercase tracking-wider text-white/40">When</th>
                    </tr>
                  </thead>
                  <tbody className="text-[13px]">
                    <tr className="border-b border-white/5">
                      <td className="py-2.5 pr-4"><span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-400">401</span></td>
                      <td className="py-2.5 pr-4 font-mono text-[#9db8e8]">invalid_api_key</td>
                      <td className="py-2.5 pr-4 text-white/55">Invalid API key.</td>
                      <td className="py-2.5 text-white/40">Missing, malformed, revoked, or unrecognized bearer token.</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2.5 pr-4"><span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-400">403</span></td>
                      <td className="py-2.5 pr-4 font-mono text-[#9db8e8]">seller_not_approved</td>
                      <td className="py-2.5 pr-4 text-white/55">Seller not approved.</td>
                      <td className="py-2.5 text-white/40">API key belongs to a non-approved seller account.</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2.5 pr-4"><span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-400">400</span></td>
                      <td className="py-2.5 pr-4 font-mono text-[#9db8e8]">invalid_json</td>
                      <td className="py-2.5 pr-4 text-white/55">Request body must be valid JSON.</td>
                      <td className="py-2.5 text-white/40">Body cannot be parsed as JSON.</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2.5 pr-4"><span className="rounded-md bg-red-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-red-400">400</span></td>
                      <td className="py-2.5 pr-4 font-mono text-[#9db8e8]">invalid_request</td>
                      <td className="py-2.5 pr-4 text-white/55">(varies)</td>
                      <td className="py-2.5 text-white/40">Body validation failed: missing fields, bad types, invalid values.</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2.5 pr-4"><span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-400">429</span></td>
                      <td className="py-2.5 pr-4 font-mono text-[#9db8e8]">rate_limited</td>
                      <td className="py-2.5 pr-4 text-white/55">Rate limit exceeded&hellip;</td>
                      <td className="py-2.5 text-white/40">Over 60 requests/min per key. Includes Retry-After header.</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-2.5 pr-4"><span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/50">500</span></td>
                      <td className="py-2.5 pr-4 font-mono text-[#9db8e8]">internal_error</td>
                      <td className="py-2.5 pr-4 text-white/55">Failed to process integration request.</td>
                      <td className="py-2.5 text-white/40">Unexpected server error. Use x-relay-request-id for support.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* ─── Rate Limits ─── */}
            <section id="rate-limits" className="scroll-mt-28 space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Rate Limits</h2>
              <p className="text-[15px] leading-relaxed text-white/60">
                The API enforces <strong className="text-white/80">60 requests per minute per API
                key</strong> using a sliding window. When exceeded, the response
                is <Param>429 Too Many Requests</Param> with
                a <Param>Retry-After</Param> header (seconds).
              </p>
              <Code label="429 Response" code={`{
  "error": "Rate limit exceeded. Max 60 requests per minute per API key. Try again in 23 seconds."
}`} />
            </section>

            {/* ─── Environments ─── */}
            <section id="environments" className="scroll-mt-28 space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Environments</h2>
              <p className="text-[15px] leading-relaxed text-white/60">
                Use staging keys while building your integration. Production keys should be stored
                securely and rotated from seller settings as needed.
              </p>
              <Table
                head={["Environment", "Key prefix", "Base URL"]}
                rows={[
                  ["Staging", "relay_sk_test_", "Your preview deployment"],
                  ["Production", "relay_sk_live_", "https://relayco.app"],
                ]}
              />
            </section>

            {/* ─── SKU Behavior ─── */}
            <section id="sku-behavior" className="scroll-mt-28 space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">SKU & Catalog Behavior</h2>
              <p className="text-[15px] leading-relaxed text-white/60">
                Relay keeps one SKU listing per seller. Each listing contains multiple size variants
                with independent quantity and price. Upsert requests merge into the existing listing
                instead of creating duplicates.
              </p>
              <p className="text-[15px] leading-relaxed text-white/60">
                Quantity is tracked at the variant level and affects purchase availability
                immediately. When a matching catalog product is found, the listing attaches to that
                reference automatically. Unresolved SKUs are skipped and returned in item_errors.
              </p>
            </section>

            {/* ─── Build with AI ─── */}
            <section id="build-with-ai" className="scroll-mt-28 space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Build with AI</h2>
              <p className="text-[15px] leading-relaxed text-white/60">
                Relay publishes machine-readable API specs so AI coding tools can generate
                integration code directly. All AI files are plain text with no HTML.
              </p>
              <Table
                head={["Tool", "How to use"]}
                rows={[
                  [
                    "Claude Code",
                    <>Run <Param>claude</Param> in your terminal, then reference <Param>https://relayco.app/llms-full.txt</Param> in your prompt.</>,
                  ],
                  [
                    "Codex / GPT",
                    <>Paste <Param>https://relayco.app/openapi.json</Param> as a reference. Full OpenAPI 3.0 spec.</>,
                  ],
                  [
                    "Cursor",
                    <>Add <Param>https://relayco.app/llms.txt</Param> to your docs index.</>,
                  ],
                  [
                    "Any tool",
                    <>Use <Param>llms.txt</Param> (overview), <Param>llms-full.txt</Param> (complete), or <Param>openapi.json</Param> (OpenAPI 3.0).</>,
                  ],
                ]}
              />
            </section>

            {/* ─── Example Flow ─── */}
            <section id="flow" className="scroll-mt-28 space-y-5">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Example Integration Flow</h2>
              <ol className="space-y-4 text-[15px] leading-relaxed text-white/60">
                <li>
                  <strong className="text-white/80">1. Generate an API key</strong>
                  <br />Approved sellers create a key from Relay seller settings. The full key is shown only once.
                </li>
                <li>
                  <strong className="text-white/80">2. Authenticate requests</strong>
                  <br />Send the key as <Param>Authorization: Bearer &lt;key&gt;</Param> on every request with <Param>Content-Type: application/json</Param>.
                </li>
                <li>
                  <strong className="text-white/80">3. Create inventory</strong>
                  <br />POST to <Param>/api/integrations/inventory/upsert</Param> with SKUs and size variants. Relay matches against the catalog automatically.
                </li>
                <li>
                  <strong className="text-white/80">4. Update prices and quantities</strong>
                  <br />Use the variant endpoint for single changes or the prices endpoint for bulk repricing.
                </li>
                <li>
                  <strong className="text-white/80">5. Deactivate inventory</strong>
                  <br />POST to <Param>/api/integrations/inventory/deactivate</Param> for full SKU deactivation or <Param>/api/integrations/inventory/deactivate-variant</Param> for a single size.
                </li>
              </ol>
            </section>
            <div className="h-24" />
          </div>
        </div>
      </div>
    </main>
  );
}
