"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  CheckCircle,
  AlertTriangle,
  Zap,
  MapPin,
  Mail,
  Calendar,
  CreditCard,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { SellerApplication, SellerIdentityProfile, User } from "@/types";

type ModalState = "none" | "approve" | "reject";

interface ApplicationDetailResponse {
  application: SellerApplication & {
    ai_recommendation?: any;
  };
  profile: User;
  identityProfile: SellerIdentityProfile | null;
  identitySyncError?: string | null;
}

function ApplicationInfoCard({ label, value, icon: Icon }: any) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 bg-white/5 rounded-lg flex-shrink-0">
        <Icon className="w-4 h-4 text-[#5f8fff]" />
      </div>
      <div className="flex-1">
        <p className="text-white/60 text-sm">{label}</p>
        <p className="text-[#f5f7fb] font-medium mt-1">{value}</p>
      </div>
    </div>
  );
}

function QuestionResponseCard({ question, answer }: any) {
  return (
    <div className="relay-card p-5">
      <h4 className="text-[#f5f7fb] font-semibold mb-2">{question}</h4>
      <p className="text-white/60 text-sm leading-relaxed">{answer}</p>
    </div>
  );
}

function AIRecommendationCard({ recommendation }: any) {
  const decisionColors: Record<string, string> = {
    approve: 'text-green-400 bg-green-500/20 border-green-500/30',
    review: 'text-amber-400 bg-amber-500/20 border-amber-500/30',
    reject: 'text-red-400 bg-red-500/20 border-red-500/30',
  };

  const decisionLabels: Record<string, string> = {
    approve: 'Recommend Approval',
    review: 'Needs Further Review',
    reject: 'Recommend Rejection',
  };

  const barColor = recommendation.decision === 'approve'
    ? 'from-green-500 to-emerald-400'
    : recommendation.decision === 'review'
    ? 'from-amber-500 to-yellow-400'
    : 'from-red-500 to-orange-400';

  return (
    <div className="relay-card p-5 border border-[#5f8fff]/30 bg-[#5f8fff]/5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-[#5f8fff]/20 rounded-lg flex-shrink-0">
            <Zap className="w-5 h-5 text-[#5f8fff]" />
          </div>
          <div>
            <h4 className="text-[#f5f7fb] font-semibold">AI Recommendation</h4>
            <p className="text-white/60 text-sm">
              Based on application analysis
            </p>
          </div>
        </div>
        {recommendation.decision && (
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${decisionColors[recommendation.decision] || ''}`}>
            {decisionLabels[recommendation.decision] || recommendation.decision}
          </span>
        )}
      </div>

      <p className="text-white/70 text-sm mb-4">{recommendation.analysis}</p>

      {/* Strengths & Concerns */}
      {recommendation.strengths?.length > 0 && (
        <div className="mb-3">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Strengths</p>
          <div className="space-y-1">
            {recommendation.strengths.map((s: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                <span className="text-white/60 text-sm">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recommendation.concerns?.length > 0 && (
        <div className="mb-4">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Concerns</p>
          <div className="space-y-1">
            {recommendation.concerns.map((c: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="text-white/60 text-sm">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
        <span className="text-white/60 text-sm">Confidence Score</span>
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${barColor}`}
              style={{ width: `${recommendation.confidence}%` }}
            />
          </div>
          <span className="text-[#f5f7fb] font-semibold text-sm">
            {recommendation.confidence}%
          </span>
        </div>
      </div>
    </div>
  );
}

function ConfirmationModal({ isOpen, type, onConfirm, onCancel }: any) {
  if (!isOpen) return null;

  const isApproval = type === "approve";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relay-card p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          {isApproval ? (
            <CheckCircle className="w-6 h-6 text-green-400" />
          ) : (
            <AlertTriangle className="w-6 h-6 text-red-400" />
          )}
          <h2 className="text-xl font-semibold text-[#f5f7fb]">
            {isApproval ? "Approve Application?" : "Reject Application?"}
          </h2>
        </div>

        <p className="text-white/60 mb-6">
          {isApproval
            ? "This applicant will be able to create listings and sell on Relay."
            : "This applicant will be notified of the rejection and can reapply."}
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 relay-button-secondary"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 relay-button-secondary ${
              isApproval ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
            }`}
          >
            {isApproval ? "Approve" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ApplicationDetailPage() {
  const params = useParams();
  const applicationId = params.id as string;
  const [modalState, setModalState] = useState<ModalState>("none");
  const [adminNotes, setAdminNotes] = useState("");
  const [data, setData] = useState<ApplicationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    async function loadApplication() {
      const response = await fetch(`/api/admin/application/${applicationId}`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load application");
      }

      // Parse ai_recommendation if it's a JSON string (stored as TEXT in DB)
      if (payload?.application?.ai_recommendation && typeof payload.application.ai_recommendation === 'string') {
        try {
          payload.application.ai_recommendation = JSON.parse(payload.application.ai_recommendation);
        } catch {
          // If it's not valid JSON, leave as-is
        }
      }

      setData(payload);
      setAdminNotes(payload.application?.admin_notes || "");
      setLoading(false);

      // Auto-generate AI recommendation if not present and application is pending
      if (payload.application && !payload.application.ai_recommendation && payload.application.status === 'pending') {
        setAiLoading(true);
        try {
          const response = await fetch(`/api/admin/application/${applicationId}/ai-recommendation`, {
            method: 'POST',
          });
          if (response.ok) {
            const recommendation = await response.json();
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    application: {
                      ...prev.application,
                      ai_recommendation: recommendation,
                    },
                  }
                : prev
            );
          }
        } catch (err) {
          console.error('Failed to generate AI recommendation:', err);
        } finally {
          setAiLoading(false);
        }
      }
    }

    loadApplication().catch((err) => {
      console.error("Failed to load application:", err);
      setLoading(false);
    });
  }, [applicationId]);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const handleApprove = async () => {
    if (!data) return;
    setActionLoading(true);
    setActionError('');

    try {
      const response = await fetch(`/api/admin/application/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', adminNotes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve application');
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              application: data.application,
              profile: data.profile,
              identityProfile: data.identityProfile ?? prev.identityProfile,
              identitySyncError: null,
            }
          : prev
      );
    } catch (err: any) {
      setActionError(err.message || 'Failed to approve application');
    } finally {
      setActionLoading(false);
      setModalState("none");
    }
  };

  const handleReject = async () => {
    if (!data) return;
    setActionLoading(true);
    setActionError('');

    try {
      const response = await fetch(`/api/admin/application/${applicationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', adminNotes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject application');
      }

      setData((prev) =>
        prev
          ? {
              ...prev,
              application: data.application,
              profile: data.profile ?? prev.profile,
              identitySyncError: prev.identitySyncError ?? null,
            }
          : prev
      );
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject application');
    } finally {
      setActionLoading(false);
      setModalState("none");
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-white/40">Loading application...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 pb-12">
        <Link href="/admin/applications">
          <button className="flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Applications
          </button>
        </Link>
        <div className="relay-card p-12 text-center">
          <p className="text-white/40">Application not found</p>
        </div>
      </div>
    );
  }

  const app = data.application;
  const profile = data.profile;
  const identityProfile = data.identityProfile;
  const onboardingComplete =
    identityProfile?.stripe_connect_onboarding_complete ??
    profile.stripe_connect_onboarding_complete ??
    app.stripe_connected;
  const identityReviewRequired =
    Boolean(identityProfile?.admin_review_required) || Boolean(profile.seller_identity_review_required);
  const approvalBlocked =
    profile.is_banned || !onboardingComplete || (identityReviewRequired && !profile.is_founding_seller);
  const isRejectable = (app.rejection_count || 0) < 3;

  return (
    <div className="space-y-6 pb-12">
      {/* Back Button */}
      <Link href="/admin/applications">
        <button className="flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff] transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Applications
        </button>
      </Link>

      {/* Application Info */}
      <div className="relay-card p-5">
        <div className="mb-6">
          <p className="text-[#f5f7fb] text-2xl font-bold">{profile.full_name || profile.display_name || profile.username || 'Unknown'}</p>
          <p className="text-white/60 text-sm mt-1">{profile.email || 'N/A'}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ApplicationInfoCard
            icon={Mail}
            label="Email"
            value={profile.email || 'N/A'}
          />
          <ApplicationInfoCard
            icon={Calendar}
            label="Application Date"
            value={new Date(app.created_at).toLocaleDateString()}
          />
        </div>
      </div>

      {/* Ship From Address */}
      {app.ship_from_address && (
        <div className="relay-card p-5">
          <h3 className="text-lg font-semibold text-[#f5f7fb] mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#5f8fff]" />
            Ship From Address
          </h3>
          <div className="text-white/70">
            <p>{app.ship_from_address.name}</p>
            <p>{app.ship_from_address.street}</p>
            {app.ship_from_address.street2 && <p>{app.ship_from_address.street2}</p>}
            <p>
              {app.ship_from_address.city}, {app.ship_from_address.state}{" "}
              {app.ship_from_address.zip}
            </p>
            <p>{app.ship_from_address.country}</p>
          </div>
        </div>
      )}

      {/* Questionnaire Responses */}
      {app.questionnaire_responses && Object.keys(app.questionnaire_responses).length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-[#f5f7fb]">
            Questionnaire Responses
          </h2>
          {Object.entries(app.questionnaire_responses).map(([key, answer]: [string, any]) => {
            const questionLabels: Record<string, string> = {
              primary_shoe_type: 'What type of shoes do you primarily sell?',
              reselling_duration: 'How long have you been reselling shoes?',
              previous_platforms: 'What platforms have you sold on before?',
              authenticity_verification: 'How do you verify the authenticity of your products?',
              monthly_volume: 'What is your expected monthly listing volume?',
              why_relay: 'Why do you want to sell on Relay?',
              own_brand: 'Are you building your own shoe brand?',
              instagram_url: 'Instagram',
              other_links: 'Other Links / Proof',
            };
            return (
              <QuestionResponseCard
                key={key}
                question={questionLabels[key] || key.replace(/_/g, ' ')}
                answer={answer || 'No answer provided'}
              />
            );
          })}
        </div>
      )}

      {/* Social & Proof Links */}
      {app.questionnaire_responses && (app.questionnaire_responses.instagram_url || app.questionnaire_responses.other_links) && (
        <div className="relay-card p-5">
          <h3 className="text-lg font-semibold text-[#f5f7fb] mb-4 flex items-center gap-2">
            <ExternalLink className="w-5 h-5 text-[#5f8fff]" />
            Social & Proof Links
          </h3>
          <div className="space-y-3">
            {app.questionnaire_responses.instagram_url && (
              <div>
                <p className="text-white/60 text-sm mb-1">Instagram</p>
                <a
                  href={app.questionnaire_responses.instagram_url.startsWith('http') ? app.questionnaire_responses.instagram_url : `https://instagram.com/${app.questionnaire_responses.instagram_url.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#5f8fff] hover:text-[#7ca6ff] text-sm flex items-center gap-1.5 transition-colors"
                >
                  {app.questionnaire_responses.instagram_url}
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
            {app.questionnaire_responses.other_links && (
              <div>
                <p className="text-white/60 text-sm mb-1">Other Links</p>
                <p className="text-white/70 text-sm whitespace-pre-wrap">{app.questionnaire_responses.other_links}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Recommendation */}
      {aiLoading && (
        <div className="relay-card p-5 border border-[#5f8fff]/30 bg-[#5f8fff]/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#5f8fff]/20 rounded-lg flex-shrink-0">
              <Zap className="w-5 h-5 text-[#5f8fff] animate-pulse" />
            </div>
            <div>
              <h4 className="text-[#f5f7fb] font-semibold">Generating AI Recommendation...</h4>
              <p className="text-white/60 text-sm">Analyzing application responses</p>
            </div>
          </div>
        </div>
      )}
      {!aiLoading && app.ai_recommendation && (
        <AIRecommendationCard recommendation={app.ai_recommendation} />
      )}

      {/* Connection Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relay-card p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <CreditCard className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Connect Onboarding</p>
              <p className="text-green-400 font-semibold text-sm mt-1">
                {onboardingComplete ? "Complete" : "Incomplete"}
              </p>
            </div>
          </div>
        </div>

        <div className="relay-card p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Verification Status</p>
              <p className="text-green-400 font-semibold text-sm mt-1">
                {(identityProfile?.verification_status || profile.stripe_identity_verification_status || "unverified").replaceAll("_", " ")}
              </p>
            </div>
          </div>
        </div>

        <div className="relay-card p-5">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                identityReviewRequired || identityProfile?.matched_banned_identity
                  ? "bg-amber-500/20"
                  : "bg-green-500/20"
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${
                  identityReviewRequired || identityProfile?.matched_banned_identity
                    ? "text-amber-400"
                    : "text-green-400"
                }`}
              />
            </div>
            <div>
              <p className="text-white/60 text-sm">Identity Review</p>
              <p
                className={`font-semibold text-sm mt-1 ${
                  identityReviewRequired || identityProfile?.matched_banned_identity
                    ? "text-amber-400"
                    : "text-green-400"
                }`}
              >
                {identityReviewRequired
                  ? profile.is_founding_seller
                    ? "Flagged, founding bypass"
                    : "Manual review required"
                  : "Clear"}
              </p>
            </div>
          </div>
        </div>

        <div className="relay-card p-5">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                (app.rejection_count || 0) > 0 ? "bg-orange-500/20" : "bg-green-500/20"
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${
                  (app.rejection_count || 0) > 0 ? "text-orange-400" : "text-green-400"
                }`}
              />
            </div>
            <div>
              <p className="text-white/60 text-sm">Rejection Count</p>
              <p
                className={`font-semibold text-sm mt-1 ${
                  (app.rejection_count || 0) > 0 ? "text-orange-400" : "text-green-400"
                }`}
              >
                {(app.rejection_count || 0) === 0 ? "None" : `${app.rejection_count}/3 attempts`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relay-card p-5 space-y-3">
        <h3 className="text-lg font-semibold text-[#f5f7fb]">Identity Protection</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-white/50 mb-1">Stripe account</p>
            <p className="text-[#f5f7fb] break-all">
              {identityProfile?.stripe_account_id || profile.stripe_account_id || "Not connected"}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-white/50 mb-1">Banned identity match</p>
            <p className="text-[#f5f7fb]">
              {identityProfile?.matched_banned_identity ? "Matched" : "No banned match detected"}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-white/50 mb-1">Transfers capability</p>
            <p className="text-[#f5f7fb]">
              {(identityProfile?.stripe_transfers_capability_status || profile.stripe_transfers_capability_status || "unknown").replaceAll("_", " ")}
            </p>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-white/50 mb-1">Payout destination ready</p>
            <p className="text-[#f5f7fb]">
              {(identityProfile?.stripe_payouts_enabled || profile.stripe_payouts_enabled) &&
              (identityProfile?.stripe_transfers_capability_status || profile.stripe_transfers_capability_status) === "active"
                ? "Ready for Relay withdrawals"
                : "Needs Stripe setup"}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4 text-sky-100 text-sm">
          Relay uses this Express account only as a withdrawal destination. Approval should not assume seller funds live in the connected account before withdrawal.
        </div>
        {profile.seller_identity_review_reason && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-200 text-sm">
            {profile.seller_identity_review_reason}
          </div>
        )}
        {identityProfile?.match_reasons && identityProfile.match_reasons.length > 0 && (
          <p className="text-white/60 text-sm">
            Match reasons:{" "}
            <span className="text-[#f5f7fb]">
              {identityProfile.match_reasons.map((reason) => reason.replaceAll("_", " ")).join(", ")}
            </span>
          </p>
        )}
        {data.identitySyncError && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-200 text-sm">
            Identity sync warning: {data.identitySyncError}
          </div>
        )}
        {approvalBlocked && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-200 text-sm">
            Approval is blocked until Stripe Connect onboarding is complete and identity review holds are cleared.
          </div>
        )}
        {profile.is_founding_seller && identityReviewRequired && !profile.is_banned && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-200 text-sm">
            Founding seller status can bypass Relay identity review, but Stripe Connect onboarding must still be complete.
          </div>
        )}
      </div>

      {/* Admin Notes */}
      <div className="relay-card p-5">
        <h3 className="text-lg font-semibold text-[#f5f7fb] mb-4">
          Admin Notes
        </h3>
        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          placeholder="Add internal notes about this application..."
          className="relay-textarea"
          rows={4}
        />
      </div>

      {/* Action Error */}
      {actionError && (
        <div className="relay-card p-4 border border-red-500/30 bg-red-500/5">
          <p className="text-red-400 text-sm">{actionError}</p>
        </div>
      )}

      {/* Action Buttons */}
      {app.status === "pending" && (
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => setModalState("approve")}
            disabled={approvalBlocked || actionLoading}
            className="relay-button-accent flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Approve Application
          </button>
          {isRejectable && (
            <button
              onClick={() => setModalState("reject")}
              className="relay-button-secondary bg-red-500/20 text-red-400 flex items-center justify-center"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Reject Application
            </button>
          )}
          {!isRejectable && (
            <div className="relay-card p-5 bg-red-500/5 border border-red-500/20 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-red-400 font-semibold text-sm">Final Attempt</p>
                <p className="text-red-400/70 text-xs">This is their last chance to apply</p>
              </div>
            </div>
          )}
        </div>
      )}

      {app.status !== "pending" && (
        <div className={`relay-card p-5 flex items-center gap-3 ${
          app.status === "approved" ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"
        }`}>
          {app.status === "approved" ? (
            <CheckCircle className="w-5 h-5 text-green-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-400" />
          )}
          <p className={`font-semibold ${app.status === "approved" ? "text-green-400" : "text-red-400"}`}>
            Application {app.status === "approved" ? "Approved" : "Rejected"}
          </p>
        </div>
      )}

      {/* Modals */}
      <ConfirmationModal
        isOpen={modalState === "approve"}
        type="approve"
        onConfirm={handleApprove}
        onCancel={() => setModalState("none")}
      />
      <ConfirmationModal
        isOpen={modalState === "reject"}
        type="reject"
        onConfirm={handleReject}
        onCancel={() => setModalState("none")}
      />
    </div>
  );
}
