"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";

/* ─── Section navigation ─── */
const sectionLinks = [
  { id: "authentication", label: "Authentication" },
  { id: "upsert", label: "Inventory Upsert" },
  { id: "variant", label: "Variant Update" },
  { id: "prices", label: "Bulk Price Update" },
  { id: "deactivate", label: "Deactivate Listing" },
  { id: "deactivate-variant", label: "Deactivate Variant" },
  { id: "errors", label: "Error Reference" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "environments", label: "Staging vs Production" },
  { id: "sku-behavior", label: "SKU & Catalog Behavior" },
  { id: "build-with-ai", label: "Build with AI" },
  { id: "flow", label: "Example Flow" },
];

/* ─── Built-for chips ─── */
const builtFor = [
  "KNET",
  "Inventory management tools",
  "High-volume resellers",
  "Custom integrations",
];

/* ─── Code examples ─── */

const upsertRequestJson = `{
  "items": [
    {
      "sku": "DZ5485-612",
      "variants": [
        { "size": "10", "quantity": 1, "price": 350 },
        { "size": "11", "quantity": 2, "price": 360 }
      ]
    }
  ]
}`;

const upsertResponseJson = `{
  "created_count": 2,
  "updated_count": 0,
  "skipped_count": 0,
  "item_errors": []
}`;

const variantUpdateRequestJson = `{
  "sku": "DZ5485-612",
  "size": "10",
  "quantity": 3,
  "price": 345,
  "active": true
}`;

const variantUpdateResponseJson = `{
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
}`;

const priceUpdateRequestJson = `{
  "updates": [
    { "sku": "DZ5485-612", "size": "10", "price": 345 },
    { "sku": "DZ5485-612", "size": "11", "price": 355 }
  ]
}`;

const priceUpdateResponseJson = `{
  "updated_count": 2,
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
    },
    {
      "item_index": 1,
      "sku": "DZ5485-612",
      "size": "11",
      "success": true,
      "listing_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
      "variant_id": "11223344-5566-7788-99aa-bbccddeeff00",
      "message": "Variant updated successfully."
    }
  ]
}`;

const deactivateListingRequestJson = `{
  "sku": "DZ5485-612"
}`;

const deactivateListingResponseJson = `{
  "sku": "DZ5485-612",
  "success": true,
  "listing_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "message": "Listing deactivated successfully."
}`;

const deactivateVariantRequestJson = `{
  "sku": "DZ5485-612",
  "size": "10"
}`;

const deactivateVariantResponseJson = `{
  "sku": "DZ5485-612",
  "size": "10",
  "success": true,
  "listing_id": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
  "variant_id": "f0e1d2c3-b4a5-6789-0abc-def123456789",
  "message": "Variant deactivated successfully."
}`;

const curlUpsertExample = `curl -X POST https://relayco.app/api/integrations/inventory/upsert \\
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
  }'`;

const tsUpsertExample = `const response = await fetch("https://relayco.app/api/integrations/inventory/upsert", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer relay_sk_test_xxxxxxxxxxxx",
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
});

const data = await response.json();
console.log(data);`;

const pyUpsertExample = `import requests

response = requests.post(
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

print(response.json())`;

/* ─── Error reference table data ─── */
const errorReference = [
  {
    status: 401,
    code: "invalid_api_key",
    message: "Invalid API key.",
    when: "Missing, malformed, revoked, or unrecognized API key in the Authorization header.",
  },
  {
    status: 403,
    code: "seller_not_approved",
    message: "Seller not approved.",
    when: "The API key belongs to a seller whose account is not approved or whose role is not 'seller'.",
  },
  {
    status: 400,
    code: "invalid_json",
    message: "Request body must be valid JSON.",
    when: "The request body cannot be parsed as JSON (SyntaxError).",
  },
  {
    status: 400,
    code: "invalid_request",
    message: "(varies by validation failure)",
    when: "Body validation failed. Examples: 'Request body must include an items array.', 'SKU is required.', 'Size is required.', 'Quantity must be an integer greater than or equal to 0.', 'Price must be greater than 0.', 'Active must be a boolean value.', 'Request body must include an updates array.'",
  },
  {
    status: 429,
    code: "rate_limited",
    message: "Rate limit exceeded. Max 60 requests per minute per API key. Try again in N seconds.",
    when: "More than 60 requests in a 60-second window from the same API key. The response includes a Retry-After header with seconds to wait.",
  },
  {
    status: 500,
    code: "internal_error",
    message: "Failed to process integration request.",
    when: "An unexpected server-side error occurred. The x-relay-request-id header can be used when contacting support.",
  },
];

