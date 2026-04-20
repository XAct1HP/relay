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
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useParams } from "next/navigation";

type ModalState = "none" | "approve" | "reject";

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
  return (
    <div className="relay-card p-5 border border-[#5f8fff]/30 bg-[#5f8fff]/5">
      <div className="flex items-start gap-3 mb-4">
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

      <p className="text-white/70 text-sm mb-4">{recommendation.analysis}</p>

      <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
        <span className="text-white/60 text-sm">Confidence Score</span>
        <div className="flex items-center gap-2">
          <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#5f8fff] to-[#7ca6ff]"
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
  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadApplication() {
      const supabase = createClient();
      const { data } = await supabase
        .from("seller_applications")
        .select("*, profiles(*)")
        .eq("id", applicationId)
        .single();

      setApp(data);
      setLoading(false);
    }

    loadApplication();
  }, [applicationId]);

  const handleApprove = async () => {
    const supabase = createClient();

    await supabase
      .from("seller_applications")
      .update({ status: "approved" })
      .eq("id", applicationId);

    await supabase
      .from("profiles")
      .update({ role: "seller", seller_application_status: "approved", is_verified_seller: true })
      .eq("id", app.user_id);

    setApp({ ...app, status: "approved" });
    setModalState("none");
  };

  const handleReject = async () => {
    const supabase = createClient();

    await supabase
      .from("seller_applications")
      .update({ status: "rejected", rejection_count: (app.rejection_count || 0) + 1 })
      .eq("id", applicationId);

    await supabase
      .from("profiles")
      .update({ seller_application_status: "rejected" })
      .eq("id", app.user_id);

    setApp({ ...app, status: "rejected", rejection_count: (app.rejection_count || 0) + 1 });
    setModalState("none");
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-white/40">Loading application...</p>
      </div>
    );
  }

  if (!app) {
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
          <p className="text-[#f5f7fb] text-2xl font-bold">{app.profiles?.display_name || 'Unknown'}</p>
          <p className="text-white/60 text-sm mt-1">{app.profiles?.email || 'N/A'}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ApplicationInfoCard
            icon={Mail}
            label="Email"
            value={app.profiles?.email || 'N/A'}
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

      {/* AI Recommendation */}
      {app.ai_recommendation && (
        <AIRecommendationCard recommendation={app.ai_recommendation} />
      )}

      {/* Connection Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relay-card p-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <CreditCard className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-white/60 text-sm">Stripe Connected</p>
              <p className="text-green-400 font-semibold text-sm mt-1">
                {app.stripe_connected ? "Yes" : "No"}
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
              <p className="text-white/60 text-sm">Terms Accepted</p>
              <p className="text-green-400 font-semibold text-sm mt-1">
                {app.terms_accepted ? "Yes" : "No"}
              </p>
            </div>
          </div>
        </div>

        <div className="relay-card p-5">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                (app.rejection_count || 0) > 0
                  ? "bg-orange-500/20"
                  : "bg-green-500/20"
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
                  (app.rejection_count || 0) > 0
                    ? "text-orange-400"
                    : "text-green-400"
                }`}
              >
                {(app.rejection_count || 0) === 0
                  ? "None"
                  : `${app.rejection_count}/3 attempts`}
              </p>
            </div>
          </div>
        </div>
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

      {/* Action Buttons */}
      {app.status === "pending" && (
        <div className="flex gap-4">
          <button
            onClick={() => setModalState("approve")}
            className="relay-button-accent flex items-center justify-center"
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
