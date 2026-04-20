"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BRANDS, CONDITIONS, BOX_CONDITIONS, APPROX_SIZINGS, SHOE_SIZES } from "@/lib/constants";
import { calculateFees, formatCurrency } from "@/lib/utils";
import { Camera, Plus, X, DollarSign, ChevronRight, ChevronLeft, ChevronRight as ChevronRightIcon, Save, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";

interface SizeRow {
  id: string;
  size: string;
  price: number;
  quantity: number;
}

export default function EditListingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Listing fields
  const [brand, setBrand] = useState("");
  const [modelName, setModelName] = useState("");
  const [nickname, setNickname] = useState("");
  const [condition, setCondition] = useState("");
  const [boxCondition, setBoxCondition] = useState("");
  const [approximateSizing, setApproximateSizing] = useState("");
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchListing() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("id", params.id)
        .single();

      if (error || !data) {
        console.error("Error fetching listing:", error);
        setLoading(false);
        return;
      }

      // Verify ownership
      if (data.seller_id !== currentUser?.id) {
        router.push("/my-listings");
        return;
      }

      setBrand(data.brand);
      setModelName(data.model);
      setNickname(data.nickname || "");
      setCondition(data.condition);
      setBoxCondition(data.box_condition);
      setApproximateSizing(data.approx_sizing || "");
      setDescription(data.description || "");
      setExistingImages(data.images || []);
      setSizes(
        (data.sizes as any[])?.map((s: any, i: number) => ({
          id: `existing-${i}`,
          size: s.size?.toString() || "",
          price: s.price || 0,
          quantity: s.quantity || 1,
        })) || []
      );
      setLoading(false);
    }

    if (currentUser?.id) {
      fetchListing();
    }
  }, [params.id, currentUser?.id]);

  const addSize = () => {
    setSizes([...sizes, { id: Math.random().toString(), size: "", price: 0, quantity: 1 }]);
  };

  const updateSize = (id: string, field: string, value: any) => {
    setSizes(sizes.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const removeSize = (id: string) => {
    setSizes(sizes.filter((s) => s.id !== id));
  };

  const removeExistingImage = (index: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNewPhotoUpload = async (files: FileList | null) => {
    if (!files || !currentUser?.id) return;
    const supabase = createClient();

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/") || existingImages.length >= 10) continue;

      const fileName = `${currentUser!.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("listing-images")
        .upload(fileName, file);

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      const { data } = supabase.storage.from("listing-images").getPublicUrl(fileName);
      if (data?.publicUrl) {
        setExistingImages((prev) => [...prev, data.publicUrl]);
      }
    }
  };

  const handleSave = async () => {
    if (!currentUser?.id) return;
    setSaving(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("listings")
        .update({
          brand,
          model: modelName,
          nickname: nickname || null,
          condition,
          box_condition: boxCondition,
          approx_sizing: approximateSizing,
          description,
          images: existingImages,
          sizes: sizes.map((s) => ({
            size: s.size,
            price: s.price,
            quantity: s.quantity,
          })),
        })
        .eq("id", params.id)
        .eq("seller_id", currentUser!.id);

      if (error) throw error;

      router.push("/my-listings");
    } catch (error) {
      console.error("Save error:", error);
      alert("Failed to save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="relay-empty text-center">Loading listing...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <button
          onClick={() => router.push("/my-listings")}
          className="p-2 rounded-lg hover:bg-white/[0.08] transition-colors text-white/60 hover:text-relay-text"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div className="relay-eyebrow text-relay-accent">EDIT</div>
          <h1 className="relay-title text-relay-text mt-1">Edit Listing</h1>
        </div>
      </div>

      <div className="relay-card p-8 space-y-8">
        {/* Shoe Details */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-relay-text border-b border-white/10 pb-3">Shoe Details</h2>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Brand</label>
            <div className="relative">
              <select value={brand} onChange={(e) => setBrand(e.target.value)} className="relay-select pr-10 appearance-none">
                <option value="">Select a brand...</option>
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Model Name</label>
            <input type="text" value={modelName} onChange={(e) => setModelName(e.target.value)} className="relay-input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Nickname (Optional)</label>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="relay-input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Shoe Condition</label>
            <div className="relative">
              <select value={condition} onChange={(e) => setCondition(e.target.value)} className="relay-select pr-10 appearance-none">
                <option value="">Select condition...</option>
                {Object.entries(CONDITIONS).map(([key, { label, description }]) => (
                  <option key={key} value={key}>{label} - {description}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Box Condition</label>
            <div className="relative">
              <select value={boxCondition} onChange={(e) => setBoxCondition(e.target.value)} className="relay-select pr-10 appearance-none">
                <option value="">Select box condition...</option>
                {Object.entries(BOX_CONDITIONS).map(([key, { label, description }]) => (
                  <option key={key} value={key}>{label} - {description}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-relay-text mb-2">Approximate Sizing</label>
            <div className="relative">
              <select value={approximateSizing} onChange={(e) => setApproximateSizing(e.target.value)} className="relay-select pr-10 appearance-none">
                <option value="">Select sizing...</option>
                {Object.entries(APPROX_SIZINGS).map(([key, { label, description }]) => (
                  <option key={key} value={key}>{label} - {description}</option>
                ))}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
            </div>
          </div>
        </div>

        {/* Sizes & Pricing */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-relay-text border-b border-white/10 pb-3">Sizes & Pricing</h2>

          {sizes.map((sizeRow) => {
            const fees = sizeRow.price ? calculateFees(sizeRow.price) : null;
            return (
              <div key={sizeRow.id} className="border border-white/5 rounded-xl p-4 bg-white/[0.02]">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-relay-subtle mb-2">Size</label>
                    <div className="relative">
                      <select value={sizeRow.size} onChange={(e) => updateSize(sizeRow.id, "size", e.target.value)} className="relay-select pr-8 appearance-none">
                        <option value="">Select...</option>
                        {SHOE_SIZES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={16} style={{ transform: "translateY(-50%) rotate(90deg)" }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-relay-subtle mb-2">Price</label>
                    <div className="relative">
                      <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-relay-subtle" />
                      <input type="number" value={sizeRow.price || ""} onChange={(e) => updateSize(sizeRow.id, "price", parseFloat(e.target.value) || 0)} className="relay-input" style={{ paddingLeft: "2rem" }} min="0" step="0.01" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-relay-subtle mb-2">Qty</label>
                    <div className="flex gap-2">
                      <input type="number" value={sizeRow.quantity || ""} onChange={(e) => updateSize(sizeRow.id, "quantity", parseInt(e.target.value) || 1)} className="relay-input" min="1" />
                      <button onClick={() => removeSize(sizeRow.id)} className="px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-relay-text">
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                </div>
                {fees && sizeRow.price > 0 && (
                  <div className="text-xs space-y-1 pt-3 border-t border-white/5">
                    <div className="flex justify-between text-relay-muted"><span>Relay fee (1%):</span><span>{formatCurrency(fees.platformFee)}</span></div>
                    <div className="flex justify-between text-relay-muted"><span>Stripe fee (3% + $0.30):</span><span>{formatCurrency(fees.stripeFee)}</span></div>
                    <div className="flex justify-between text-emerald-400 font-medium"><span>Your earnings:</span><span>{formatCurrency(fees.sellerEarnings)}</span></div>
                  </div>
                )}
              </div>
            );
          })}

          <button onClick={addSize} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 hover:border-relay-accent/50 hover:bg-relay-accent/5 transition-all text-relay-accent font-medium">
            <Plus size={18} />
            Add Size
          </button>
        </div>

        {/* Photos */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-relay-text border-b border-white/10 pb-3">Photos</h2>

          {existingImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {existingImages.map((url, index) => (
                <div key={index} className="relative group rounded-xl overflow-hidden bg-white/[0.02] border border-white/10 aspect-square">
                  <img src={url} alt={`Photo ${index + 1}`} className="w-full h-full object-cover" />
                  {index === 0 && (
                    <div className="absolute top-2 left-2">
                      <span className="relay-badge-info text-xs">Cover</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={() => removeExistingImage(index)} className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors">
                      <X size={18} className="text-red-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-2 border-dashed rounded-2xl p-6 border-white/20 bg-white/[0.02] hover:border-white/30 transition-all">
            <input ref={fileInputRef} type="file" multiple accept="image/*" onChange={(e) => handleNewPhotoUpload(e.target.files)} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="w-full flex flex-col items-center justify-center gap-2 text-center">
              <Camera size={28} className="text-relay-accent" />
              <span className="font-medium text-relay-text text-sm">Add more photos</span>
              <span className="text-xs text-relay-subtle">{existingImages.length} of 10 photos</span>
            </button>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-relay-text border-b border-white/10 pb-3">Description</h2>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="relay-textarea" placeholder="Describe the condition, any defects, original packaging, etc." />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-6 border-t border-white/10">
          <button onClick={() => router.push("/my-listings")} className="relay-button-secondary flex-1">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} className="relay-button-accent flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            <Save size={18} />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
