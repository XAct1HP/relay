"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  Package,
  Clock,
  Image as ImageIcon,
  ShieldCheck,
  Camera,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { useParams } from "next/navigation";

type ModalState = "none" | "buyer" | "seller";

const AUTH_PHOTO_LABELS = [
  "Front",
  "Back",
  "Medial Side",
  "Lateral Side",
  "Sole",
  "Size Tag",
  "Challenge Code",
  "Packed Shipment",
];

function RulingModal({ isOpen, type, onConfirm, onCancel }: any) {
  const [notes, setNotes] = useState("");
  const isBuyer = type === "buyer";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relay-card p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          {isBuyer ? (
            <CheckCircle className="w-6 h-6 text-green-400" />
          ) : (
            <CheckCircle className="w-6 h-6 text-blue-400" />
          )}
          <h2 className="text-xl font-semibold text-[#f5f7fb]">
            {isBuyer ? "Rule in Buyer's Favor?" : "Rule in Seller's Favor?"}
          </h2>
        </div>

        <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <p className="text-blue-300 text-sm">
            {isBuyer
              ? "Buyer must return shoes to you before refund is processed"
              : "Order will be marked complete and seller will be paid"}
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-white/70 text-sm mb-2">Ruling Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Explain your reasoning..."
            className="relay-textarea"
            rows={4}
          />
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 relay-button-secondary">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(notes)}
            className={`flex-1 relay-button-secondary ${
              isBuyer
                ? "bg-green-500/20 text-green-400"
                : "bg-blue-500/20 text-blue-400"
            }`}
          >
            Confirm Ruling
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DisputeDetailPage() {
  const params = useParams();
  const disputeId = params.id as string;
  const [modalState, setModalState] = useState<ModalState>("none");
  const [adminNotes, setAdminNotes] = useState("");
  const [dispute, setDispute] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rulingLoading, setRulingLoading] = useState(false);

  useEffect(() => {
    async function loadDispute() {
      const supabase = createClient();
      const { data } = await supabase
        .from("orders")
        .select("*, listing:listings(*), buyer:profiles!orders_buyer_id_fkey(*), seller:profiles!orders_seller_id_fkey(*)")
        .eq("id", disputeId)
        .single();

      setDispute(data);
      setLoading(false);
    }

    loadDispute();
  }, [disputeId]);

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-white/40">Loading dispute...</p>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="space-y-6 pb-12">
        <Link href="/admin/disputes">
          <button className="flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Disputes
          </button>
        </Link>
        <div className="relay-card p-12 text-center">
          <p className="text-white/40">Dispute not found</p>
        </div>
      </div>
    );
  }

  const hasRuling = dispute.dispute_ruling !== null && dispute.dispute_ruling !== undefined;

  const handleRuling = async (type: ModalState, notes: string) => {
    if (type === "none") return;
    setRulingLoading(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/dispute/${dispute.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ ruling: type, adminNotes: notes }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to submit ruling");
        return;
      }

      const updatedOrder = await res.json();
      setDispute(updatedOrder);
    } catch (err) {
      console.error("Ruling error:", err);
      alert("Failed to submit ruling");
    } finally {
      setRulingLoading(false);
      setModalState("none");
    }
  };

  return (
    <div className="space-y-6 pb-12">
        {/* Back Button */}
        <Link href="/admin/disputes">
          <button className="flex items-center gap-2 text-[#5f8fff] hover:text-[#7ca6ff] transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Disputes
          </button>
        </Link>

        {/* Order Summary */}
        <div className="relay-card p-5">
          <div className="space-y-4">
            <div>
              <p className="text-white/60 text-sm mb-1">Order ID</p>
              <p className="text-[#f5f7fb] text-lg font-semibold">
                {dispute.id}
              </p>
            </div>
            <div>
              <p className="text-white/60 text-sm mb-1">Product</p>
              <p className="text-[#f5f7fb] font-medium">{dispute.listing?.model || 'Unknown Product'}</p>
            </div>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-white/60 text-sm mb-1">Buyer</p>
                <p className="text-[#f5f7fb] font-medium">{dispute.buyer?.full_name || dispute.buyer?.display_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-white/60 text-sm mb-1">Seller</p>
                <p className="text-[#f5f7fb] font-medium">{dispute.seller?.full_name || dispute.seller?.display_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-white/60 text-sm mb-1">Order Total</p>
                <p className="text-[#f5f7fb] font-semibold">
                  ${dispute.price.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Buyer's Claim */}
          <div className="relay-card p-5 border-l-4 border-l-red-500">
            <h3 className="text-lg font-semibold text-[#f5f7fb] mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              Buyer&apos;s Claim
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-white/60 text-sm mb-1">Reason</p>
                <p className="text-[#f5f7fb] font-medium">
                  {dispute.dispute_reason || 'Disputed'}
                </p>
              </div>

              {dispute.dispute_text_buyer && (
                <div>
                  <p className="text-white/60 text-sm mb-1">Description</p>
                  <p className="text-[#f5f7fb] text-sm leading-relaxed bg-white/5 border border-white/10 rounded-lg p-3">
                    {dispute.dispute_text_buyer}
                  </p>
                </div>
              )}

              {dispute.dispute_evidence_buyer && dispute.dispute_evidence_buyer.length > 0 && (
                <div>
                  <p className="text-white/60 text-sm mb-2 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Buyer&apos;s Evidence ({dispute.dispute_evidence_buyer.length} photo{dispute.dispute_evidence_buyer.length > 1 ? 's' : ''})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {dispute.dispute_evidence_buyer.map((url: string, i: number) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                        <div className="aspect-square rounded-lg bg-white/5 border border-white/10 overflow-hidden hover:border-[#5f8fff]/50 transition-colors cursor-pointer">
                          <img src={url} alt={`Buyer evidence ${i + 1}`} className="w-full h-full object-cover" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-white/40 text-sm">
                <Clock className="w-4 h-4" />
                {new Date(dispute.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Seller's Response */}
          <div className="relay-card p-5 border-l-4 border-l-blue-500">
            <h3 className="text-lg font-semibold text-[#f5f7fb] mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              Seller&apos;s Response
            </h3>

            <div className="space-y-4">
              {dispute.dispute_text_seller ? (
                <>
                  <div>
                    <p className="text-white/60 text-sm mb-1">Response</p>
                    <p className="text-[#f5f7fb] text-sm leading-relaxed bg-white/5 border border-white/10 rounded-lg p-3">
                      {dispute.dispute_text_seller}
                    </p>
                  </div>

                  {dispute.dispute_evidence_seller && dispute.dispute_evidence_seller.length > 0 && (
                    <div>
                      <p className="text-white/60 text-sm mb-2 flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        Seller&apos;s Evidence ({dispute.dispute_evidence_seller.length} photo{dispute.dispute_evidence_seller.length > 1 ? 's' : ''})
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {dispute.dispute_evidence_seller.map((url: string, i: number) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                            <div className="aspect-square rounded-lg bg-white/5 border border-white/10 overflow-hidden hover:border-[#5f8fff]/50 transition-colors cursor-pointer">
                              <img src={url} alt={`Seller evidence ${i + 1}`} className="w-full h-full object-cover" />
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <p className="text-white/40 text-sm italic">
                    Seller has not submitted a response yet.
                  </p>
                </div>
              )}

              <div>
                <p className="text-white/60 text-sm mb-1">Current Status</p>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${
                  dispute.status === 'disputed'
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-green-500/20 text-green-300'
                }`}>
                  {dispute.status === 'disputed' ? 'Open' : 'Resolved'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pre-Shipment Authentication Photos */}
        {(dispute.auth_photos?.length > 0 || dispute.checkcheck_certificate_url) && (
          <div className="relay-card p-5 border-l-4 border-l-purple-500">
            <h3 className="text-lg font-semibold text-[#f5f7fb] mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              Pre-Shipment Authentication
            </h3>

            {dispute.auth_photos && dispute.auth_photos.length > 0 && (
              <div className="mb-6">
                <p className="text-white/60 text-sm mb-3 flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Authentication Photos ({dispute.auth_photos.length} photo{dispute.auth_photos.length > 1 ? 's' : ''})
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {dispute.auth_photos.map((url: string, i: number) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                      <div className="aspect-square rounded-lg bg-white/5 border border-white/10 overflow-hidden hover:border-purple-500/50 transition-colors cursor-pointer">
                        <img src={url} alt={AUTH_PHOTO_LABELS[i] || `Auth photo ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                      <p className="text-white/50 text-xs mt-1 text-center truncate">
                        {AUTH_PHOTO_LABELS[i] || `Photo ${i + 1}`}
                      </p>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {dispute.checkcheck_certificate_url && (
              <div>
                <p className="text-white/60 text-sm mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  CheckCheck Certificate
                </p>
                {dispute.checkcheck_certificate_url.toLowerCase().endsWith('.pdf') ? (
                  <div className="max-w-2xl">
                    <iframe
                      src={dispute.checkcheck_certificate_url}
                      className="w-full h-[500px] rounded-lg border border-white/10 bg-white"
                      title="CheckCheck Certificate"
                    />
                    <a
                      href={dispute.checkcheck_certificate_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      Open PDF in new tab
                    </a>
                  </div>
                ) : (
                  <a href={dispute.checkcheck_certificate_url} target="_blank" rel="noopener noreferrer" className="block max-w-sm">
                    <div className="rounded-lg bg-white/5 border border-white/10 overflow-hidden hover:border-purple-500/50 transition-colors cursor-pointer">
                      <img src={dispute.checkcheck_certificate_url} alt="CheckCheck Certificate" className="w-full h-auto object-contain" />
                    </div>
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Admin Ruling Section */}
        {!hasRuling && (
          <>
            <div className="relay-card p-5">
              <h3 className="text-lg font-semibold text-[#f5f7fb] mb-4">
                Admin Ruling
              </h3>

              <div className="mb-6">
                <label className="block text-white/70 text-sm mb-2">
                  Admin Notes
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Provide detailed reasoning for your ruling..."
                  className="relay-textarea"
                  rows={5}
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setModalState("buyer")}
                  className="flex-1 relay-button-secondary bg-green-500/20 text-green-400 hover:bg-green-500/30"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Rule in Buyer&apos;s Favor
                </button>
                <button
                  onClick={() => setModalState("seller")}
                  className="flex-1 relay-button-secondary bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Rule in Seller&apos;s Favor
                </button>
              </div>
            </div>
          </>
        )}

        {hasRuling && (
          <div className="relay-card p-5 bg-green-500/5 border border-green-500/20">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-green-400 mb-2">
                  Ruling Finalized
                </h3>
                <p className="text-green-400/80 mb-3">
                  This dispute has been resolved. Both parties have been notified.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Modals */}
        <RulingModal
          isOpen={modalState === "buyer"}
          type="buyer"
          onConfirm={(notes: string) =>
            handleRuling("buyer", notes)
          }
          onCancel={() => setModalState("none")}
        />
        <RulingModal
          isOpen={modalState === "seller"}
          type="seller"
          onConfirm={(notes: string) =>
            handleRuling("seller", notes)
          }
          onCancel={() => setModalState("none")}
        />
      </div>
  );
}
