import "server-only";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  continueAdminInventoryPreview,
  initializeAdminInventoryPreview,
  type AdminInventoryPreviewContext,
  type AdminInventoryPreviewReport,
  type AdminInventoryPricingMode,
} from "@/lib/admin-inventory-ingest";

interface PreviewJobState {
  id: string;
  created_at: string;
  updated_at: string;
  report: AdminInventoryPreviewReport;
  context: AdminInventoryPreviewContext;
}

const globalJobs = globalThis as typeof globalThis & {
  __relayAdminInventoryPreviewJobs?: Map<string, PreviewJobState>;
};

function getJobStore() {
  if (!globalJobs.__relayAdminInventoryPreviewJobs) {
    globalJobs.__relayAdminInventoryPreviewJobs = new Map<string, PreviewJobState>();
  }

  return globalJobs.__relayAdminInventoryPreviewJobs;
}

export async function startAdminInventoryPreviewJob(
  supabase: SupabaseClient,
  sellerId: string,
  csvText: string,
  options: {
    pricing_mode: AdminInventoryPricingMode;
    reconcile_missing?: boolean;
  }
): Promise<AdminInventoryPreviewReport> {
  pruneOldJobs();

  const context = await initializeAdminInventoryPreview(supabase, sellerId, csvText, options);
  if (!context) {
    throw new Error("Unable to initialize the preview job.");
  }

  const now = new Date().toISOString();
  const jobId = randomUUID();
  const initialReport: AdminInventoryPreviewReport = {
    ...context.initial_report,
    job_id: jobId,
  };

  context.initial_report = initialReport;

  const jobState: PreviewJobState = {
    id: jobId,
    created_at: now,
    updated_at: now,
    report: initialReport,
    context,
  };

  getJobStore().set(jobId, jobState);

  void continueAdminInventoryPreview(supabase, context, {
    onProgress: async (report) => {
      const current = getJobStore().get(jobId);
      if (!current) {
        return;
      }

      current.report = {
        ...report,
        job_id: jobId,
      };
      current.updated_at = new Date().toISOString();
      getJobStore().set(jobId, current);
    },
  }).catch((error) => {
    const current = getJobStore().get(jobId);
    if (!current) {
      return;
    }

    current.report = {
      ...current.report,
      job_id: jobId,
      processing_status: "failed",
      waiting_until: null,
      message:
        error instanceof Error
          ? error.message
          : "The preview job failed while processing KicksDB lookups.",
    };
    current.updated_at = new Date().toISOString();
    getJobStore().set(jobId, current);
  });

  return initialReport;
}

export function getAdminInventoryPreviewJob(
  jobId: string
): AdminInventoryPreviewReport | null {
  pruneOldJobs();
  const job = getJobStore().get(jobId);
  return job ? job.report : null;
}

function pruneOldJobs() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [jobId, job] of Array.from(getJobStore().entries())) {
    if (Date.parse(job.updated_at) < cutoff) {
      getJobStore().delete(jobId);
    }
  }
}
