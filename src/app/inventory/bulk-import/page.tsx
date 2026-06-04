"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, RefreshCw, Upload } from "lucide-react";
import { commitBulkInventoryImportAction, previewBulkInventoryImportAction } from "@/app/inventory/actions";
import { useAuth } from "@/hooks/useAuth";
import type { InventoryImportReport } from "@/lib/inventory-import";

const EXAMPLE_CSV = `SKU,Size,Quantity,Price
DZ5485-612,10,1,350`;

const EMPTY_REPORT: InventoryImportReport | null = null;

export default function BulkImportPage() {
  const { currentUser, isLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [report, setReport] = useState<InventoryImportReport | null>(EMPTY_REPORT);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"preview" | "import" | null>(null);
  const [isPending, startTransition] = useTransition();

  const canImport =
    !!selectedFile &&
    !!report &&
    report.outcome === "preview" &&
    report.rows_invalid === 0 &&
    report.rows_valid > 0 &&
    !isPending;

  const reportTone = useMemo(() => {
    if (!report) return null;
    if (report.outcome === "committed") return "success";
    if (report.outcome === "partial_failure") return "warning";
    if (report.rows_invalid > 0 || report.outcome === "blocked") return "error";
    return "neutral";
  }, [report]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setReport(null);
    setLastAction(null);
    setErrorMessage(null);
  };

  const runPreview = () => {
    if (!selectedFile) {
      setErrorMessage("Choose a CSV file before generating a preview.");
      return;
    }

    setErrorMessage(null);
    setLastAction("preview");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", selectedFile);
      const nextReport = await previewBulkInventoryImportAction(formData);
      setReport(nextReport);
    });
  };

  const runImport = () => {
    if (!selectedFile) {
      setErrorMessage("Choose a CSV file before importing.");
      return;
    }

    setErrorMessage(null);
    setLastAction("import");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", selectedFile);
      const nextReport = await commitBulkInventoryImportAction(formData);
      setReport(nextReport);
    });
  };

  if (isLoading) {
    return <div className="relay-empty text-center">Loading...</div>;
  }

  if (!currentUser || (currentUser.role !== "seller" && currentUser.role !== "admin")) {
    return (
      <div className="relay-card p-8 max-w-2xl">
        <h1 className="relay-title text-relay-text mb-3">Bulk Import</h1>
        <p className="text-relay-subtle">
          Bulk inventory import is only available for approved seller accounts.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-2">
        <p className="relay-eyebrow text-relay-accent">INVENTORY</p>
        <h1 className="relay-title">Bulk Import</h1>
        <p className="text-relay-subtle max-w-3xl">
          Upload a CSV of SKU inventory to preview validation results, then import it into your existing Relay SKU listings.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/my-listings" className="relay-button-secondary">
          Back to My Listings
        </Link>
        <Link href="/sell" className="relay-button-primary">
          Create Single Listing
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-6">
        <div className="relay-card p-6 space-y-6">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-2xl bg-relay-accent/10 border border-relay-accent/20">
              <FileSpreadsheet className="w-5 h-5 text-relay-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-relay-text">Upload CSV</h2>
              <p className="text-sm text-relay-subtle mt-1">
                Photos are not required for bulk SKU imports. Relay will attach catalog data when available and use the current placeholder catalog behavior otherwise.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-[1.5rem] border border-dashed border-white/15 bg-white/[0.03] hover:bg-white/[0.05] transition-colors p-8 text-left"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-relay-accent" />
              </div>
              <div className="flex-1">
                <p className="text-relay-text font-semibold">
                  {selectedFile ? selectedFile.name : "Choose a CSV file"}
                </p>
                <p className="text-sm text-relay-subtle mt-1">
                  Accepted format: `.csv`
                </p>
                {selectedFile && (
                  <p className="text-xs text-white/45 mt-2">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />

          {errorMessage && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={runPreview}
              disabled={!selectedFile || isPending}
              className="relay-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending && lastAction === "preview" ? "Generating Preview..." : "Generate Preview"}
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={!canImport}
              className="relay-button-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending && lastAction === "import" ? "Importing..." : "Import Inventory"}
            </button>
            {selectedFile && (
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setReport(null);
                  setLastAction(null);
                  setErrorMessage(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-relay-text font-medium transition-colors"
              >
                <RefreshCw size={16} />
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="relay-card p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-2xl bg-white/[0.05] border border-white/10">
              <FileText className="w-5 h-5 text-relay-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-relay-text">Required Format</h2>
              <p className="text-sm text-relay-subtle mt-1">
                Flexible headers are supported, but this is the recommended shape.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-[0.24em] text-white/45">
              Example CSV
            </div>
            <pre className="p-4 text-sm text-relay-text overflow-x-auto whitespace-pre-wrap">{EXAMPLE_CSV}</pre>
          </div>

          <div className="space-y-2 text-sm text-relay-subtle">
            <p>`SKU`, `Size`, `Quantity`, and `Price` are required.</p>
            <p>Supported aliases include `style_id`, `styleId`, `shoe_size`, `qty`, and `list_price`.</p>
            <p>Quantity must be an integer `0` or greater. Price must be greater than `0`.</p>
          </div>
        </div>
      </div>

      {report && (
        <div className="relay-card p-6 space-y-6">
          <div
            className={`rounded-2xl border px-4 py-4 ${
              reportTone === "success"
                ? "border-emerald-500/30 bg-emerald-500/10"
                : reportTone === "warning"
                ? "border-amber-500/30 bg-amber-500/10"
                : reportTone === "error"
                ? "border-red-500/30 bg-red-500/10"
                : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <div className="flex items-start gap-3">
              {reportTone === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5" />
              ) : reportTone === "warning" || reportTone === "error" ? (
                <AlertTriangle className={`w-5 h-5 mt-0.5 ${reportTone === "warning" ? "text-amber-300" : "text-red-300"}`} />
              ) : (
                <FileSpreadsheet className="w-5 h-5 text-relay-accent mt-0.5" />
              )}
              <div>
                <h2 className="text-lg font-semibold text-relay-text">
                  {report.outcome === "committed"
                    ? "Import Complete"
                    : report.outcome === "preview"
                    ? "Preview Report"
                    : report.outcome === "partial_failure"
                    ? "Import Partially Applied"
                    : "Import Blocked"}
                </h2>
                {report.message && <p className="text-sm text-relay-subtle mt-1">{report.message}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <MetricCard label="Rows Read" value={report.rows_read} />
            <MetricCard label="Valid Rows" value={report.rows_valid} />
            <MetricCard label="Invalid Rows" value={report.rows_invalid} />
            <MetricCard label="Created Listings / New Variants" value={report.rows_created} />
            <MetricCard label="Updated Variants" value={report.rows_updated} />
            <MetricCard label="SKUs Processed" value={report.skus_processed} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)] gap-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-base font-semibold text-relay-text mb-3">How Relay Interprets This Import</h3>
              <div className="space-y-2 text-sm text-relay-subtle">
                <p>Existing seller SKU listings are merged instead of duplicated.</p>
                <p>Existing SKU + size rows update inventory and pricing through the Phase 1 SKU upsert logic.</p>
                <p>Preview never writes inventory. Validation errors block commit before any bad rows are applied.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h3 className="text-base font-semibold text-relay-text mb-3">Row-Level Errors</h3>
              {report.row_errors.length === 0 ? (
                <p className="text-sm text-relay-subtle">No row-level errors found.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {report.row_errors.map((rowError, index) => (
                    <div
                      key={`${rowError.row}-${rowError.field || "general"}-${index}`}
                      className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-100"
                    >
                      {rowError.row > 0 ? `Row ${rowError.row}: ${rowError.message}` : rowError.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="text-2xl font-semibold text-relay-text mt-3">{value}</p>
    </div>
  );
}
