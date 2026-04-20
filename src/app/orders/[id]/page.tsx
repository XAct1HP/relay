"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase"
import { useAuth } from "@/hooks/useAuth"
import {
  ArrowLeft,
  Package,
  Clock,
  CheckCircle2,
  AlertCircle,
  Download,
  Copy,
  Check,
  Star,
  Upload,
  X,
  Eye,
  Shield,
  MapPin,
  User,
  ChevronDown,
  QrCode,
  FileText,
  Loader2,
} from "lucide-react"

type OrderStatus = "paid" | "auth_submitted" | "label_created" | "shipped" | "delivered" | "review_window" | "completed" | "disputed" | "cancelled" | "refunded"
type UserRole = "buyer" | "seller"

interface ShippingAddress {
  name: string
  street: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
}

interface OrderData {
  id: string
  userRole: UserRole
  status: OrderStatus
  orderDate: string
  shoeImage: string
  brand: string
  model: string
  size: string
  price: number
  shippingCost: number
  platformFee: number
  stripeFee: number
  sellerEarnings: number
  totalPrice: number
  buyerShippingAddress: ShippingAddress | null
  sellerName: string
  sellerProfileUrl: string
  sellerShipFromAddress: ShippingAddress | null
  trackingNumber?: string
  shippingLabelUrl?: string
  authPhotos?: string[]
  checkcheckCertificateUrl?: string
  challengeCode?: string
  disputeReason?: string
  disputeTextBuyer?: string
  disputeTextSeller?: string
  disputeEvidenceBuyer?: string[]
  disputeEvidenceSeller?: string[]
  reviewRating?: number
  reviewComment?: string
  shippingDeadline?: string
  reviewDeadline?: string
}

const statusStages = ["paid", "auth_submitted", "label_created", "shipped", "delivered", "review_window", "completed"] as const

const stageLabels: Record<string, string> = {
  paid: "Payment",
  auth_submitted: "Authentication",
  label_created: "Label Created",
  shipped: "Shipped",
  delivered: "Delivered",
  review_window: "Review",
  completed: "Complete",
}

const statusConfig: Record<OrderStatus, { label: string; icon: React.ReactNode; color: string }> = {
  paid: { label: "Payment Received", icon: <Package className="w-4 h-4" />, color: "bg-blue-500/20 text-blue-300" },
  auth_submitted: { label: "Auth Submitted", icon: <Clock className="w-4 h-4" />, color: "bg-purple-500/20 text-purple-300" },
  label_created: { label: "Label Created", icon: <Package className="w-4 h-4" />, color: "bg-indigo-500/20 text-indigo-300" },
  shipped: { label: "Shipped", icon: <Package className="w-4 h-4" />, color: "bg-cyan-500/20 text-cyan-300" },
  delivered: { label: "Delivered", icon: <CheckCircle2 className="w-4 h-4" />, color: "bg-green-500/20 text-green-300" },
  review_window: { label: "Review Window", icon: <Clock className="w-4 h-4" />, color: "bg-amber-500/20 text-amber-300" },
  completed: { label: "Completed", icon: <CheckCircle2 className="w-4 h-4" />, color: "bg-emerald-500/20 text-emerald-300" },
  disputed: { label: "Disputed", icon: <AlertCircle className="w-4 h-4" />, color: "bg-red-500/20 text-red-300" },
  cancelled: { label: "Cancelled", icon: <AlertCircle className="w-4 h-4" />, color: "bg-gray-500/20 text-gray-300" },
  refunded: { label: "Refunded", icon: <AlertCircle className="w-4 h-4" />, color: "bg-gray-500/20 text-gray-300" },
}

const AUTH_ANGLES = ["Front", "Back", "Left", "Right", "Sole", "Tag", "Challenge Code", "Box Label"]

// ── Helper: format address ──
function formatAddress(addr: ShippingAddress | null): string {
  if (!addr) return "N/A"
  const parts = [addr.name, addr.street]
  if (addr.street2) parts.push(addr.street2)
  parts.push(`${addr.city}, ${addr.state} ${addr.zip}`)
  if (addr.country) parts.push(addr.country)
  return parts.join("\n")
}

