"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BRANDS, BRANDS_REQUIRING_REVIEW, CONDITIONS, BOX_CONDITIONS, APPROX_SIZINGS, SHOE_SIZES } from "@/lib/constants";
import { calculateFees, formatCurrency } from "@/lib/utils";
import { Camera, Plus, X, ChevronLeft, ChevronRight as ChevronRightIcon, DollarSign, Package, Check, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";

interface SizeRow {
  id: string;
  size: string;
  price: number;
  quantity: number;
}

interface UploadedPhoto {
  id: string;
  url: string;
  file: File;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ["Shoe Details", "Sizes & Pricing", "Photos & Description", "Review & Publish"];

export default function SellPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [isPublishing, setIsPublishing] = useState(false);

  // Step 1: Shoe Details
  const [brand, setBrand] = useState("");
  const [modelName, setModelName] = useState("");
  const [nickname, setNickname] = useState("");
  const [condition, setCondition] = useState("");
  const [boxCondition, setBoxCondition] = useState("");
  const [approximateSizing, setApproximateSizing] = useState("");

  // Step 2: Sizes & Pricing
  const [sizes, setSizes] = useState<SizeRow[]>([]);

  // Step 3: Photos & Description
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [draggedPhotos, setDraggedPhotos] = useState<{ [key: string]: number }>({});
  const [description, setDescription] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // UI State
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [publishedNeedsReview, setPublishedNeedsReview] = useState(false);
  const dragOverCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1 Validation
  const isStep1Valid = brand && modelName && condition && boxCondition && approximateSizing;

  // Step 2 Validation
  const isStep2Valid = sizes.length > 0 && sizes.every(s => s.size && s.price > 0 && s.quantity > 0);

  // Step 3 Validation
  const isStep3Valid = photos.length > 0 && description.trim().length >= 4;

  const handleNextStep = () => {
    if (currentStep === 1 && isStep1Valid) {
      setCurrentStep(2);
    } else if (currentStep === 2 && isStep2Valid) {
      setCurrentStep(3);
    } else if (currentStep === 3 && isStep3Valid) {
      setCurrentStep(4);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  // Size Management
  const addSize = () => {
    setSizes([
      ...sizes,
      {
        id: Math.random().toString(),
        size: "",
        price: 0,
        quantity: 1,
      },
    ]);
  };

  const updateSize = (id: string, field: string, value: any) => {
    setSizes(sizes.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const removeSize = (id: string) => {
    setSizes(sizes.filter(s => s.id !== id));
  };

  // Photo Management
  const handlePhotoUpload = (files: FileList | null) => {
    if (!files) return;

    const newPhotos: UploadedPhoto[] = [];
    Array.from(files).forEach(file => {
      if (file.type.startsWith("image/") && (photos.length + newPhotos.length) < 10) {
        const url = URL.createObjectURL(file);
        newPhotos.push({
          id: Math.random().toString(),
          url,
          file,
        });
      }
    });

    if (newPhotos.length > 0) {
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    dragOverCounter.current++;
  };

  const handleDragLeave = (e: React.DragEvent) => {
    dragOverCounter.current--;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragOverCounter.current = 0;
    handlePhotoUpload(e.dataTransfer.files);
  };

  const removePhoto = (id: string) => {
    setPhotos(photos.filter(p => p.id !== id));
  };

  const handlePhotoReorder = (fromIndex: number, toIndex: number) => {
    const newPhotos = [...photos];
    const [movedPhoto] = newPhotos.splice(fromIndex, 1);
    newPhotos.splice(toIndex, 0, movedPhoto);
    setPhotos(newPhotos);
  };

  const handlePublish = async () => {
    if (!currentUser?.id) {
      alert("You must be logged in to publish a listing");
      return;
    }

    setIsPublishing(true);

    try {
      const supabase = createClient();

      // Upload photos to storage
      const imageUrls: string[] = [];
      for (const photo of photos) {
        const fileName = `${currentUser!.id}/${Date.now()}-${photo.id}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("listing-images")
          .upload(fileName, photo.file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }

        const { data } = supabase.storage
          .from("listing-images")
          .getPublicUrl(fileName);

        imageUrls.push(data?.publicUrl || "");
      }

      // Create listing in database
      const { data, error } = await supabase
        .from("listings")
        .insert({
          seller_id: currentUser!.id,
          brand,
          model: modelName,
          nickname: nickname || null,
          condition,
          box_condition: boxCondition,
          approx_sizing: approximateSizing,
          description,
          images: imageUrls,
          sizes: sizes.map((s) => ({
            size: s.size,
            price: s.price,
            quantity: s.quantity,
          })),
          status: BRANDS_REQUIRING_REVIEW.has(brand) ? "pending_review" : "active",
        })
        .select()
        .single();

      if (error) {
        console.error("Database error:", error);
        alert("Failed to publish listing. Please try again.");
        return;
      }

      // Success
      setPublishedNeedsReview(BRANDS_REQUIRING_REVIEW.has(brand));
      setPublishSuccess(true);
    } catch (error) {
      console.error("Publish error:", error);
      alert("An error occurred while publishing your listing");
    } finally {
      setIsPublishing(false);
    }
  };

  const resetForm = () => {
    setBrand("");
    setModelName("");
    setNickname("");
    setCondition("");
    setBoxCondition("");
    setApproximateSizing("");
    setSizes([]);
    setPhotos([]);
    setDescription("");
    setAdditionalNotes("");
    setCurrentStep(1);
    setPublishSuccess(false);
  };

  // Calculate total potential earnings
  const totalEarnings = sizes.reduce((sum, size) => {
    if (size.price && size.quantity) {
      const fees = calculateFees(size.price);
      return sum + fees.sellerEarnings * size.quantity;
    }
    return sum;
  }, 0);

  if (publishSuccess) {
    return (
      <div className="max-w-2xl mx-auto">
          <div className="relay-card p-12 text-center">
            <div className="flex justify-center mb-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${publishedNeedsReview ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-emerald-500/20 border border-emerald-500/30'}`}>
                <Check size={32} className={publishedNeedsReview ? 'text-amber-400' : 'text-emerald-400'} />
              </div>
            </div>
            <h2 className="relay-title text-relay-text mb-2">{publishedNeedsReview ? 'Listing Submitted for Review' : 'Listing Published!'}</h2>
            <p className="text-relay-muted mb-8">
              {publishedNeedsReview
                ? 'Your listing has been submitted and is pending admin approval. You\'ll be notified once it\'s reviewed and goes live on the marketplace.'
                : 'Your shoe listing is now live on Relay. Buyers can start viewing and purchasing.'}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => router.push("/my-listings")}
                className="relay-button-accent"
              >
                View Listing
              </button>
              <button
                onClick={resetForm}
                className="relay-button-secondary"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <div className="relay-eyebrow text-relay-accent">NEW LISTING</div>
          <h1 className="relay-title text-relay-text mt-2">Sell Your Shoes</h1>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex justify-between mb-6">
            {STEP_LABELS.map((label, index) => {
              const stepNum = (index + 1) as Step;
              const isActive = stepNum === currentStep;
              const isCompleted = stepNum < currentStep;

              return (
                <div key={stepNum} className="flex-1 flex items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                      isActive
                        ? "bg-relay-accent-strong text-white"
                        : isCompleted
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-white/5 text-relay-muted border border-white/10"
                    }`}
                  >
                    {isCompleted ? <Check size={20} /> : stepNum}
                  </div>
                  <div className={`hidden sm:block text-xs font-medium ml-2 ${isActive ? "text-relay-accent" : "text-relay-subtle"}`}>
                    {label}
                  </div>
                  {index < STEP_LABELS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-2 rounded-full ${
                        isCompleted ? "bg-emerald-500/30" : "bg-white/10"
                      }`}
                    ></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Container */}
        <div className="relay-card p-8">
          {/* Step 1: Shoe Details */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Brand</label>
                <div className="relative">
                  <select
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="relay-select pr-10 appearance-none"
                  >
                    <option value="">Select a brand...</option>
                    <optgroup label="Special Categories">
                      <option value="Individual Brand">Individual Brand</option>
                      <option value="Custom">Custom</option>
                    </optgroup>
                    <optgroup label="Brands">
                      {BRANDS.filter(b => b !== 'Individual Brand' && b !== 'Custom').map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                </div>
                {BRANDS_REQUIRING_REVIEW.has(brand) && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-amber-300 text-sm font-medium mb-1">Admin Approval Required</p>
                    <p className="text-amber-200/60 text-xs leading-relaxed">
                      {brand === 'Individual Brand'
                        ? 'Listings for individual/independent brands are exempt from third-party authentication. Your listing will be reviewed by Relay admin before going live on the marketplace.'
                        : 'Custom-made shoes are unique and cannot go through standard authentication. Your listing will be reviewed by Relay admin before going live on the marketplace.'}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Model Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Air Jordan 1 Retro High OG"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="relay-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Nickname (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g., Chicago, Bred, etc."
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="relay-input"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Shoe Condition *</label>
                <div className="relative">
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="relay-select pr-10 appearance-none"
                  >
                    <option value="">Select condition...</option>
                    {Object.entries(CONDITIONS).map(([key, { label, description }]) => (
                      <option key={key} value={key}>
                        {label} - {description}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Box Condition *</label>
                <div className="relative">
                  <select
                    value={boxCondition}
                    onChange={(e) => setBoxCondition(e.target.value)}
                    className="relay-select pr-10 appearance-none"
                  >
                    <option value="">Select box condition...</option>
                    {Object.entries(BOX_CONDITIONS).map(([key, { label, description }]) => (
                      <option key={key} value={key}>
                        {label} - {description}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Approximate Sizing *</label>
                <div className="relative">
                  <select
                    value={approximateSizing}
                    onChange={(e) => setApproximateSizing(e.target.value)}
                    className="relay-select pr-10 appearance-none"
                  >
                    <option value="">Select sizing...</option>
                    {Object.entries(APPROX_SIZINGS).map(([key, { label, description }]) => (
                      <option key={key} value={key}>
                        {label} - {description}
                      </option>
                    ))}
                  </select>
                  <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={18} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Sizes & Pricing */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <p className="text-relay-muted text-sm mb-4">
                  Add each size you have available with its price and quantity.
                </p>
              </div>

              {sizes.length > 0 && (
                <div className="space-y-6">
                  {sizes.map((sizeRow) => {
                    const fees = sizeRow.price ? calculateFees(sizeRow.price) : null;
                    return (
                      <div key={sizeRow.id} className="border border-white/5 rounded-xl p-4 bg-white/[0.02]">
                        <div className="grid grid-cols-3 gap-4 mb-4">
                          {/* Size Dropdown */}
                          <div>
                            <label className="block text-xs font-medium text-relay-subtle mb-2">Size</label>
                            <div className="relative">
                              <select
                                value={sizeRow.size}
                                onChange={(e) => updateSize(sizeRow.id, "size", e.target.value)}
                                className="relay-select pr-8 appearance-none"
                              >
                                <option value="">Select...</option>
                                {SHOE_SIZES.map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 text-relay-subtle pointer-events-none" size={16} style={{ transform: 'translateY(-50%) rotate(90deg)' }} />
                            </div>
                          </div>

                          {/* Price Input */}
                          <div>
                            <label className="block text-xs font-medium text-relay-subtle mb-2">Price</label>
                            <div className="relative">
                              <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-relay-subtle" />
                              <input
                                type="number"
                                placeholder="0.00"
                                value={sizeRow.price || ""}
                                onChange={(e) => updateSize(sizeRow.id, "price", parseFloat(e.target.value) || 0)}
                                className="relay-input"
                                style={{ paddingLeft: '2rem' }}
                                min="0"
                                step="0.01"
                              />
                            </div>
                          </div>

                          {/* Quantity Input */}
                          <div>
                            <label className="block text-xs font-medium text-relay-subtle mb-2">Qty</label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder="1"
                                value={sizeRow.quantity || ""}
                                onChange={(e) => updateSize(sizeRow.id, "quantity", parseInt(e.target.value) || 1)}
                                className="relay-input"
                                min="1"
                              />
                              <button
                                onClick={() => removeSize(sizeRow.id)}
                                className="px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-relay-text"
                              >
                                <X size={18} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Fee Breakdown */}
                        {fees && sizeRow.price > 0 && (
                          <div className="text-xs space-y-1 pt-3 border-t border-white/5">
                            <div className="flex justify-between text-relay-muted">
                              <span>Relay fee (1%):</span>
                              <span>{formatCurrency(fees.platformFee)}</span>
                            </div>
                            <div className="flex justify-between text-relay-muted">
                              <span>Stripe fee (3% + $0.30):</span>
                              <span>{formatCurrency(fees.stripeFee)}</span>
                            </div>
                            <div className="flex justify-between text-emerald-400 font-medium">
                              <span>Your earnings:</span>
                              <span>{formatCurrency(fees.sellerEarnings)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                onClick={addSize}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 hover:border-relay-accent/50 hover:bg-relay-accent/5 transition-all text-relay-accent font-medium"
              >
                <Plus size={18} />
                Add Size
              </button>
            </div>
          )}

          {/* Step 3: Photos & Description */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Photo Upload Area */}
              <div>
                <label className="block text-sm font-medium text-relay-text mb-3">Photos *</label>
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative border-2 border-dashed rounded-2xl p-8 transition-all ${
                    dragOverCounter.current > 0
                      ? "border-relay-accent bg-relay-accent/5"
                      : "border-white/20 bg-white/[0.02] hover:border-white/30"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => handlePhotoUpload(e.target.files)}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 text-center"
                  >
                    <Camera size={32} className="text-relay-accent" />
                    <span className="font-medium text-relay-text">Drag & drop photos or click to upload</span>
                    <span className="text-sm text-relay-subtle">Up to 10 photos. First photo is cover.</span>
                  </button>
                </div>
              </div>

              {/* Photo Grid */}
              {photos.length > 0 && (
                <div>
                  <p className="text-sm text-relay-muted mb-3">
                    {photos.length} of 10 photos ({photos.length === 1 ? "cover" : "first is cover"})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="relative group rounded-xl overflow-hidden bg-white/[0.02] border border-white/10 aspect-square"
                      >
                        <img
                          src={photo.url}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />

                        {/* Cover Badge */}
                        {index === 0 && (
                          <div className="absolute top-2 left-2">
                            <span className="relay-badge-info text-xs">Cover</span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          {index > 0 && (
                            <button
                              onClick={() => handlePhotoReorder(index, index - 1)}
                              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                              title="Move left"
                            >
                              <ChevronLeft size={18} className="text-white" />
                            </button>
                          )}
                          <button
                            onClick={() => removePhoto(photo.id)}
                            className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 transition-colors"
                          >
                            <X size={18} className="text-red-400" />
                          </button>
                          {index < photos.length - 1 && (
                            <button
                              onClick={() => handlePhotoReorder(index, index + 1)}
                              className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                              title="Move right"
                            >
                              <ChevronRightIcon size={18} className="text-white" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Description *</label>
                <textarea
                  placeholder="Describe the condition, any defects, original packaging, etc. (minimum 4 characters)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  minLength={4}
                  rows={4}
                  className="relay-textarea"
                />
                <p className="text-xs text-relay-subtle mt-1">
                  {description.length} characters (minimum 4)
                </p>
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-sm font-medium text-relay-text mb-2">Additional Notes (Optional)</label>
                <textarea
                  placeholder="Any other details about the shoes..."
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  rows={3}
                  className="relay-textarea"
                />
              </div>
            </div>
          )}

          {/* Step 4: Review & Publish */}
          {currentStep === 4 && (
            <div className="space-y-8">
              {BRANDS_REQUIRING_REVIEW.has(brand) && (
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-amber-300 text-sm font-semibold mb-1">This listing requires admin approval</p>
                  <p className="text-amber-200/60 text-xs leading-relaxed">
                    Because this is {brand === 'Individual Brand' ? 'an individual brand' : 'a custom shoe'} listing, it will be submitted for review instead of going live immediately. A Relay admin will review your listing details and approve or reject it.
                  </p>
                </div>
              )}
              {/* Shoe Details Summary */}
              <div>
                <h3 className="text-sm font-semibold text-relay-text mb-4 flex items-center gap-2">
                  <Package size={16} className="text-relay-accent" />
                  Shoe Details
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">Brand</p>
                    <p className="text-relay-text font-medium">{brand}</p>
                  </div>
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">Model</p>
                    <p className="text-relay-text font-medium">{modelName}</p>
                  </div>
                  {nickname && (
                    <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                      <p className="text-relay-subtle mb-1">Nickname</p>
                      <p className="text-relay-text font-medium">{nickname}</p>
                    </div>
                  )}
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">Shoe Condition</p>
                    <p className="text-relay-text font-medium">
                      {Object.values(CONDITIONS).find(c => Object.keys(CONDITIONS).find(k => k === condition) === condition)?.label || condition}
                    </p>
                  </div>
                  <div className="border border-white/5 rounded-lg p-3 bg-white/[0.02]">
                    <p className="text-relay-subtle mb-1">Box Condition</p>
                    <p className="text-relay-text font-medium">
                      {Object.values(BOX_CONDITIONS).find(c => Object.keys(BOX_CONDITIONS).find(k => k === boxCondition) === boxCondition)?.label || boxCondition}
                    </p>
                  </div>
                </div>
              </div>

              {/* Sizes & Pricing Summary */}
              <div>
                <h3 className="text-sm font-semibold text-relay-text mb-4 flex items-center gap-2">
                  <DollarSign size={16} className="text-relay-accent" />
                  Sizes & Pricing
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left py-2 px-3 text-relay-subtle font-medium">Size</th>
                        <th className="text-left py-2 px-3 text-relay-subtle font-medium">Price</th>
                        <th className="text-left py-2 px-3 text-relay-subtle font-medium">Qty</th>
                        <th className="text-right py-2 px-3 text-relay-subtle font-medium">Your Earnings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sizes.map(sizeRow => {
                        const fees = calculateFees(sizeRow.price);
                        return (
                          <tr key={sizeRow.id} className="border-b border-white/5">
                            <td className="py-3 px-3 text-relay-text font-medium">Size {sizeRow.size}</td>
                            <td className="py-3 px-3 text-relay-text">{formatCurrency(sizeRow.price)}</td>
                            <td className="py-3 px-3 text-relay-text">{sizeRow.quantity}</td>
                            <td className="py-3 px-3 text-emerald-400 font-medium text-right">
                              {formatCurrency(fees.sellerEarnings * sizeRow.quantity)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Photos Summary */}
              {photos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-relay-text mb-4 flex items-center gap-2">
                    <Camera size={16} className="text-relay-accent" />
                    Photos ({photos.length})
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.id}
                        className="relative rounded-lg overflow-hidden bg-white/[0.02] border border-white/10 aspect-square"
                      >
                        <img
                          src={photo.url}
                          alt={`Photo ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {index === 0 && (
                          <div className="absolute top-1 left-1">
                            <span className="relay-badge-info text-xs">Cover</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Description Preview */}
              {/* Description Preview */}
              <div>
                <h3 className="text-sm font-semibold text-relay-text mb-2">Description</h3>
                <p className="text-relay-muted text-sm bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  {description}
                </p>
              </div>

              {/* Total Earnings */}
              <div className="border-t border-white/10 pt-6">
                <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-relay-subtle text-sm mb-2">Total Potential Earnings</p>
                  <p className="text-3xl font-bold text-emerald-400">
                    {formatCurrency(totalEarnings)}
                  </p>
                  <p className="text-xs text-relay-subtle mt-2">
                    Based on all sizes and quantities listed
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-4 mt-8 pt-8 border-t border-white/10">
            {currentStep > 1 && (
              <button
                onClick={handlePreviousStep}
                className="relay-button-secondary flex-1"
              >
                Back
              </button>
            )}

            {currentStep < 4 && (
              <button
                onClick={handleNextStep}
                disabled={
                  (currentStep === 1 && !isStep1Valid) ||
                  (currentStep === 2 && !isStep2Valid) ||
                  (currentStep === 3 && !isStep3Valid)
                }
                className="relay-button-accent flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            )}

            {currentStep === 4 && (
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="relay-button-accent flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPublishing ? "Publishing..." : BRANDS_REQUIRING_REVIEW.has(brand) ? "Submit for Review" : "Publish Listing"}
              </button>
            )}

            {currentStep === 4 && (
              <button
                onClick={() => setCurrentStep(1)}
                className="relay-button-secondary flex-1"
              >
                Save as Draft
              </button>
            )}
          </div>
        </div>
      </div>
  );
}
