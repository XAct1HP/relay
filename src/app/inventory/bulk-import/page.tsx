"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileText, RefreshCw, Upload, ArrowRight, Hash, DollarSign, Ruler, Package } from "lucide-react";
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

  /* Determine current step for stepper: 1=Upload, 2=Preview, 3=Import */
  const currentStep = report?.outcome === "committed" || report?.outcome === "partial_failure"
    ? 3
    : report
    ? 2
    : selectedFile
    ? 1.5
    : 1;

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
      <div className="space-y-2 mb-8">
        <p className="relay-eyebrow text-[#5f8fff]">INVENTORY</p>
        <h1 className="relay-title">Bulk Import</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard/inventory" className="relay-button-secondary">
          Back to My Listings
        </Link>
        <Link href="/sell" className="relay-button-primary">
          Create Single Listing
        </Link>
      </div>

      {/* Horizontal stepper */}
      <div className="relay-card p-5">
        <div className="flex items-center justify-center gap-0">
          {[
            { step: 1, label: "Upload" },
            { step: 2, label: "Preview" },
            { step: 3, label: "Import" },
          ].map((s, i) => {
            const isActive = currentStep >= s.step;
            const isCurrent = Math.ceil(currentStep) === s.step;
            return (
              <div key={s.step} className="flex items-center">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300"
                    style={{
                      background: isActive
                        ? "linear-gradient(135deg, #5f8fff, #7ca6ff)"
                        : "rgba(255,255,255,0.06)",
                      border: isCurrent
                        ? "2px solid #7ca6ff"
                        : isActive
                        ? "2px solid transparent"
                        : "2px solid rgba(255,255,255,0.1)",
                      color: isActive ? "#fff" : "rgba(255,255,255,0.35)",
                      boxShadow: isCurrent ? "0 0 12px rgba(95,143,255,0.4)" : "none",
                    }}
                  >
                    {isActive && currentStep > s.step ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      s.step
                    )}
                  </div>
                  <span
                    className="text-xs font-medium tracking-wide transition-colors duration-300"
                    style={{ color: isActive ? "#7ca6ff" : "rgba(255,255,255,0.35)" }}
                  >
                    {s.label}
                  </span>
                </div>
                {i < 2 && (
                  <div
                    className="w-16 sm:w-24 h-0.5 mx-3 mb-6 rounded-full transition-colors duration-500"
                    style={{
                      background: currentStep > s.step
                        ? "linear-gradient(90deg, #5f8fff, #7ca6ff)"
                        : "rgba(255,255,255,0.08)",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] gap-6">
        {/* Main upload card */}
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

          {/* Dramatic drop zone */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="group w-full rounded-[1.5rem] p-1 text-left transition-all duration-300"
            style={{
              background: selectedFile
                ? "linear-gradient(135deg, rgba(52,211,153,0.25), rgba(52,211,153,0.08))"
                : "linear-gradient(135deg, rgba(95,143,255,0.15), rgba(124,166,255,0.05))",
            }}
          >
            <div
              className="w-full rounded-[1.25rem] border-2 border-dashed transition-all duration-300 p-8"
              style={{
                borderColor: selectedFile
                  ? "rgba(52,211,153,0.4)"
                  : "rgba(95,143,255,0.2)",
                background: selectedFile
                  ? "rgba(52,211,153,0.04)"
                  : "rgba(95,143,255,0.03)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = selectedFile
                  ? "rgba(52,211,153,0.7)"
                  : "rgba(95,143,255,0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = selectedFile
                  ? "rgba(52,211,153,0.4)"
                  : "rgba(95,143,255,0.2)";
              }}
            >
              {selectedFile ? (
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(52,211,153,0.2), rgba(52,211,153,0.08))", border: "2px solid rgba(52,211,153,0.3)" }}>
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-relay-text font-bold text-lg">{selectedFile.name}</p>
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium" style={{ background: "rgba(52,211,153,0.15)", color: "rgb(110,231,183)" }}>
                      <FileSpreadsheet className="w-3 h-3" />
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <p className="text-xs text-white/40">Click to choose a different file</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-4">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background: "linear-gradient(135deg, rgba(95,143,255,0.15), rgba(124,166,255,0.05))",
                      border: "1.5px solid rgba(95,143,255,0.2)",
                    }}
                  >
                    <Upload className="w-9 h-9 text-[#5f8fff]" />
                  </div>
                  <div className="text-center">
                    <p className="text-relay-text font-semibold text-lg">
                      Drop your CSV here or click to browse
                    </p>
                    <p className="text-sm text-relay-subtle mt-1">Accepted format: .csv</p>
                  </div>
                </div>
              )}
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
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
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

        {/* Required Format sidebar */}
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

          {/* Column header chips */}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/40 mb-3">Required Columns</p>
            <div className="flex flex-wrap gap-2">
              {[
                { name: "SKU", icon: Hash },
                { name: "Size", icon: Ruler },
                { name: "Quantity", icon: Package },
                { name: "Price", icon: DollarSign },
              ].map((col) => (
                <div
                  key={col.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
                  style={{
                    background: "rgba(95,143,255,0.1)",
                    border: "1px solid rgba(95,143,255,0.2)",
                    color: "#7ca6ff",
                  }}
                >
                  <col.icon className="w-3.5 h-3.5" />
                  {col.name}
                </div>
              ))}
            </div>
          </div>

          {/* Syntax-highlighted CSV example */}
          <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/10 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
              </div>
              <span className="text-xs uppercase tracking-[0.24em] text-white/45 ml-1">Example CSV</span>
            </div>
            <pre className="p-4 text-sm overflow-x-auto whitespace-pre-wrap">
              <span style={{ color: "#7ca6ff", fontWeight: 600 }}>SKU</span>
              <span className="text-white/30">,</span>
              <span style={{ color: "#7ca6ff", fontWeight: 600 }}>Size</span>
              <span className="text-white/30">,</span>
              <span style={{ color: "#7ca6ff", fontWeight: 600 }}>Quantity</span>
              <span className="text-white/30">,</span>
              <span style={{ color: "#7ca6ff", fontWeight: 600 }}>Price</span>
              {"\n"}
              <span className="text-relay-text">DZ5485-612</span>
              <span className="text-white/30">,</span>
              <span className="text-relay-text">10</span>
              <span className="text-white/30">,</span>
              <span className="text-relay-text">1</span>
              <span className="text-white/30">,</span>
              <span className="text-emerald-400">350</span>
            </pre>
          </div>

          {/* Format rules as mini table */}
          <div className="space-y-2.5">
            {[
              { rule: "SKU, Size, Quantity, and Price are required columns." },
              { rule: "Aliases supported: style_id, styleId, shoe_size, qty, list_price." },
              { rule: "Quantity must be an integer 0 or greater. Price must be greater than 0." },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm text-relay-subtle">
                <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#5f8fff]" />
                <span>{item.rule}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Report section */}
      {report && (
        <div className="relay-card p-6 space-y-6">
          {/* Summary banner */}
          <div
            className="rounded-2xl border px-5 py-5"
            style={{
              borderColor:
                reportTone === "success"
                  ? "rgba(52,211,153,0.3)"
                  : reportTone === "warning"
                  ? "rgba(245,158,11,0.3)"
                  : reportTone === "error"
                  ? "rgba(239,68,68,0.3)"
                  : "rgba(255,255,255,0.1)",
              background:
                reportTone === "success"
                  ? "linear-gradient(135deg, rgba(52,211,153,0.12), rgba(52,211,153,0.04))"
                  : reportTone === "warning"
                  ? "linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))"
                  : reportTone === "error"
                  ? "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.04))"
                  : "rgba(255,255,255,0.03)",
            }}
          >
            <div className="flex items-start gap-4">
              {reportTone === "success" ? (
                <div className="w-12 h-12 rounded-full flex items-center justify-center animate-pulse" style={{ background: "rgba(52,211,153,0.15)" }}>
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
              ) : reportTone === "warning" || reportTone === "error" ? (
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: reportTone === "warning" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)" }}>
                  <AlertTriangle className={`w-6 h-6 ${reportTone === "warning" ? "text-amber-300" : "text-red-300"}`} />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(95,143,255,0.15)" }}>
                  <FileSpreadsheet className="w-6 h-6 text-relay-accent" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-relay-text">
                  {report.outcome === "committed"
                    ? "Import Complete"
                    : report.outcome === "preview"
                    ? "Preview Report"
                    : report.outcome === "partial_failure"
                    ? "Import Partially Applied"
                    : "Import Blocked"}
                </h2>
                {report.message && <p className="text-sm text-relay-subtle mt-1.5">{report.message}</p>}
              </div>
            </div>
          </div>

          {/* Metric cards with colored top borders */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <MetricCard label="Rows Read" value={report.rows_read} color="#5f8fff" />
            <MetricCard label="Valid Rows" value={report.rows_valid} color="#34d399" />
            <MetricCard label="Invalid Rows" value={report.rows_invalid} color="#ef4444" />
            <MetricCard label="Created / New" value={report.rows_created} color="#34d399" />
            <MetricCard label="Updated" value={report.rows_updated} color="#5f8fff" />
            <MetricCard label="SKUs Processed" value={report.skus_processed} color="#7ca6ff" />
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

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-all duration-200 hover:bg-white/[0.06] hover:border-white/15"
      style={{ borderTop: `3px solid ${color}` }}
    >
      <p className="text-xs uppercase tracking-[0.18em] text-white/40">{label}</p>
      <p className="text-2xl font-bold text-relay-text mt-3">{value}</p>
    </div>
  );
}
