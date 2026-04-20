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
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase";
import { useParams } from "next/navigation";

type ModalState = "none" | "buyer" | "seller";

function ImageGallery({ images, title }: any) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-[#f5f7fb] mb-3 flex items-center gap-2">
        <ImageIcon className="w-4 h-4" />
        {title}
      </h4>
      <div className="grid grid-cols-3 gap-3">
        {images.map((img: any) => (
          <div
            key={img.id}
            className="aspect-square rounded-lg bg-white/5 border border-white/10 overflow-hidden hover:border-[#5f8fff]/50 transition-colors cursor-pointer relative"
          >
            <Image
              src={img.url}
              alt="Evidence"
              fill
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

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
        .eq("status", "disputed")
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
            <div className="flex gap-6">
              <div>
                <p className="text-white/60 text-sm mb-1">Buyer</p>
                <p className="text-[#f5f7fb] font-medium">{dispute.buyer?.display_name || 'Unknown'}</p>
              </div>
              <div>
                <p className="text-white/60 text-sm mb-1">Seller</p>
                <p className="text-[#f5f7fb] font-medium">{dispute.seller?.display_name || 'Unknown'}</p>
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
              Dispute Details
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-white/60 text-sm mb-1">Reason</p>
                <p className="text-[#f5f7fb] font-medium">
                  {dispute.dispute_reason || 'Disputed'}
                </p>
              </div>

              <div className="flex items-center gap-2 text-white/40 text-sm">
                <Clock className="w-4 h-4" />
                {new Date(dispute.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Status Info */}
          <div className="relay-card p-5 border-l-4 border-l-blue-500">
            <h3 className="text-lg font-semibold text-[#f5f7fb] mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              Status Information
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-white/60 text-sm mb-2">Current Status</p>
                <p className="text-white/70 text-sm leading-relaxed">
                  {dispute.status === 'disputed' ? 'Open' : 'Resolved'}
                </p>
              </div>
            </div>
          </div>
        </div>

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

              <div className="flex gap-3">
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
