"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  RefreshCw,
  Shield,
  Upload,
} from "lucide-react";
import {
  commitAdminInventoryIngestAction,
  listAdminInventorySellersAction,
  previewAdminInventoryIngestAction,
} from "@/app/admin/inventory-ingest/actions";
import type {
  AdminInventoryCommitReport,
  AdminInventoryPreviewReport,
  AdminInventoryPricingMode,
  AdminInventorySellerOption,
} from "@/lib/admin-inventory-ingest";
import { useAuth } from "@/hooks/useAuth";

const EMPTY_PREVIEW: AdminInventoryPreviewReport | null = null;

export default function AdminInventoryIngestPage() {
  const { currentUser, isLoading } = useAuth();
  const [selectedSellerId, setSelectedSellerId] = useState("");
  const [sellers, setSellers] = useState<AdminInventorySellerOption[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pricingMode, setPricingMode] = useState<AdminInventoryPricingMode>("balanced");
  const [reconcileMissing, setReconcileMissing] = useState(false);
  const [preview, setPreview] = useState<AdminInventoryPreviewReport | null>(EMPTY_PREVIEW);
  const [commitReport, setCommitReport] = useState<AdminInventoryCommitReport | null>(null);
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingSellers, setLoadingSellers] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;

    async function loadSellers() {
      setLoadingSellers(true);
      const result = await listAdminInventorySellersAction();
      if (!active) {
        return;
      }

      if (!result.success) {
        setPageError(result.error || "Failed to load sellers.");
        setLoadingSellers(false);
        return;
      }

      setSellers(result.sellers);
      setLoadingSellers(false);
      if (result.sellers.length > 0) {
        setSelectedSellerId((current) => current || result.sellers[0].id);
      }
    }

    loadSellers();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preview) {
      return;
    }

    setManualPrices((current) => {
      const next: Record<string, string> = {};
      for (const row of preview.preview_rows) {
        if (row.final_price === null) {
          next[row.key] = current[row.key] || "";
        }
      }
      return next;
    });
  }, [preview]);

  const pendingManualRows = useMemo(
    () => (preview?.preview_rows || []).filter((row) => row.final_price === null),
    [preview]
  );

  const canCommit = useMemo(() => {
    if (!selectedFile || !preview || isPending) {
      return false;
    }

    if (preview.preview_rows.length === 0) {
      return false;
    }

    return pendingManualRows.every((row) => {
      const value = Number.parseFloat(manualPrices[row.key] || "");
      return Number.isFinite(value) && value > 0;
    });
  }, [isPending, manualPrices, pendingManualRows, preview, selectedFile]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setPreview(null);
    setCommitReport(null);
    setPageError(null);
    setManualPrices({});
  };

  const runPreview = () => {
    if (!selectedSellerId) {
      setPageError("Choose a seller before previewing the upload.");
      return;
    }

    if (!selectedFile) {
      setPageError("Choose a spreadsheet before previewing the upload.");
      return;
    }

    setPageError(null);
    setCommitReport(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("seller_id", selectedSellerId);
      formData.set("pricing_mode", pricingMode);
      formData.set("reconcile_missing", reconcileMissing ? "true" : "false");
      formData.set("file", selectedFile);
      const nextPreview = await previewAdminInventoryIngestAction(formData);
      setPreview(nextPreview);
    });
  };

  const runCommit = () => {
    if (!canCommit || !selectedFile) {
      setPageError("Resolve all manual price gaps before committing this upload.");
      return;
    }

    setPageError(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("seller_id", selectedSellerId);
      formData.set("pricing_mode", pricingMode);
      formData.set("reconcile_missing", reconcileMissing ? "true" : "false");
      formData.set("manual_price_by_key", JSON.stringify(manualPrices));
      formData.set("file", selectedFile);
      const report = await commitAdminInventoryIngestAction(formData);
      setCommitReport(report);
    });
  };

  if (isLoading || loadingSellers) {
    return <div className="relay-card p-8 text-center text-white/60">Loading admin inventory ingest...</div>;
  }

  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="relay-card p-8 max-w-2xl">
        <h1 className="relay-title mb-3">Admin Inventory Ingest</h1>
        <p className="text-white/60">Only admins can access this workflow.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Inventory Ingest</h1>
          <p className="max-w-3xl text-sm text-white/60">
            Upload messy seller spreadsheets, review product matches, control pricing as an admin,
            and optionally reconcile missing inventory without touching the seller bulk import flow.
          </p>
        </div>
        <Link href="/admin" className="relay-button-secondary inline-flex items-center justify-center">
          Back to Admin
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="relay-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#5f8fff]/15 p-3 text-[#7ca6ff]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Admin Controls</h2>
              <p className="text-sm text-white/50">
                Sellers do not configure or run this workflow.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-white/70">Seller</span>
              <select
                value={selectedSellerId}
                onChange={(event) => {
                  setSelectedSellerId(event.target.value);
                  setPreview(null);
                  setCommitReport(null);
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#f5f7fb] outline-none focus:border-[#5f8fff]"
              >
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id} className="bg-[#111319]">
                    {formatSellerLabel(seller)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-white/70">Pricing policy</span>
              <select
                value={pricingMode}
                onChange={(event) => {
                  setPricingMode(event.target.value as AdminInventoryPricingMode);
                  setPreview(null);
                  setCommitReport(null);
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#f5f7fb] outline-none focus:border-[#5f8fff]"
              >
                <option value="aggressive" className="bg-[#111319]">
                  Aggressive: lowest ask - $1
                </option>
                <option value="balanced" className="bg-[#111319]">
                  Balanced: lowest ask
                </option>
                <option value="manual" className="bg-[#111319]">
                  Manual: require admin pricing
                </option>
              </select>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <input
              type="checkbox"
              checked={reconcileMissing}
              onChange={(event) => {
                setReconcileMissing(event.target.checked);
                setPreview(null);
                setCommitReport(null);
              }}
              className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 text-[#5f8fff] focus:ring-[#5f8fff]"
            />
            <div>
              <p className="text-sm font-medium text-[#f5f7fb]">Reconcile missing inventory</p>
              <p className="mt-1 text-sm text-white/55">
                If enabled, active variants missing from the latest uploaded sheet will be deactivated
                when the import is committed.
              </p>
            </div>
          </label>

          <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6">
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-white/5 p-4 text-white/70">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#f5f7fb]">
                  Upload seller spreadsheet
                </p>
                <p className="text-sm text-white/50">CSV only. Messy sheets are expected here.</p>
              </div>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="block w-full max-w-md text-sm text-white/60 file:mr-4 file:rounded-lg file:border-0 file:bg-[#5f8fff] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#709cff]"
              />
              {selectedFile && (
                <p className="text-xs text-white/45">Selected file: {selectedFile.name}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={runPreview}
              disabled={!selectedFile || !selectedSellerId || isPending}
              className="relay-button-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              Preview Upload
            </button>
            <button
              onClick={runCommit}
              disabled={!canCommit}
              className="relay-button-secondary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              Commit Inventory
            </button>
          </div>

          {pageError && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {pageError}
            </div>
          )}
          {preview && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/65">
              {preview.message}
            </div>
          )}
          {commitReport && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
              {commitReport.message}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="relay-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#f5f7fb]">Summary</h2>
            <div className="grid grid-cols-2 gap-3">
              <SummaryTile label="Rows Read" value={preview?.rows_read || 0} />
              <SummaryTile label="Rows Considered" value={preview?.source_rows_considered || 0} />
              <SummaryTile label="Ready" value={preview?.ready_rows || 0} tone="success" />
              <SummaryTile label="Needs Review" value={preview?.review_rows || 0} tone="warning" />
              <SummaryTile label="Blocked" value={preview?.blocked_rows || 0} tone="danger" />
              <SummaryTile label="Missing Active Variants" value={preview?.missing_variants.length || 0} />
            </div>
          </div>

          {(preview?.preview_rows || []).some((row) => row.final_price === null) && (
            <div className="relay-card p-6 space-y-4">
              <div className="flex items-center gap-2 text-[#f5f7fb]">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
                <h2 className="text-lg font-semibold">Manual Pricing Required</h2>
              </div>
              <div className="space-y-3">
                {pendingManualRows.map((row) => (
                  <div
                    key={row.key}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <p className="font-medium text-[#f5f7fb]">
                          {row.matched_product || row.source_name || row.source_sku}
                        </p>
                        <p className="text-sm text-white/50">
                          Size {row.size} | SKU {row.source_sku}
                        </p>
                      </div>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        value={manualPrices[row.key] || ""}
                        onChange={(event) =>
                          setManualPrices((current) => ({
                            ...current,
                            [row.key]: event.target.value,
                          }))
                        }
                        placeholder="Enter price"
                        className="w-full rounded-lg border border-white/10 bg-[#0f1218] px-3 py-2 text-sm text-[#f5f7fb] outline-none focus:border-[#5f8fff] lg:w-40"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {commitReport && (
            <div className="relay-card p-6 space-y-4">
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Commit Result</h2>
              <div className="grid grid-cols-2 gap-3">
                <SummaryTile label="Committed SKUs" value={commitReport.committed_skus} tone="success" />
                <SummaryTile label="Created SKUs" value={commitReport.created_skus} />
                <SummaryTile label="Updated SKUs" value={commitReport.updated_skus} />
                <SummaryTile label="Skipped SKUs" value={commitReport.skipped_skus} tone="warning" />
                <SummaryTile label="Deactivated Variants" value={commitReport.deactivated_variants} />
                <SummaryTile label="Row Errors" value={commitReport.row_errors.length} tone={commitReport.row_errors.length ? "danger" : "default"} />
              </div>
            </div>
          )}
        </div>
      </div>

      {preview && preview.missing_variants.length > 0 && (
        <div className="relay-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Missing Active Inventory</h2>
              <p className="text-sm text-white/50">
                These active variants are not present in the latest spreadsheet preview.
              </p>
            </div>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              {preview.missing_variants.length} variants
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-white/40">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-3 font-medium">Listing</th>
                  <th className="px-3 py-3 font-medium">SKU</th>
                  <th className="px-3 py-3 font-medium">Size</th>
                  <th className="px-3 py-3 font-medium">Qty</th>
                  <th className="px-3 py-3 font-medium">Price</th>
                  <th className="px-3 py-3 font-medium">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {preview.missing_variants.map((variant) => (
                  <tr key={variant.key} className="border-b border-white/5 text-white/70">
                    <td className="px-3 py-3">{variant.listing_title}</td>
                    <td className="px-3 py-3">{variant.normalized_sku}</td>
                    <td className="px-3 py-3">{variant.size}</td>
                    <td className="px-3 py-3">{variant.quantity}</td>
                    <td className="px-3 py-3">${variant.price.toFixed(2)}</td>
                    <td className="px-3 py-3">
                      {variant.resolution === "replaced_by_uploaded_sku"
                        ? "Will deactivate when that SKU is replaced"
                        : reconcileMissing
                        ? "Will deactivate on commit"
                        : "Only deactivates if reconciliation is enabled"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview && (
        <div className="relay-card p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[#f5f7fb]">Preview Rows</h2>
              <p className="text-sm text-white/50">
                Review confidence, pricing, and current seller inventory before committing.
              </p>
            </div>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              {preview.preview_rows.length} grouped rows
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-white/40">
                <tr className="border-b border-white/10">
                  <th className="px-3 py-3 font-medium">Action</th>
                  <th className="px-3 py-3 font-medium">Product</th>
                  <th className="px-3 py-3 font-medium">SKU</th>
                  <th className="px-3 py-3 font-medium">Size</th>
                  <th className="px-3 py-3 font-medium">Qty</th>
                  <th className="px-3 py-3 font-medium">Price</th>
                  <th className="px-3 py-3 font-medium">Current</th>
                  <th className="px-3 py-3 font-medium">Match</th>
                  <th className="px-3 py-3 font-medium">Warnings</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview_rows.map((row) => (
                  <tr key={row.key} className="border-b border-white/5 align-top text-white/75">
                    <td className="px-3 py-3">
                      <ActionBadge action={row.action} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[260px]">
                        <p className="font-medium text-[#f5f7fb]">
                          {row.matched_product || row.source_name || "Unknown product"}
                        </p>
                        <p className="text-xs text-white/40">
                          Rows {row.row_numbers.join(", ")}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-3">{row.source_sku || row.normalized_sku || "Missing"}</td>
                    <td className="px-3 py-3">{row.size}</td>
                    <td className="px-3 py-3">{row.quantity}</td>
                    <td className="px-3 py-3">
                      {row.final_price !== null ? `$${row.final_price.toFixed(2)}` : "Manual"}
                    </td>
                    <td className="px-3 py-3">
                      {row.existing_quantity !== null
                        ? `${row.existing_quantity} @ $${(row.existing_price || 0).toFixed(2)}`
                        : "None"}
                    </td>
                    <td className="px-3 py-3">
                      <MatchBadge confidence={row.match_confidence} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-[280px] space-y-1">
                        {row.action_reason && (
                          <p className="text-xs text-amber-200">{row.action_reason}</p>
                        )}
                        {row.warnings.length > 0 ? (
                          row.warnings.slice(0, 3).map((warning) => (
                            <p key={warning} className="text-xs text-white/45">
                              {warning}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-white/35">None</p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
      : tone === "warning"
      ? "border-amber-500/20 bg-amber-500/10 text-amber-100"
      : tone === "danger"
      ? "border-red-500/20 bg-red-500/10 text-red-100"
      : "border-white/10 bg-white/[0.03] text-[#f5f7fb]";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ActionBadge({ action }: { action: AdminInventoryPreviewReport["preview_rows"][number]["action"] }) {
  const style =
    action === "create"
      ? "bg-emerald-500/15 text-emerald-300"
      : action === "update"
      ? "bg-blue-500/15 text-blue-300"
      : action === "no_change"
      ? "bg-white/10 text-white/65"
      : action === "manual_review"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-red-500/15 text-red-300";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${style}`}>
      {action.replace("_", " ")}
    </span>
  );
}

function MatchBadge({
  confidence,
}: {
  confidence: AdminInventoryPreviewReport["preview_rows"][number]["match_confidence"];
}) {
  const style =
    confidence === "high"
      ? "bg-emerald-500/15 text-emerald-300"
      : confidence === "medium"
      ? "bg-blue-500/15 text-blue-300"
      : confidence === "low"
      ? "bg-amber-500/15 text-amber-300"
      : "bg-red-500/15 text-red-300";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${style}`}>
      {confidence}
    </span>
  );
}

function formatSellerLabel(seller: AdminInventorySellerOption) {
  return seller.display_name || seller.full_name || seller.username || seller.email;
}
