"use client";

import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";

const builtFor = [
  "KNET",
  "Inventory management tools",
  "High-volume resellers",
  "Custom integrations",
];

const sectionLinks = [
  { id: "authentication", label: "Authentication" },
  { id: "upsert", label: "Inventory Upsert" },
  { id: "updates", label: "Inventory Updates" },
  { id: "deactivation", label: "Inventory Deactivation" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "environments", label: "Staging vs Production" },
  { id: "sku-behavior", label: "SKU & Catalog Behavior" },
  { id: "flow", label: "Example Flow" },
];

const authExample = `Authorization: Bearer relay_sk_test_xxxxx`;

const upsertRequest = `{
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

const upsertResponse = `{
  "created_count": 2,
  "updated_count": 0,
  "skipped_count": 0,
  "item_errors": []
}`;

const variantUpdateRequest = `{
  "sku": "DZ5485-612",
  "size": "10",
  "quantity": 3,
  "price": 345,
  "active": true
}`;

const variantUpdateResponse = `{
  "updated_count": 1,
  "skipped_count": 0,
  "item_results": [
    {
      "item_index": 0,
      "sku": "DZ5485-612",
      "size": "10",
      "success": true,
      "listing_id": "listing_uuid",
      "variant_id": "variant_uuid",
      "message": "Variant updated successfully."
    }
  ]
}`;

const priceUpdateRequest = `{
  "updates": [
    { "sku": "DZ5485-612", "size": "10", "price": 345 },
    { "sku": "DZ5485-612", "size": "11", "price": 355 }
  ]
}`;

const priceUpdateResponse = `{
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
}`;

const deactivateListingRequest = `{
  "sku": "DZ5485-612"
}`;

const deactivateVariantRequest = `{
  "sku": "DZ5485-612",
  "size": "10"
}`;

const deactivateResponse = `{
  "sku": "DZ5485-612",
  "success": true,
  "listing_id": "listing_uuid",
  "message": "Listing deactivated successfully."
}`;

const deactivateVariantResponse = `{
  "sku": "DZ5485-612",
  "size": "10",
  "success": true,
  "listing_id": "listing_uuid",
  "variant_id": "variant_uuid",
  "message": "Variant deactivated successfully."
}`;

const rateLimitResponse = `{
  "error": "Rate limit exceeded. Max 60 requests per minute per API key. Try again in 23 seconds."
}`;

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

function CodeBlock({
  label,
  code,
}: {
  label: string;
  code: string;
}) {
  return (
    <div className="relay-card-soft overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
          {label}
        </span>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-sm leading-6 text-[#d8e4ff]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function ApiPage() {
  const baseUrl =
    typeof window === "undefined" ? "https://your-relay-domain.com" : window.location.origin;

  return (
    <main className="relay-page">
      <Navbar />

      <section className="relative overflow-hidden border-b border-white/8 pt-[72px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,166,255,0.18),transparent_28%),radial-gradient(circle_at_78%_18%,rgba(0,194,255,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
        <div className="relay-container relative py-20 sm:py-24">
          <div className="max-w-4xl">
            <div className="relay-chip mb-6 w-fit">Relay Inventory API</div>
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
                  <p>
                    Designed for reseller software, inventory tools, and large-volume sellers.
                  </p>
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
                    <span key={item} className="relay-chip">
                      {item}
                    </span>
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

      <section className="relay-container py-10 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="relay-card p-5">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/45">
                Sections
              </p>
              <nav className="mt-4 space-y-2">
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
            </div>
          </aside>

          <div className="space-y-6">
            <DocCard id="authentication" title="1. Authentication">
              <p>
                Approved sellers generate API keys from Relay seller settings. Keys are shown only
                once at creation and are sent on every request using a bearer token.
              </p>
              <CodeBlock label="Authorization Header" code={authExample} />
              <p>
                Preview and staging keys use the format <code>relay_sk_test_...</code>. Production
                keys use <code>relay_sk_live_...</code>.
              </p>
            </DocCard>

            <DocCard id="upsert" title="2. Inventory Upsert">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-400/12 px-3 py-1 text-xs font-semibold text-emerald-300">
                  POST
                </span>
                <code className="text-sm text-[#d8e4ff]">/api/integrations/inventory/upsert</code>
              </div>
              <p>
                Use upsert to create SKU listings or merge inventory into an existing seller SKU
                listing. If the seller already has the SKU, existing sizes update and new sizes are
                added.
              </p>
              <div className="grid gap-4 xl:grid-cols-2">
                <CodeBlock label="Request Example" code={upsertRequest} />
                <CodeBlock label="Response Example" code={upsertResponse} />
              </div>
              <div className="relay-card-soft p-5">
                <p className="text-sm font-semibold text-white">Validation behavior</p>
                <ul className="mt-3 space-y-2 text-sm text-white/62">
                  <li>SKU is required and normalized before lookup.</li>
                  <li>Every variant must include size, integer quantity, and price greater than 0.</li>
                  <li>Catalog matches attach to the existing catalog product when available.</li>
                  <li>Missing or invalid rows are returned as item-level errors.</li>
                </ul>
              </div>
            </DocCard>

            <DocCard id="updates" title="3. Inventory Updates">
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-400/12 px-3 py-1 text-xs font-semibold text-blue-200">
                      PATCH
                    </span>
                    <code className="text-sm text-[#d8e4ff]">
                      /api/integrations/inventory/variant
                    </code>
                  </div>
                  <p className="mt-3 text-white/62">
                    Update one exact variant by SKU and size. This is the best path for live
                    quantity changes, price changes, and reactivating inventory.
                  </p>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <CodeBlock label="Variant Update Request" code={variantUpdateRequest} />
                    <CodeBlock label="Variant Update Response" code={variantUpdateResponse} />
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-400/12 px-3 py-1 text-xs font-semibold text-blue-200">
                      PATCH
                    </span>
                    <code className="text-sm text-[#d8e4ff]">
                      /api/integrations/inventory/prices
                    </code>
                  </div>
                  <p className="mt-3 text-white/62">
                    Apply bulk repricing across specific SKU-size pairs. Each item returns its own
                    success or error result.
                  </p>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <CodeBlock label="Bulk Price Request" code={priceUpdateRequest} />
                    <CodeBlock label="Bulk Price Response" code={priceUpdateResponse} />
                  </div>
                </div>
              </div>
            </DocCard>

            <DocCard id="deactivation" title="4. Inventory Deactivation">
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-400/12 px-3 py-1 text-xs font-semibold text-amber-200">
                      POST
                    </span>
                    <code className="text-sm text-[#d8e4ff]">
                      /api/integrations/inventory/deactivate
                    </code>
                  </div>
                  <p className="mt-3 text-white/62">
                    Soft deactivate an entire SKU listing for the authenticated seller. All sizes
                    become unavailable without deleting order history.
                  </p>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <CodeBlock label="Listing Deactivate Request" code={deactivateListingRequest} />
                    <CodeBlock label="Listing Deactivate Response" code={deactivateResponse} />
                  </div>
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-400/12 px-3 py-1 text-xs font-semibold text-amber-200">
                      POST
                    </span>
                    <code className="text-sm text-[#d8e4ff]">
                      /api/integrations/inventory/deactivate-variant
                    </code>
                  </div>
                  <p className="mt-3 text-white/62">
                    Soft deactivate one size under a seller SKU listing while preserving the rest of
                    the listing.
                  </p>
                  <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <CodeBlock label="Variant Deactivate Request" code={deactivateVariantRequest} />
                    <CodeBlock label="Variant Deactivate Response" code={deactivateVariantResponse} />
                  </div>
                </div>
              </div>
            </DocCard>

            <DocCard id="rate-limits" title="5. Rate Limits">
              <p>
                Relay currently applies a basic integration rate limit of <strong>60 requests per
                minute per API key</strong>.
              </p>
              <p>
                When the limit is exceeded, the API returns <code>429 Too Many Requests</code> with
                a clear error message and a <code>Retry-After</code> response header.
              </p>
              <CodeBlock label="429 Response Example" code={rateLimitResponse} />
            </DocCard>

            <DocCard id="environments" title="6. Staging vs Production">
              <p>
                Use preview or staging API keys while validating integrations. Keep live production
                keys separate and rotate them from seller settings as needed.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="relay-card-soft p-5">
                  <p className="text-sm font-semibold text-white">Preview / Staging</p>
                  <p className="mt-2 text-sm text-white/62">
                    Key prefix: <code>relay_sk_test_...</code>
                  </p>
                  <p className="mt-2 text-sm text-white/62">
                    Base URL: <code>{baseUrl}</code> on your preview or staging deployment.
                  </p>
                </div>
                <div className="relay-card-soft p-5">
                  <p className="text-sm font-semibold text-white">Production</p>
                  <p className="mt-2 text-sm text-white/62">
                    Key prefix: <code>relay_sk_live_...</code>
                  </p>
                  <p className="mt-2 text-sm text-white/62">
                    Base URL: <code>https://your-production-relay-domain.com</code>
                  </p>
                </div>
              </div>
            </DocCard>

            <DocCard id="sku-behavior" title="7. SKU & Catalog Behavior">
              <div className="space-y-3 text-white/62">
                <p>Relay keeps one SKU listing per seller for standard catalog inventory.</p>
                <p>Each listing can contain multiple size variants with independent quantity and price.</p>
                <p>Upsert requests merge into the seller&apos;s existing SKU listing instead of creating duplicates.</p>
                <p>Quantity is tracked at the size variant level and affects purchase availability immediately.</p>
                <p>
                  When Relay finds a matching catalog product, the seller listing attaches to that
                  catalog reference. If no match exists, current integration behavior follows Relay&apos;s
                  placeholder catalog flow.
                </p>
              </div>
            </DocCard>

            <DocCard id="flow" title="8. Example Integration Flow">
              <ol className="space-y-4 text-white/68">
                <li>
                  <strong className="text-white">1. Generate an API key</strong>
                  <div className="mt-1">Approved sellers generate a key from Relay seller settings.</div>
                </li>
                <li>
                  <strong className="text-white">2. Authenticate requests</strong>
                  <div className="mt-1">Send the key as a bearer token on every inventory request.</div>
                </li>
                <li>
                  <strong className="text-white">3. Create inventory</strong>
                  <div className="mt-1">Use the upsert endpoint to create SKU listings and size variants.</div>
                </li>
                <li>
                  <strong className="text-white">4. Update prices</strong>
                  <div className="mt-1">Use the variant or prices endpoints for live repricing workflows.</div>
                </li>
                <li>
                  <strong className="text-white">5. Deactivate inventory</strong>
                  <div className="mt-1">Soft deactivate listings or individual sizes when they should no longer sell.</div>
                </li>
              </ol>
            </DocCard>
          </div>
        </div>
      </section>
    </main>
  );
}