// ── ProgressTracker ──
const ProgressTracker = ({ currentStatus }: { currentStatus: OrderStatus }) => {
  const stageIndex = statusStages.indexOf(currentStatus as any)

  return (
    <div className="relay-card p-6 mb-6">
      <div className="flex items-center justify-between">
        {statusStages.map((stage, idx) => {
          const isCompleted = idx < stageIndex
          const isCurrent = idx === stageIndex

          return (
            <div key={stage} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? "bg-emerald-500/30 text-emerald-300"
                      : isCurrent
                        ? "bg-[#5f8fff] text-white ring-2 ring-[#5f8fff] ring-offset-2 ring-offset-[#06070a]"
                        : "bg-white/5 text-white/40"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <span className="text-xs font-bold">{idx + 1}</span>
                  )}
                </div>
                <p className="text-xs font-medium text-[#7ca6ff] mt-2 text-center">
                  {stageLabels[stage]}
                </p>
              </div>

              {idx < statusStages.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 transition-all ${
                    isCompleted ? "bg-emerald-500/40" : "bg-white/10"
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── PhotoUploadGrid (wired) ──
const PhotoUploadGrid = ({
  angles,
  uploadedUrls,
  onFileSelected,
  uploading,
}: {
  angles: string[]
  uploadedUrls: Record<string, string>
  onFileSelected: (angle: string, file: File) => void
  uploading: Record<string, boolean>
}) => {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {angles.map((angle) => {
        const url = uploadedUrls[angle]
        const isUploading = uploading[angle]

        return (
          <div key={angle} className="relative">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={(el) => { fileRefs.current[angle] = el }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFileSelected(angle, f)
              }}
            />
            <button
              onClick={() => fileRefs.current[angle]?.click()}
              disabled={isUploading}
              className={`aspect-square w-full border rounded-xl transition-all flex flex-col items-center justify-center p-3 text-center cursor-pointer ${
                url
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-[#7ca6ff] animate-spin mb-2" />
              ) : url ? (
                <img src={url} alt={angle} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-[#7ca6ff] mb-2" />
                  <p className="text-xs text-[#f5f7fb]">{angle}</p>
                </>
              )}
            </button>
            {url && !isUploading && (
              <div className="absolute top-1 right-1 bg-emerald-500 rounded-full p-0.5">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── RatingModal ──
const RatingModal = ({
  onSubmit,
  onClose,
  submitting,
}: {
  onSubmit: (rating: number, comment: string) => void
  onClose: () => void
  submitting: boolean
}) => {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [hoveredRating, setHoveredRating] = useState(0)

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="relay-card p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#f5f7fb]">Rate Your Experience</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex justify-center gap-3 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onMouseEnter={() => setHoveredRating(star)}
              onMouseLeave={() => setHoveredRating(0)}
              onClick={() => setRating(star)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`w-8 h-8 transition-all ${
                  star <= (hoveredRating || rating)
                    ? "fill-[#5f8fff] text-[#5f8fff]"
                    : "text-white/20"
                }`}
              />
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Optional: Tell us about your experience..."
          className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-[#f5f7fb] placeholder-white/40 text-sm mb-4 focus:outline-none focus:border-[#5f8fff]"
          rows={3}
        />

        <button
          onClick={() => onSubmit(rating, comment)}
          disabled={rating === 0 || submitting}
          className="relay-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit Review & Complete Order
        </button>
      </div>
    </div>
  )
}

// ── DisputeForm (wired with evidence upload) ──
const DisputeForm = ({
  orderId,
  onSubmit,
  onCancel,
  submitting,
}: {
  orderId: string
  onSubmit: (reason: string, description: string, evidenceUrls: string[]) => void
  onCancel: () => void
  submitting: boolean
}) => {
  const [reason, setReason] = useState("")
  const [description, setDescription] = useState("")
  const [showReasonDropdown, setShowReasonDropdown] = useState(false)
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [evidencePreviews, setEvidencePreviews] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const evidenceInputRef = useRef<HTMLInputElement>(null)

  const reasons = [
    "Item not as described",
    "Wrong item received",
    "Item damaged",
    "Authentication concerns",
    "Other",
  ]

  const handleAddEvidence = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (evidenceFiles.length + files.length > 5) {
      alert("Maximum 5 evidence photos allowed")
      return
    }
    setEvidenceFiles((prev) => [...prev, ...files])
    files.forEach((f) => {
      const url = URL.createObjectURL(f)
      setEvidencePreviews((prev) => [...prev, url])
    })
  }

  const handleRemoveEvidence = (idx: number) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx))
    setEvidencePreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSubmit = async () => {
    setUploading(true)
    try {
      const supabase = createClient()
      const uploadedUrls: string[] = []

      for (let i = 0; i < evidenceFiles.length; i++) {
        const file = evidenceFiles[i]
        const ext = file.name.split(".").pop() || "jpg"
        const path = `${orderId}/dispute-buyer-${i}.${ext}`
        const { error } = await supabase.storage
          .from("order-photos")
          .upload(path, file, { upsert: true })
        if (!error) {
          const { data: urlData } = supabase.storage
            .from("order-photos")
            .getPublicUrl(path)
          uploadedUrls.push(urlData.publicUrl)
        }
      }

      onSubmit(reason, description, uploadedUrls)
    } catch {
      setUploading(false)
    }
  }

  return (
    <div className="relay-card p-6 mb-6 border border-red-500/20 bg-red-500/5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[#f5f7fb]">What&apos;s wrong with your order?</h3>
        <button onClick={onCancel} className="text-white/40 hover:text-white/70">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#f5f7fb] mb-2">Reason</label>
          <div className="relative">
            <button
              onClick={() => setShowReasonDropdown(!showReasonDropdown)}
              className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-left text-[#f5f7fb] flex items-center justify-between hover:bg-white/10 transition-all"
            >
              <span>{reason || "Select a reason..."}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {showReasonDropdown && (
              <div className="absolute top-full left-0 right-0 bg-[#0a0d10] border border-white/10 rounded-lg mt-1 z-10">
                {reasons.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setReason(r)
                      setShowReasonDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-[#f5f7fb] hover:bg-white/10 text-sm"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#f5f7fb] mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue in detail..."
            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-[#f5f7fb] placeholder-white/40 text-sm focus:outline-none focus:border-red-500"
            rows={4}
          />
        </div>

        <div>
          <input
            ref={evidenceInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleAddEvidence}
          />

          {evidencePreviews.length > 0 && (
            <div className="grid grid-cols-5 gap-2 mb-3">
              {evidencePreviews.map((url, i) => (
                <div key={i} className="relative aspect-square">
                  <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover rounded-lg" />
                  <button
                    onClick={() => handleRemoveEvidence(i)}
                    className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => evidenceInputRef.current?.click()}
            disabled={evidenceFiles.length >= 5}
            className="w-full border-2 border-dashed border-white/10 rounded-lg p-6 text-center cursor-pointer hover:border-white/20 transition-all disabled:opacity-50"
          >
            <Upload className="w-6 h-6 text-[#7ca6ff] mx-auto mb-2" />
            <p className="text-sm text-[#f5f7fb]">Upload evidence photos ({evidenceFiles.length}/5)</p>
            <p className="text-xs text-white/40 mt-1">Click to select files</p>
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!reason || !description || submitting || uploading}
          className="relay-button-danger w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {(submitting || uploading) && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit Complaint
        </button>

        <p className="text-xs text-[#7ca6ff] text-center">
          Your complaint will be reviewed by admin
        </p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
// Main component
// ══════════════════════════════════════════════
export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { currentUser } = useAuth()
  const [order, setOrder] = useState<OrderData | null>(null)
  const [statusOverride, setStatusOverride] = useState<OrderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [showAuthForm, setShowAuthForm] = useState(false)
  const [showQrCode, setShowQrCode] = useState(false)
  const [copied, setCopied] = useState(false)

  // Action loading states
  const [submittingAuth, setSubmittingAuth] = useState(false)
  const [generatingLabel, setGeneratingLabel] = useState(false)
  const [markingDelivered, setMarkingDelivered] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const [submittingSellerEvidence, setSubmittingSellerEvidence] = useState(false)

  // Auth photo upload state
  const [authPhotoUrls, setAuthPhotoUrls] = useState<Record<string, string>>({})
  const [authPhotoUploading, setAuthPhotoUploading] = useState<Record<string, boolean>>({})
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null)
  const [certificateUploading, setCertificateUploading] = useState(false)
  const certificateInputRef = useRef<HTMLInputElement>(null)

  // Seller dispute response state
  const [sellerResponse, setSellerResponse] = useState("")
  const [sellerEvidenceFiles, setSellerEvidenceFiles] = useState<File[]>([])
  const [sellerEvidencePreviews, setSellerEvidencePreviews] = useState<string[]>([])
  const sellerEvidenceInputRef = useRef<HTMLInputElement>(null)

  // ── Load order ──
  const loadOrder = useCallback(async () => {
    if (!currentUser?.id) return
    const supabase = createClient()

    const { data, error: fetchError } = await supabase
      .from("orders")
      .select(`
        *,
        listings(*),
        buyer:profiles!orders_buyer_id_fkey(*),
        seller:profiles!orders_seller_id_fkey(*)
      `)
      .eq("id", params.id)
      .single()

    if (fetchError || !data) {
      setError(fetchError?.message || "Order not found")
      setLoading(false)
      return
    }

    const isBuyer = data.buyer_id === currentUser.id
    const sellerProfile = data.seller
    const listing = data.listings

    const orderData: OrderData = {
      id: data.id,
      userRole: isBuyer ? "buyer" : "seller",
      status: data.status || "paid",
      orderDate: new Date(data.created_at).toLocaleDateString(),
      shoeImage: listing?.images?.[0] || "/placeholder-shoe.png",
      brand: listing?.brand || "Unknown",
      model: listing?.model || "Unknown",
      size: data.size || "N/A",
      price: data.price || 0,
      shippingCost: data.shipping_cost || 0,
      platformFee: data.platform_fee || 0,
      stripeFee: data.stripe_fee || 0,
      sellerEarnings: data.seller_earnings || 0,
      totalPrice: (data.price || 0) + (data.shipping_cost || 0) + (data.platform_fee || 0) + (data.stripe_fee || 0),
      buyerShippingAddress: data.buyer_shipping_address || null,
      sellerName: sellerProfile?.full_name || sellerProfile?.display_name || sellerProfile?.username || "Unknown Seller",
      sellerProfileUrl: `/profile/${sellerProfile?.username || ""}`,
      sellerShipFromAddress: sellerProfile?.ship_from_address || null,
      trackingNumber: data.tracking_number || undefined,
      shippingLabelUrl: data.shipping_label_url || undefined,
      authPhotos: data.auth_photos || undefined,
      checkcheckCertificateUrl: data.checkcheck_certificate_url || undefined,
      challengeCode: data.challenge_code || undefined,
      disputeReason: data.dispute_reason || undefined,
      disputeTextBuyer: data.dispute_text_buyer || undefined,
      disputeTextSeller: data.dispute_text_seller || undefined,
      disputeEvidenceBuyer: data.dispute_evidence_buyer || undefined,
      disputeEvidenceSeller: data.dispute_evidence_seller || undefined,
      reviewRating: data.review_rating || undefined,
      reviewComment: data.review_comment || undefined,
      shippingDeadline: data.shipping_deadline
        ? new Date(data.shipping_deadline).toLocaleDateString()
        : undefined,
      reviewDeadline: data.review_deadline
        ? new Date(data.review_deadline).toLocaleDateString()
        : undefined,
    }

    setOrder(orderData)
    setStatusOverride(null)
    setLoading(false)
  }, [params.id, currentUser?.id])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  // ── Helpers ──
  const currentStatus = statusOverride || order?.status || "paid"

  const handleCopyTracking = () => {
    if (order?.trackingNumber) {
      navigator.clipboard.writeText(order.trackingNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCopyChallengeCode = () => {
    if (order?.challengeCode) {
      navigator.clipboard.writeText(order.challengeCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Auth photo upload to Supabase storage ──
  const handleAuthPhotoUpload = async (angle: string, file: File) => {
    if (!order) return
    setAuthPhotoUploading((prev) => ({ ...prev, [angle]: true }))

    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() || "jpg"
      const safeName = angle.toLowerCase().replace(/\s+/g, "-")
      const path = `${order.id}/${safeName}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("order-photos")
        .upload(path, file, { upsert: true })

      if (uploadError) {
        console.error("Upload error:", uploadError)
        alert(`Failed to upload ${angle} photo: ${uploadError.message}`)
        return
      }

      const { data: urlData } = supabase.storage
        .from("order-photos")
        .getPublicUrl(path)

      setAuthPhotoUrls((prev) => ({ ...prev, [angle]: urlData.publicUrl }))
    } catch (err) {
      console.error("Upload failed:", err)
    } finally {
      setAuthPhotoUploading((prev) => ({ ...prev, [angle]: false }))
    }
  }

  // ── Certificate upload ──
  const handleCertificateUpload = async (file: File) => {
    if (!order) return
    setCertificateUploading(true)

    try {
      const supabase = createClient()
      const ext = file.name.split(".").pop() || "jpg"
      const path = `${order.id}/checkcheck-certificate.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("order-photos")
        .upload(path, file, { upsert: true })

      if (uploadError) {
        alert(`Failed to upload certificate: ${uploadError.message}`)
        return
      }

      const { data: urlData } = supabase.storage
        .from("order-photos")
        .getPublicUrl(path)

      setCertificateUrl(urlData.publicUrl)
    } catch (err) {
      console.error("Certificate upload failed:", err)
    } finally {
      setCertificateUploading(false)
    }
  }

  // ── Submit authentication ──
  const handleSubmitAuth = async () => {
    if (!order) return
    setSubmittingAuth(true)
    setError(null)

    try {
      const photoUrls = AUTH_ANGLES.map((angle) => authPhotoUrls[angle]).filter(Boolean)
      if (photoUrls.length < 8 || !certificateUrl) {
        alert("Please upload all 8 photos and the CheckCheck certificate before submitting.")
        setSubmittingAuth(false)
        return
      }

      const res = await fetch(`/api/orders/${order.id}/auth-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authPhotos: photoUrls,
          checkcheckCertificateUrl: certificateUrl,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to submit authentication")
      }

      // Update local state
      setOrder((prev) =>
        prev ? { ...prev, status: "auth_submitted", authPhotos: photoUrls, checkcheckCertificateUrl: certificateUrl } : prev
      )
      setShowAuthForm(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingAuth(false)
    }
  }

  // ── Generate shipping label ──
  const handleGenerateLabel = async () => {
    if (!order) return
    setGeneratingLabel(true)
    setError(null)

    try {
      // Step 1: Get a shipping quote to obtain rateId
      const quoteRes = await fetch("/api/shippo/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerAddress: order.sellerShipFromAddress,
          buyerAddress: order.buyerShippingAddress,
          approxSizing: order.size,
        }),
      })

      if (!quoteRes.ok) {
        const errData = await quoteRes.json()
        throw new Error(errData.error || "Failed to get shipping quote")
      }

      const quoteData = await quoteRes.json()
      const rates = quoteData.rates
      if (!rates || rates.length === 0) {
        throw new Error("No shipping rates available")
      }

      // Pick cheapest rate
      const cheapestRate = rates.reduce((min: any, r: any) =>
        parseFloat(r.amount) < parseFloat(min.amount) ? r : min,
        rates[0]
      )

      // Step 2: Generate label with rateId
      const labelRes = await fetch("/api/shippo/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          rateId: cheapestRate.id,
        }),
      })

      if (!labelRes.ok) {
        const errData = await labelRes.json()
        throw new Error(errData.error || "Failed to generate shipping label")
      }

      const labelData = await labelRes.json()

      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: "label_created",
              trackingNumber: labelData.trackingNumber,
              shippingLabelUrl: labelData.labelUrl,
            }
          : prev
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGeneratingLabel(false)
    }
  }

  // ── Mark as delivered ──
  const handleMarkDelivered = async () => {
    if (!order) return
    setMarkingDelivered(true)
    setError(null)

    try {
      const res = await fetch(`/api/orders/${order.id}/mark-delivered`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to mark as delivered")
      }

      setOrder((prev) => (prev ? { ...prev, status: "delivered" } : prev))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setMarkingDelivered(false)
    }
  }

  // ── Submit review / complete order ──
  const handleRatingSubmit = async (rating: number, comment: string) => {
    if (!order) return
    setSubmittingReview(true)
    setError(null)

    try {
      const res = await fetch(`/api/orders/${order.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment || undefined }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to complete order")
      }

      setShowRatingModal(false)
      setOrder((prev) =>
        prev ? { ...prev, status: "completed", reviewRating: rating, reviewComment: comment || undefined } : prev
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingReview(false)
    }
  }

  // ── Submit dispute ──
  const handleDisputeSubmit = async (reason: string, description: string, evidenceUrls: string[]) => {
    if (!order) return
    setSubmittingDispute(true)
    setError(null)

    try {
      const res = await fetch(`/api/orders/${order.id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          description,
          evidenceUrls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to submit dispute")
      }

      setShowDisputeForm(false)
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: "disputed",
              disputeReason: reason,
              disputeTextBuyer: description,
              disputeEvidenceBuyer: evidenceUrls,
            }
          : prev
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingDispute(false)
    }
  }

  // ── Seller submit evidence ──
  const handleSellerEvidenceSubmit = async () => {
    if (!order || !sellerResponse.trim()) return
    setSubmittingSellerEvidence(true)
    setError(null)

    try {
      const supabase = createClient()
      const uploadedUrls: string[] = []

      for (let i = 0; i < sellerEvidenceFiles.length; i++) {
        const file = sellerEvidenceFiles[i]
        const ext = file.name.split(".").pop() || "jpg"
        const path = `${order.id}/dispute-seller-${i}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("order-photos")
          .upload(path, file, { upsert: true })
        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("order-photos")
            .getPublicUrl(path)
          uploadedUrls.push(urlData.publicUrl)
        }
      }

      const res = await fetch(`/api/orders/${order.id}/seller-evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: sellerResponse,
          evidenceUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to submit evidence")
      }

      setOrder((prev) =>
        prev
          ? {
              ...prev,
              disputeTextSeller: sellerResponse,
              disputeEvidenceSeller: uploadedUrls,
            }
          : prev
      )
      setSellerResponse("")
      setSellerEvidenceFiles([])
      setSellerEvidencePreviews([])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingSellerEvidence(false)
    }
  }

  const handleAddSellerEvidence = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (sellerEvidenceFiles.length + files.length > 5) {
      alert("Maximum 5 evidence photos allowed")
      return
    }
    setSellerEvidenceFiles((prev) => [...prev, ...files])
    files.forEach((f) => {
      const url = URL.createObjectURL(f)
      setSellerEvidencePreviews((prev) => [...prev, url])
    })
  }

  const handleRemoveSellerEvidence = (idx: number) => {
    setSellerEvidenceFiles((prev) => prev.filter((_, i) => i !== idx))
    setSellerEvidencePreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── QR code URL ──
  const qrUrl = order
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        `${typeof window !== "undefined" ? window.location.origin : ""}/orders/${order.id}/auth?mobile=true`
      )}`
    : ""

  // ── Render ──
  if (loading) {
    return (
      <div className="relay-empty text-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-[#5f8fff] mx-auto mb-4" />
        <p className="text-white/40">Loading order...</p>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="relay-empty text-center p-12">
        <p className="text-white/40 text-lg">Order not found</p>
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
      </div>
    )
  }

  const allAuthPhotosUploaded = AUTH_ANGLES.every((angle) => !!authPhotoUrls[angle])

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-[#7ca6ff] hover:text-[#5f8fff] transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Orders
      </button>

      {/* Dev Status Switcher */}
      {process.env.NODE_ENV === "development" && (
        <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-xs text-[#7ca6ff]">
          <p className="font-mono mb-2">DEV: Switch Status (Local) →</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(["paid", "auth_submitted", "label_created", "shipped", "delivered", "review_window", "completed", "disputed"] as const).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => setStatusOverride(s)}
                  className={`px-2 py-1 rounded text-xs font-mono transition-all ${
                    statusOverride === s
                      ? "bg-[#5f8fff] text-white"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {s}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Order Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#7ca6ff] font-medium">ORDER #{order.id.slice(0, 8).toUpperCase()}</p>
          <p className="text-xs text-white/50 mt-1">{order.orderDate}</p>
        </div>
        <span
          className={
            statusConfig[currentStatus].color +
            " relay-badge-info border-0 px-3 py-1 rounded-lg flex items-center gap-1 inline-flex"
          }
        >
          {statusConfig[currentStatus].icon}
          {statusConfig[currentStatus].label}
        </span>
      </div>

      {/* Progress Tracker */}
      {!["completed", "disputed", "cancelled", "refunded"].includes(currentStatus) && (
        <ProgressTracker currentStatus={currentStatus} />
      )}

      {/* Order Summary Card */}
      <div className="relay-card p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Shoe Image & Info */}
          <div className="md:col-span-1">
            <div className="bg-white/5 aspect-square rounded-xl mb-4 flex items-center justify-center overflow-hidden">
              {order.shoeImage && order.shoeImage !== "/placeholder-shoe.png" ? (
                <img src={order.shoeImage} alt={`${order.brand} ${order.model}`} className="w-full h-full object-cover" />
              ) : (
                <Package className="w-16 h-16 text-[#7ca6ff]" />
              )}
            </div>
            <h2 className="text-lg font-bold text-[#f5f7fb] mb-1">
              {order.brand} {order.model}
            </h2>
            <p className="text-[#7ca6ff] mb-3">Size {order.size}</p>
          </div>

          {/* Price Breakdown */}
          <div className="md:col-span-2">
            <h3 className="text-sm font-semibold text-[#f5f7fb] mb-4">Price Breakdown</h3>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between text-[#7ca6ff]">
                <span>Shoe Price</span>
                <span>${order.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#7ca6ff]">
                <span>Shipping</span>
                <span>${order.shippingCost.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#7ca6ff]">
                <span>Platform Fee</span>
                <span>${order.platformFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#7ca6ff]">
                <span>Stripe Fee</span>
                <span>${order.stripeFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between font-bold text-[#f5f7fb]">
                <span>{order.userRole === "buyer" ? "Total Paid" : "Your Earnings"}</span>
                <span>
                  $
                  {(order.userRole === "buyer"
                    ? order.totalPrice
                    : order.sellerEarnings
                  ).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 space-y-4">
          {/* Addresses */}
          <div>
            <h3 className="text-sm font-semibold text-[#f5f7fb] mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#7ca6ff]" />
              Buyer Shipping Address
            </h3>
            <p className="text-sm text-[#7ca6ff] whitespace-pre-line">
              {formatAddress(order.buyerShippingAddress)}
            </p>
          </div>

          {/* Seller Info */}
          <div>
            <h3 className="text-sm font-semibold text-[#f5f7fb] mb-2 flex items-center gap-2">
              <User className="w-4 h-4 text-[#7ca6ff]" />
              Seller Info
            </h3>
            <a
              href={order.sellerProfileUrl}
              className="text-sm text-[#5f8fff] hover:text-[#7ca6ff] transition-colors"
            >
              {order.sellerName}
            </a>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* STATUS: PAID (Seller needs to authenticate) */}
      {/* ═══════════════════════════════════════════ */}
      {currentStatus === "paid" && order.userRole === "seller" && (
        <>
          <div className="relay-card p-6 mb-6 border border-[#5f8fff]/30 bg-[#5f8fff]/5">
            <h2 className="text-lg font-bold text-[#f5f7fb] mb-2 flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#5f8fff]" />
              Post-Sale Authentication Required
            </h2>
            <p className="text-[#7ca6ff] text-sm mb-4">
              Please authenticate the item to proceed.
              {order.shippingDeadline && (
                <>
                  {" "}You have until{" "}
                  <span className="font-semibold">{order.shippingDeadline}</span> to ship.
                </>
              )}
            </p>

            {/* Challenge Code */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
              <p className="text-sm font-mono text-[#7ca6ff] mb-2">Challenge Code:</p>
              <div className="flex items-center gap-2">
                <code className="text-lg font-bold text-[#f5f7fb] bg-white/5 px-3 py-2 rounded font-mono">
                  {order.challengeCode || "N/A"}
                </code>
                <button
                  onClick={handleCopyChallengeCode}
                  className="p-2 bg-white/5 hover:bg-white/10 rounded transition-all"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-[#7ca6ff]" />
                  )}
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={() => setShowQrCode((prev) => !prev)}
                className="relay-button-primary flex items-center justify-center gap-2"
              >
                <QrCode className="w-4 h-4" />
                Complete on Phone
              </button>
              <button
                onClick={() => setShowAuthForm((prev) => !prev)}
                className="relay-button-secondary flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {showAuthForm ? "Hide Form" : "Start Authentication"}
              </button>
            </div>

            {/* QR Code */}
            {showQrCode && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-6 mb-4 text-center">
                <p className="text-sm text-[#7ca6ff] mb-3">Scan this code to complete authentication on your phone</p>
                <img
                  src={qrUrl}
                  alt="QR Code for mobile authentication"
                  className="mx-auto rounded-lg"
                  width={200}
                  height={200}
                />
              </div>
            )}

            {/* Auth upload form */}
            {showAuthForm && (
              <>
                <h3 className="text-sm font-semibold text-[#f5f7fb] mb-3">Required Photos (8 angles)</h3>
                <div className="text-sm text-[#7ca6ff] space-y-1 mb-4">
                  <p>Take photos with the challenge code visible in frame where applicable.</p>
                </div>

                <PhotoUploadGrid
                  angles={AUTH_ANGLES}
                  uploadedUrls={authPhotoUrls}
                  onFileSelected={handleAuthPhotoUpload}
                  uploading={authPhotoUploading}
                />

                {/* CheckCheck Certificate upload */}
                <input
                  ref={certificateInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleCertificateUpload(f)
                  }}
                />

                <button
                  onClick={() => certificateInputRef.current?.click()}
                  disabled={certificateUploading}
                  className={`w-full border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all mb-4 ${
                    certificateUrl
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-white/10 hover:border-white/20"
                  }`}
                >
                  {certificateUploading ? (
                    <Loader2 className="w-8 h-8 text-[#7ca6ff] mx-auto animate-spin" />
                  ) : certificateUrl ? (
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <p className="text-sm text-emerald-300">CheckCheck Certificate Uploaded</p>
                    </div>
                  ) : (
                    <>
                      <FileText className="w-8 h-8 text-[#7ca6ff] mx-auto mb-2" />
                      <p className="text-sm text-[#f5f7fb]">Upload CheckCheck Certificate</p>
                      <p className="text-xs text-white/40">PDF or image format</p>
                    </>
                  )}
                </button>

                <button
                  onClick={handleSubmitAuth}
                  disabled={!allAuthPhotosUploaded || !certificateUrl || submittingAuth}
                  className="relay-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submittingAuth && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Authentication
                  {!allAuthPhotosUploaded && (
                    <span className="text-xs opacity-70">
                      ({Object.keys(authPhotoUrls).length}/{AUTH_ANGLES.length} photos)
                    </span>
                  )}
                </button>
              </>
            )}

            {/* Shipping deadline warning */}
            {order.shippingDeadline && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-300">
                  You have 5 days from purchase to ship. Deadline:{" "}
                  <span className="font-semibold">{order.shippingDeadline}</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Buyer waiting view for PAID */}
      {currentStatus === "paid" && order.userRole === "buyer" && (
        <div className="relay-card p-6 mb-6 bg-white/[0.04]">
          <h2 className="text-lg font-bold text-[#f5f7fb] mb-2 flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#7ca6ff]" />
            Awaiting Seller Authentication
          </h2>
          <p className="text-[#7ca6ff] text-sm">
            The seller is authenticating your item. You&apos;ll be notified once a shipping label is created.
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* STATUS: AUTH_SUBMITTED (Seller generates label) */}
      {/* ═══════════════════════════════════════════════ */}
      {currentStatus === "auth_submitted" && order.userRole === "seller" && (
        <div className="relay-card p-6 mb-6 border border-emerald-500/30 bg-emerald-500/5">
          <h2 className="text-lg font-bold text-emerald-300 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Authentication Submitted
          </h2>
          <p className="text-[#7ca6ff] text-sm mb-4">
            Great! Your photos have been submitted. Now generate a shipping label to continue.
          </p>

          <button
            onClick={handleGenerateLabel}
            disabled={generatingLabel}
            className="relay-button-primary w-full mb-6 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {generatingLabel ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Label...
              </>
            ) : (
              "Generate Shipping Label"
            )}
          </button>

          <h3 className="text-sm font-semibold text-[#f5f7fb] mb-3">Your Submitted Photos</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {order.authPhotos && order.authPhotos.length > 0
              ? order.authPhotos.map((url, idx) => (
                  <div
                    key={idx}
                    className="aspect-square bg-white/5 border border-white/10 rounded-lg overflow-hidden"
                  >
                    <img src={url} alt={`Auth photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))
              : AUTH_ANGLES.map((angle) => (
                  <div
                    key={angle}
                    className="aspect-square bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-[#7ca6ff] text-xs"
                  >
                    <Eye className="w-5 h-5" />
                  </div>
                ))}
          </div>
        </div>
      )}

      {currentStatus === "auth_submitted" && order.userRole === "buyer" && (
        <div className="relay-card p-6 mb-6 bg-white/[0.04]">
          <h2 className="text-lg font-bold text-[#f5f7fb] mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Authentication Complete
          </h2>
          <p className="text-[#7ca6ff] text-sm">
            The seller has authenticated the item. A shipping label is being generated.
          </p>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* STATUS: LABEL_CREATED           */}
      {/* ════════════════════════════════ */}
      {currentStatus === "label_created" && (
        <div className="relay-card p-6 mb-6">
          <h2 className="text-lg font-bold text-[#f5f7fb] mb-4">Shipping Label Ready</h2>

          {order.userRole === "seller" && order.shippingLabelUrl && (
            <button
              onClick={() => window.open(order.shippingLabelUrl, "_blank")}
              className="relay-button-primary w-full mb-4 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Shipping Label (PDF)
            </button>
          )}

          <div className="space-y-3 mb-4">
            <div>
              <p className="text-xs font-semibold text-white/50 mb-1">TRACKING NUMBER</p>
              <div className="flex items-center gap-2">
                <code className="text-lg font-mono font-bold text-[#f5f7fb] bg-white/5 px-3 py-2 rounded flex-1">
                  {order.trackingNumber || "Pending"}
                </code>
                {order.trackingNumber && (
                  <button
                    onClick={handleCopyTracking}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded transition-all"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#7ca6ff]" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {order.shippingDeadline && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-300">
                Ship by <span className="font-semibold">{order.shippingDeadline}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* STATUS: SHIPPED                 */}
      {/* ════════════════════════════════ */}
      {currentStatus === "shipped" && (
        <div className="relay-card p-6 mb-6">
          <h2 className="text-lg font-bold text-[#f5f7fb] mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" />
            Package Shipped
          </h2>

          <div className="space-y-3 mb-6">
            <div>
              <p className="text-xs font-semibold text-white/50 mb-1">TRACKING NUMBER</p>
              <div className="flex items-center gap-2">
                <code className="text-lg font-mono font-bold text-[#f5f7fb] bg-white/5 px-3 py-2 rounded flex-1">
                  {order.trackingNumber || "N/A"}
                </code>
                {order.trackingNumber && (
                  <button
                    onClick={handleCopyTracking}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded transition-all"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#7ca6ff]" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {order.userRole === "buyer" && (
            <button
              onClick={handleMarkDelivered}
              disabled={markingDelivered}
              className="relay-button-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {markingDelivered ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Marking...
                </>
              ) : (
                "Mark as Delivered"
              )}
            </button>
          )}

          {order.userRole === "buyer" && (
            <p className="text-xs text-[#7ca6ff] text-center mt-4">
              Click the button above once you receive the package
            </p>
          )}

          {order.userRole === "seller" && (
            <p className="text-sm text-[#7ca6ff]">
              Your package is on the way. The buyer will confirm delivery.
            </p>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════ */}
      {/* STATUS: DELIVERED / REVIEW WINDOW           */}
      {/* ════════════════════════════════════════════ */}
      {(currentStatus === "delivered" || currentStatus === "review_window") && (
        <>
          {order.userRole === "buyer" && !showDisputeForm && (
            <div className="relay-card p-6 mb-6 border border-amber-500/30 bg-amber-500/5">
              <h2 className="text-lg font-bold text-amber-300 mb-2 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                48-Hour Review Window
              </h2>
              <p className="text-[#7ca6ff] text-sm mb-4">
                Review the item before the seller receives their earnings.
                {order.reviewDeadline && (
                  <>
                    {" "}Window closes: <span className="font-semibold">{order.reviewDeadline}</span>
                  </>
                )}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowRatingModal(true)}
                  className="relay-button-success flex items-center justify-center"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Everything Looks Good
                </button>
                <button
                  onClick={() => setShowDisputeForm(true)}
                  className="relay-button-danger flex items-center justify-center"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  File a Complaint
                </button>
              </div>
            </div>
          )}

          {order.userRole === "buyer" && showDisputeForm && (
            <DisputeForm
              orderId={order.id}
              onSubmit={handleDisputeSubmit}
              onCancel={() => setShowDisputeForm(false)}
              submitting={submittingDispute}
            />
          )}

          {order.userRole === "seller" && (
            <div className="relay-card p-6 mb-6 bg-white/[0.04]">
              <p className="text-[#7ca6ff] text-sm">
                Awaiting buyer confirmation. Your earnings will be released after the review window closes.
              </p>
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════ */}
      {/* STATUS: DISPUTED                */}
      {/* ════════════════════════════════ */}
      {currentStatus === "disputed" && (
        <>
          {order.userRole === "buyer" && (
            <div className="relay-card p-6 mb-6 border border-red-500/30 bg-red-500/5">
              <h2 className="text-lg font-bold text-red-300 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Complaint Under Review
              </h2>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
                <p className="text-xs font-semibold text-white/50 mb-2">REASON</p>
                <p className="text-[#f5f7fb] mb-3">{order.disputeReason}</p>
                <p className="text-xs font-semibold text-white/50 mb-2">DESCRIPTION</p>
                <p className="text-[#7ca6ff] text-sm">{order.disputeTextBuyer}</p>
              </div>

              {order.disputeEvidenceBuyer && order.disputeEvidenceBuyer.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-white/50 mb-2">YOUR EVIDENCE</p>
                  <div className="grid grid-cols-5 gap-2">
                    {order.disputeEvidenceBuyer.map((url, i) => (
                      <img key={i} src={url} alt={`Evidence ${i + 1}`} className="aspect-square object-cover rounded-lg" />
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-[#7ca6ff] bg-white/5 border border-white/10 rounded p-3">
                Our team is reviewing your complaint. You&apos;ll be notified once a decision is made.
              </p>
            </div>
          )}

          {order.userRole === "seller" && (
            <>
              <div className="relay-card p-6 mb-6 border border-red-500/30 bg-red-500/5">
                <h2 className="text-lg font-bold text-red-300 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Dispute Filed
                </h2>

                <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
                  <p className="text-xs font-semibold text-white/50 mb-2">BUYER&apos;S REASON</p>
                  <p className="text-[#f5f7fb] mb-3">{order.disputeReason}</p>
                  <p className="text-xs font-semibold text-white/50 mb-2">BUYER&apos;S DESCRIPTION</p>
                  <p className="text-[#7ca6ff] text-sm">{order.disputeTextBuyer}</p>
                </div>

                {order.disputeEvidenceBuyer && order.disputeEvidenceBuyer.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-white/50 mb-2">BUYER&apos;S EVIDENCE</p>
                    <div className="grid grid-cols-5 gap-2">
                      {order.disputeEvidenceBuyer.map((url, i) => (
                        <img key={i} src={url} alt={`Buyer evidence ${i + 1}`} className="aspect-square object-cover rounded-lg" />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Seller already submitted response */}
              {order.disputeTextSeller ? (
                <div className="relay-card p-6 mb-6">
                  <h3 className="text-lg font-bold text-[#f5f7fb] mb-4">Your Response (Submitted)</h3>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
                    <p className="text-[#f5f7fb] text-sm">{order.disputeTextSeller}</p>
                  </div>
                  {order.disputeEvidenceSeller && order.disputeEvidenceSeller.length > 0 && (
                    <div className="grid grid-cols-5 gap-2">
                      {order.disputeEvidenceSeller.map((url, i) => (
                        <img key={i} src={url} alt={`Your evidence ${i + 1}`} className="aspect-square object-cover rounded-lg" />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="relay-card p-6 mb-6">
                  <h3 className="text-lg font-bold text-[#f5f7fb] mb-4">Submit Your Response</h3>

                  <textarea
                    value={sellerResponse}
                    onChange={(e) => setSellerResponse(e.target.value)}
                    placeholder="Explain your side of the situation..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-[#f5f7fb] placeholder-white/40 text-sm mb-4 focus:outline-none focus:border-[#5f8fff]"
                    rows={4}
                  />

                  <input
                    ref={sellerEvidenceInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleAddSellerEvidence}
                  />

                  {sellerEvidencePreviews.length > 0 && (
                    <div className="grid grid-cols-5 gap-2 mb-3">
                      {sellerEvidencePreviews.map((url, i) => (
                        <div key={i} className="relative aspect-square">
                          <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover rounded-lg" />
                          <button
                            onClick={() => handleRemoveSellerEvidence(i)}
                            className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5"
                          >
                            <X className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => sellerEvidenceInputRef.current?.click()}
                    disabled={sellerEvidenceFiles.length >= 5}
                    className="w-full border-2 border-dashed border-white/10 rounded-lg p-6 text-center cursor-pointer hover:border-white/20 transition-all mb-4 disabled:opacity-50"
                  >
                    <Upload className="w-6 h-6 text-[#7ca6ff] mx-auto mb-2" />
                    <p className="text-sm text-[#f5f7fb]">Upload evidence photos ({sellerEvidenceFiles.length}/5)</p>
                  </button>

                  <button
                    onClick={handleSellerEvidenceSubmit}
                    disabled={!sellerResponse.trim() || submittingSellerEvidence}
                    className="relay-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submittingSellerEvidence && <Loader2 className="w-4 h-4 animate-spin" />}
                    Submit Evidence
                  </button>
                </div>
              )}

              <div className="relay-card p-4 text-center bg-white/[0.02]">
                <p className="text-sm text-[#7ca6ff]">Awaiting admin decision</p>
              </div>
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════ */}
      {/* STATUS: COMPLETED               */}
      {/* ════════════════════════════════ */}
      {currentStatus === "completed" && (
        <div className="relay-card p-6 mb-6 border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            <h2 className="text-lg font-bold text-emerald-300">Order Complete</h2>
          </div>

          {order.reviewRating && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-white/50 mb-2">BUYER&apos;S RATING</p>
              <div className="flex items-center gap-2 mb-2">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${
                      i < order.reviewRating!
                        ? "fill-[#5f8fff] text-[#5f8fff]"
                        : "text-white/20"
                    }`}
                  />
                ))}
              </div>
              {order.reviewComment && (
                <p className="text-[#f5f7fb] text-sm">{order.reviewComment}</p>
              )}
            </div>
          )}

          {order.userRole === "seller" && (
            <p className="text-sm text-emerald-300">
              Earnings of <span className="font-bold">${order.sellerEarnings.toFixed(2)}</span> have been
              transferred to your account.
            </p>
          )}

          {order.userRole === "buyer" && (
            <p className="text-sm text-emerald-300">
              Thank you for your purchase! We hope you enjoy your new kicks.
            </p>
          )}
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <RatingModal
          onSubmit={handleRatingSubmit}
          onClose={() => setShowRatingModal(false)}
          submitting={submittingReview}
        />
      )}
    </div>
  )
}