/* ─── Reusable components ─── */

function DocCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="relay-card p-6 sm:p-8 scroll-mt-28">
      <div className="mb-5">
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
      </div>
      <div className="space-y-5 text-white/72">{children}</div>
    </section>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/50 transition hover:bg-white/10 hover:text-white/70"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="relay-card-soft overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
          {label}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-[#d8e4ff]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: "POST" | "PATCH" | "DELETE" }) {
  const colors = {
    POST: "bg-emerald-400/12 text-emerald-300",
    PATCH: "bg-blue-400/12 text-blue-200",
    DELETE: "bg-amber-400/12 text-amber-200",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${colors[method]}`}>
      {method}
    </span>
  );
}

function SchemaTable({
  title,
  rows,
}: {
  title: string;
  rows: { field: string; type: string; required?: boolean; description: string }[];
}) {
  return (
    <div className="overflow-x-auto">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-white/45">{title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/40">
            <th className="pb-2 pr-4 font-medium">Field</th>
            <th className="pb-2 pr-4 font-medium">Type</th>
            <th className="pb-2 pr-4 font-medium">Required</th>
            <th className="pb-2 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className="border-b border-white/5">
              <td className="py-2.5 pr-4 font-mono text-[#d8e4ff]">{row.field}</td>
              <td className="py-2.5 pr-4 text-white/50">{row.type}</td>
              <td className="py-2.5 pr-4">
                {row.required !== undefined ? (
                  <span className={row.required ? "text-emerald-300" : "text-white/30"}>
                    {row.required ? "Yes" : "No"}
                  </span>
                ) : (
                  <span className="text-white/20">&mdash;</span>
                )}
              </td>
              <td className="py-2.5 text-white/60">{row.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NotesBlock({ notes }: { notes: string[] }) {
  return (
    <div className="relay-card-soft p-5">
      <p className="text-sm font-semibold text-white">Notes / Behavior</p>
      <ul className="mt-3 space-y-2 text-sm text-white/62">
        {notes.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function CodeTabs({
  tabs,
}: {
  tabs: { label: string; code: string }[];
}) {
  const [activeTab, setActiveTab] = useState(0);
  return (
    <div className="relay-card-soft overflow-hidden">
      <div className="flex items-center gap-0 border-b border-white/10">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-3 text-xs font-medium uppercase tracking-[0.18em] transition ${
              activeTab === i
                ? "text-white bg-white/[0.04] border-b-2 border-[#7ca6ff]"
                : "text-white/40 hover:text-white/60"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="ml-auto pr-3">
          <CopyButton text={tabs[activeTab].code} />
        </div>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-[#d8e4ff]">
        <code>{tabs[activeTab].code}</code>
      </pre>
    </div>
  );
}

/* ─── Request header schema (shared across all endpoints) ─── */
const requestHeaderRows = [
  { field: "Authorization", type: "string", required: true, description: "Bearer <relay_sk_test_... or relay_sk_live_...>" },
  { field: "Content-Type", type: "string", required: true, description: "Must be application/json" },
];

/* ─── Page ─── */

export default function ApiPage() {
  return (
    <main className="relay-page">
      <Navbar />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-white/8 pt-[72px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,166,255,0.18),transparent_28%),radial-gradient(circle_at_78%_18%,rgba(0,194,255,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
        <div className="relay-container relative py-20 sm:py-24">
          <div className="max-w-4xl">
            <div className="relay-chip mb-6 w-fit">Relay Inventory API</div>

            <div className="relay-card-soft mb-6 inline-flex items-center gap-2 px-4 py-2.5">
              <span className="rounded-full bg-[#7ca6ff]/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#7ca6ff]">
                AI &amp; Agents
              </span>
              <span className="text-sm text-white/60">
                This page is optimized for AI coding tools. Claude Code, Codex, and Cursor can read the full spec at{" "}
                <code className="text-[#d8e4ff]">relayco.app/llms-full.txt</code> or{" "}
                <code className="text-[#d8e4ff]">relayco.app/openapi.json</code>
              </span>
            </div>

            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl md:text-6xl">
              Integrate Relay Into Your Inventory Workflow
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-relaxed text-white/62 sm:text-xl">
              Sync inventory, update pricing, manage variants, and automate listings through
              Relay&apos;s Inventory API.
            </p>

            <div className="mt-10 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="relay-card p-6 sm:p-7">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-300/70">
                  Overview
                </p>
                <div className="mt-4 space-y-3 text-white/68">
                  <p>Relay supports inventory synchronization through authenticated API keys.</p>
                  <p>Designed for reseller software, inventory tools, and large-volume sellers.</p>
                  <p>
                    Supports SKU-based inventory management, size variants, quantity tracking, and
                    dynamic repricing workflows.
                  </p>
                </div>
              </div>

              <div className="relay-card p-6 sm:p-7">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-300/70">
                  Built For
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {builtFor.map((item) => (
                    <span key={item} className="relay-chip">{item}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#upsert" className="relay-button-accent">
                Explore Endpoints
              </Link>
              <Link href="/auth/signup" className="relay-button-secondary">
                Start Selling on Relay
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Body: sidebar + content ── */}
      <section className="relay-container py-10 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">

          {/* Sticky sidebar */}
          <aside className="hidden lg:block lg:sticky lg:top-24 lg:self-start">
            <div className="relay-card p-5">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                Sections
              </p>
              <nav className="mt-4 space-y-1 relay-scrollbar max-h-[calc(100vh-220px)] overflow-y-auto">
                {sectionLinks.map((link) => (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    className="block rounded-xl px-3 py-2 text-sm text-white/62 transition hover:bg-white/[0.04] hover:text-white"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              <div className="mt-5 border-t border-white/10 pt-5">
                <Link href="/settings" className="relay-button-secondary w-full text-center text-xs">
                  Get API Key
                </Link>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="space-y-6">

            {/* ──────────── Authentication ──────────── */}
            <DocCard id="authentication" title="Authentication">
              <p>
                All requests require a bearer token. Approved sellers generate API keys from Relay
                seller settings. Keys are shown only once at creation and must be sent on every
                request via the <code>Authorization</code> header.
              </p>
              <CodeBlock label="Authorization Header" code="Authorization: Bearer relay_sk_test_xxxxxxxxxxxx" />
              <p>
                Preview and staging keys use the prefix <code>relay_sk_test_</code>. Production
                keys use <code>relay_sk_live_</code>. Keys are hashed with SHA-256 on the server
                and cannot be retrieved after creation.
              </p>
              <p>
                Every response includes an <code>x-relay-request-id</code> header (UUID) that can
                be referenced when contacting support.
              </p>
            </DocCard>

            {/* ──────────── Upsert ──────────── */}
            <DocCard id="upsert" title="Inventory Upsert">
              <div className="flex flex-wrap items-center gap-2">
                <MethodBadge method="POST" />
                <code className="text-sm text-[#d8e4ff]">/api/integrations/inventory/upsert</code>
              </div>
              <p>
                Create new SKU listings or merge inventory into existing ones. If the seller already
                has a listing for a given SKU, existing sizes are updated and new sizes are added. If
                the SKU does not exist, a new listing is created with all provided variants.
              </p>

              <SchemaTable
                title="Request Headers"
                rows={requestHeaderRows}
              />

              <SchemaTable
                title="Request Body"
                rows={[
                  { field: "items", type: "array", required: true, description: "Array of inventory items to upsert." },
                  { field: "items[].sku", type: "string", required: true, description: "Product SKU (e.g. 'DZ5485-612'). Normalized to uppercase before lookup." },
                  { field: "items[].variants", type: "array", required: true, description: "Array of size variants. At least one required." },
                  { field: "items[].variants[].size", type: "string", required: true, description: "Size label (e.g. '10', '11.5'). Must be unique within the item." },
                  { field: "items[].variants[].quantity", type: "integer", required: true, description: "Stock count. Must be an integer >= 0." },
                  { field: "items[].variants[].price", type: "number", required: true, description: "Price in USD. Must be greater than 0." },
                ]}
              />

              <SchemaTable
                title="Response Body (200)"
                rows={[
                  { field: "created_count", type: "integer", description: "Number of new variants created." },
                  { field: "updated_count", type: "integer", description: "Number of existing variants updated." },
                  { field: "skipped_count", type: "integer", description: "Number of variants skipped due to errors." },
                  { field: "item_errors", type: "array", description: "Array of per-item error objects with item_index, sku, field, and message." },
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <CodeBlock label="Request" code={upsertRequestJson} />
                <CodeBlock label="Response" code={upsertResponseJson} />
              </div>

              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">Multi-language examples</p>
              <CodeTabs
                tabs={[
                  { label: "cURL", code: curlUpsertExample },
                  { label: "TypeScript", code: tsUpsertExample },
                  { label: "Python", code: pyUpsertExample },
                ]}
              />

              <NotesBlock
                notes={[
                  "SKU is normalized (trimmed and uppercased) before lookup. 'dz5485-612' and 'DZ5485-612' resolve to the same listing.",
                  "Relay keeps one SKU listing per seller. Upserting a SKU you already have merges variants instead of creating a duplicate.",
                  "When a matching catalog product is found, the listing attaches to that catalog reference automatically.",
                  "If a SKU cannot be resolved to a catalog product, the item is skipped and returned in item_errors.",
                  "Duplicate sizes within a single item are rejected. Each variant must have a unique size.",
                  "Invalid rows are returned as item-level errors; valid rows in the same batch still process.",
                ]}
              />
            </DocCard>

            {/* ──────────── Variant Update ──────────── */}
            <DocCard id="variant" title="Variant Update">
              <div className="flex flex-wrap items-center gap-2">
                <MethodBadge method="PATCH" />
                <code className="text-sm text-[#d8e4ff]">/api/integrations/inventory/variant</code>
              </div>
              <p>
                Update a single variant by SKU and size. Use this for live quantity changes, price
                adjustments, and toggling a variant&apos;s active status. The variant must already
                exist (create it first via the upsert endpoint).
              </p>

              <SchemaTable title="Request Headers" rows={requestHeaderRows} />

              <SchemaTable
                title="Request Body"
                rows={[
                  { field: "sku", type: "string", required: true, description: "Product SKU. Normalized to uppercase." },
                  { field: "size", type: "string", required: true, description: "Size label of the variant to update." },
                  { field: "quantity", type: "integer", required: true, description: "New stock count. Must be an integer >= 0." },
                  { field: "price", type: "number", required: true, description: "New price in USD. Must be greater than 0." },
                  { field: "active", type: "boolean", required: true, description: "Whether the variant is available for purchase." },
                ]}
              />

              <SchemaTable
                title="Response Body (200)"
                rows={[
                  { field: "updated_count", type: "integer", description: "1 if the variant was updated, 0 otherwise." },
                  { field: "skipped_count", type: "integer", description: "1 if the update was skipped (not found)." },
                  { field: "item_results", type: "array", description: "Array with one result object." },
                  { field: "item_results[].item_index", type: "integer", description: "Always 0 for single variant updates." },
                  { field: "item_results[].sku", type: "string", description: "The SKU that was updated." },
                  { field: "item_results[].size", type: "string", description: "The size that was updated." },
                  { field: "item_results[].success", type: "boolean", description: "Whether the update succeeded." },
                  { field: "item_results[].listing_id", type: "string", description: "UUID of the parent listing (on success)." },
                  { field: "item_results[].variant_id", type: "string", description: "UUID of the updated variant (on success)." },
                  { field: "item_results[].message", type: "string", description: "Human-readable result message." },
                  { field: "item_results[].error", type: "string", description: "Error message if success is false." },
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <CodeBlock label="Request" code={variantUpdateRequestJson} />
                <CodeBlock label="Response" code={variantUpdateResponseJson} />
              </div>

              <NotesBlock
                notes={[
                  "The variant must already exist under the seller's SKU listing. If not found, the response returns success: false with an error directing you to use the upsert endpoint.",
                  "All five fields (sku, size, quantity, price, active) are required on every request.",
                  "Setting active to false soft-deactivates the variant without removing it.",
                ]}
              />
            </DocCard>

            {/* ──────────── Prices ──────────── */}
            <DocCard id="prices" title="Bulk Price Update">
              <div className="flex flex-wrap items-center gap-2">
                <MethodBadge method="PATCH" />
                <code className="text-sm text-[#d8e4ff]">/api/integrations/inventory/prices</code>
              </div>
              <p>
                Reprice multiple SKU-size pairs in a single request. Only the price field is changed;
                quantity and active status are preserved. Each update returns its own success or error
                result independently.
              </p>

              <SchemaTable title="Request Headers" rows={requestHeaderRows} />

              <SchemaTable
                title="Request Body"
                rows={[
                  { field: "updates", type: "array", required: true, description: "Array of price update objects." },
                  { field: "updates[].sku", type: "string", required: true, description: "Product SKU. Normalized to uppercase." },
                  { field: "updates[].size", type: "string", required: true, description: "Size label of the variant to reprice." },
                  { field: "updates[].price", type: "number", required: true, description: "New price in USD. Must be greater than 0." },
                ]}
              />

              <SchemaTable
                title="Response Body (200)"
                rows={[
                  { field: "updated_count", type: "integer", description: "Number of variants successfully repriced." },
                  { field: "skipped_count", type: "integer", description: "Number of variants that failed or were not found." },
                  { field: "item_results", type: "array", description: "Per-item result objects (same shape as variant update results)." },
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <CodeBlock label="Request" code={priceUpdateRequestJson} />
                <CodeBlock label="Response" code={priceUpdateResponseJson} />
              </div>

              <NotesBlock
                notes={[
                  "Only price is updated. Quantity and active status remain unchanged.",
                  "Each item in the updates array is processed independently. One failure does not roll back others.",
                  "Variants must already exist. Missing variants return success: false with a descriptive error.",
                ]}
              />
            </DocCard>

            {/* ──────────── Deactivate Listing ──────────── */}
            <DocCard id="deactivate" title="Deactivate Listing">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-400/12 px-3 py-1 text-xs font-semibold text-amber-200">POST</span>
                <code className="text-sm text-[#d8e4ff]">/api/integrations/inventory/deactivate</code>
              </div>
              <p>
                Soft-deactivate an entire SKU listing for the authenticated seller. All size
                variants become unavailable for purchase without deleting order history or removing
                the listing record.
              </p>

              <SchemaTable title="Request Headers" rows={requestHeaderRows} />

              <SchemaTable
                title="Request Body"
                rows={[
                  { field: "sku", type: "string", required: true, description: "Product SKU to deactivate. Normalized to uppercase." },
                ]}
              />

              <SchemaTable
                title="Response Body (200)"
                rows={[
                  { field: "sku", type: "string", description: "The SKU that was deactivated." },
                  { field: "success", type: "boolean", description: "Whether the deactivation succeeded." },
                  { field: "listing_id", type: "string", description: "UUID of the deactivated listing (on success)." },
                  { field: "message", type: "string", description: "Human-readable success message." },
                  { field: "error", type: "string", description: "Error message if success is false." },
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <CodeBlock label="Request" code={deactivateListingRequestJson} />
                <CodeBlock label="Response" code={deactivateListingResponseJson} />
              </div>

              <NotesBlock
                notes={[
                  "This is a soft deactivation. The listing and its variants remain in the database but are no longer purchasable.",
                  "If the SKU is not found for this seller, the response returns success: false.",
                  "Listings with status 'removed' are excluded from lookup.",
                ]}
              />
            </DocCard>

            {/* ──────────── Deactivate Variant ──────────── */}
            <DocCard id="deactivate-variant" title="Deactivate Variant">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-amber-400/12 px-3 py-1 text-xs font-semibold text-amber-200">POST</span>
                <code className="text-sm text-[#d8e4ff]">/api/integrations/inventory/deactivate-variant</code>
              </div>
              <p>
                Soft-deactivate a single size variant under a seller&apos;s SKU listing. The rest of
                the listing remains active. Use this when a specific size sells out but other sizes
                are still available.
              </p>

              <SchemaTable title="Request Headers" rows={requestHeaderRows} />

              <SchemaTable
                title="Request Body"
                rows={[
                  { field: "sku", type: "string", required: true, description: "Product SKU. Normalized to uppercase." },
                  { field: "size", type: "string", required: true, description: "Size label of the variant to deactivate." },
                ]}
              />

              <SchemaTable
                title="Response Body (200)"
                rows={[
                  { field: "sku", type: "string", description: "The SKU of the parent listing." },
                  { field: "size", type: "string", description: "The size that was deactivated." },
                  { field: "success", type: "boolean", description: "Whether the deactivation succeeded." },
                  { field: "listing_id", type: "string", description: "UUID of the parent listing (on success)." },
                  { field: "variant_id", type: "string", description: "UUID of the deactivated variant (on success)." },
                  { field: "message", type: "string", description: "Human-readable success message." },
                  { field: "error", type: "string", description: "Error message if success is false." },
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <CodeBlock label="Request" code={deactivateVariantRequestJson} />
                <CodeBlock label="Response" code={deactivateVariantResponseJson} />
              </div>

              <NotesBlock
                notes={[
                  "Sets is_active to false on the variant while preserving its price and quantity data.",
                  "If the SKU or size is not found for this seller, the response returns success: false.",
                  "To reactivate a deactivated variant, use the variant update endpoint with active: true.",
                ]}
              />
            </DocCard>

            {/* ──────────── Error Reference ──────────── */}
            <DocCard id="errors" title="Error Reference">
              <p>
                Every error response includes a JSON body with an <code>error</code> field. The
                table below covers all possible error responses across the API.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/40">
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Code</th>
                      <th className="pb-2 pr-4 font-medium">Message</th>
                      <th className="pb-2 font-medium">When it occurs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorReference.map((err) => (
                      <tr key={err.code} className="border-b border-white/5">
                        <td className="py-2.5 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            err.status < 500
                              ? err.status === 429
                                ? "bg-amber-400/12 text-amber-200"
                                : "bg-red-400/12 text-red-300"
                              : "bg-white/5 text-white/50"
                          }`}>
                            {err.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 font-mono text-[#d8e4ff]">{err.code}</td>
                        <td className="py-2.5 pr-4 text-white/60">{err.message}</td>
                        <td className="py-2.5 text-white/50 text-xs leading-relaxed">{err.when}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="relay-card-soft p-5">
                <p className="text-sm font-semibold text-white">Rate limit errors</p>
                <p className="mt-2 text-sm text-white/62">
                  When you receive a 429 response, read the <code>Retry-After</code> response header to
                  determine how many seconds to wait before retrying. The <code>x-relay-request-id</code>{" "}
                  header is included on all responses and can be used for debugging.
                </p>
              </div>
            </DocCard>

            {/* ──────────── Rate Limits ──────────── */}
            <DocCard id="rate-limits" title="Rate Limits">
              <p>
                Relay applies a rate limit of <strong>60 requests per minute per API key</strong>.
                This limit is enforced using a sliding window. When exceeded, the API returns{" "}
                <code>429 Too Many Requests</code> with a <code>Retry-After</code> header indicating
                how many seconds to wait.
              </p>
              <CodeBlock
                label="429 Response Example"
                code={`{
  "error": "Rate limit exceeded. Max 60 requests per minute per API key. Try again in 23 seconds."
}`}
              />
              <p>
                The <code>Retry-After</code> header value is in seconds. Implement exponential
                backoff or read this header directly for the most efficient retry strategy.
              </p>
            </DocCard>

            {/* ──────────── Environments ──────────── */}
            <DocCard id="environments" title="Staging vs Production">
              <p>
                Use staging API keys while building and validating your integration. Production keys
                should be stored securely and rotated from seller settings as needed.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="relay-card-soft p-5">
                  <p className="text-sm font-semibold text-white">Preview / Staging</p>
                  <p className="mt-2 text-sm text-white/62">
                    Key prefix: <code>relay_sk_test_</code>
                  </p>
                  <p className="mt-2 text-sm text-white/62">
                    Use on preview or staging deployments.
                  </p>
                </div>
                <div className="relay-card-soft p-5">
                  <p className="text-sm font-semibold text-white">Production</p>
                  <p className="mt-2 text-sm text-white/62">
                    Key prefix: <code>relay_sk_live_</code>
                  </p>
                  <p className="mt-2 text-sm text-white/62">
                    Base URL: <code>https://relayco.app</code>
                  </p>
                </div>
              </div>
            </DocCard>

            {/* ──────────── SKU Behavior ──────────── */}
            <DocCard id="sku-behavior" title="SKU & Catalog Behavior">
              <div className="space-y-3 text-white/62">
                <p>Relay keeps one SKU listing per seller for standard catalog inventory.</p>
                <p>Each listing can contain multiple size variants with independent quantity and price.</p>
                <p>Upsert requests merge into the seller&apos;s existing SKU listing instead of creating duplicates.</p>
                <p>Quantity is tracked at the size variant level and affects purchase availability immediately.</p>
                <p>
                  When Relay finds a matching catalog product, the seller listing attaches to that
                  catalog reference. If no match exists, the item is skipped and returned in
                  item_errors.
                </p>
              </div>
            </DocCard>

            {/* ──────────── Build with AI ──────────── */}
            <DocCard id="build-with-ai" title="Build with AI">
              <p>
                Relay publishes machine-readable API specs so AI coding tools can write integration
                code directly. All AI files are plain text with no HTML, so your tool sees only the
                spec, not the page chrome.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="relay-card-soft p-5">
                  <p className="text-sm font-semibold text-white">Claude Code</p>
                  <p className="mt-2 text-sm text-white/62">
                    Run <code>claude</code> in your terminal, then reference{" "}
                    <code>https://relayco.app/llms-full.txt</code> in your prompt for the complete
                    API spec.
                  </p>
                </div>
                <div className="relay-card-soft p-5">
                  <p className="text-sm font-semibold text-white">Codex / GPT</p>
                  <p className="mt-2 text-sm text-white/62">
                    Paste <code>https://relayco.app/openapi.json</code> as a reference. The OpenAPI
                    3.0 spec includes all endpoints, schemas, and examples.
                  </p>
                </div>
                <div className="relay-card-soft p-5">
                  <p className="text-sm font-semibold text-white">Cursor</p>
                  <p className="mt-2 text-sm text-white/62">
                    Add <code>https://relayco.app/llms.txt</code> to your docs index. Cursor will
                    use it to understand the API surface.
                  </p>
                </div>
                <div className="relay-card-soft p-5">
                  <p className="text-sm font-semibold text-white">Any AI Tool</p>
                  <p className="mt-2 text-sm text-white/62">
                    <code>llms.txt</code> is a short overview.{" "}
                    <code>llms-full.txt</code> is a complete reference. <code>openapi.json</code> is
                    the OpenAPI 3.0 spec. Pick whichever format your tool prefers.
                  </p>
                </div>
              </div>
            </DocCard>

            {/* ──────────── Example Flow ──────────── */}
            <DocCard id="flow" title="Example Integration Flow">
              <ol className="space-y-4 text-white/68">
                <li>
                  <strong className="text-white">1. Generate an API key</strong>
                  <div className="mt-1">Approved sellers generate a key from Relay seller settings. The full key is shown only once.</div>
                </li>
                <li>
                  <strong className="text-white">2. Authenticate requests</strong>
                  <div className="mt-1">Send the key as <code>Authorization: Bearer &lt;key&gt;</code> on every request.</div>
                </li>
                <li>
                  <strong className="text-white">3. Create inventory</strong>
                  <div className="mt-1">Use the upsert endpoint to create SKU listings with size variants. Relay matches against the catalog automatically.</div>
                </li>
                <li>
                  <strong className="text-white">4. Update prices and quantities</strong>
                  <div className="mt-1">Use the variant endpoint for single-item changes or the prices endpoint for bulk repricing.</div>
                </li>
                <li>
                  <strong className="text-white">5. Deactivate inventory</strong>
                  <div className="mt-1">Soft-deactivate entire listings or individual sizes when they should no longer sell.</div>
                </li>
              </ol>
            </DocCard>

          </div>
        </div>
      </section>
    </main>
  );
}
