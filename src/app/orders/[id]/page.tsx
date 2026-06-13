"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import {
  BUYER_DISPUTE_CATEGORIES,
  BUYER_DISPUTE_CATEGORY_RULES,
} from "@/lib/order-disputes"
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
  Shield,
  MapPin,
  User,
  ChevronDown,
  QrCode,
  Loader2,
} from "lucide-react"
import { normalizeShippingAddress, toShippoAddress } from "@/lib/shipping-addresses"

type OrderStatus = "paid" | "auth_submitted" | "label_created" | "shipped" | "delivered" | "review_window" | "completed" | "disputed" | "cancelled" | "refund_pending" | "refunded" | "payout_failed" | "return_pending" | "return_shipped" | "return_delivered"
type UserRole = "buyer" | "seller"

interface ShippingAddress {
  name: string
  street: string
  street2?: string
  email?: string
  phone?: string
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
  sellerFundsFrozen?: boolean
  sellerName: string
  sellerProfileUrl: string
  sellerShipFromAddress: ShippingAddress | null
  trackingNumber?: string
  shippingLabelUrl?: string
  authPhotos?: string[]
  payoutLastError?: string
  checkcheckCertificateUrl?: string
  challengeCode?: string
  disputeReason?: string
  disputeCategory?: string
  disputeStatus?: string
  disputeTextBuyer?: string
  disputeTextSeller?: string
  disputeEvidenceBuyer?: string[]
  disputeEvidenceSeller?: string[]
  reviewRating?: number
  reviewComment?: string
  shippingDeadline?: string
  reviewDeadline?: string
  returnLabelUrl?: string
  returnTrackingNumber?: string
  returnPackingSlipId?: string
  returnStatus?: string
  isAuthExempt?: boolean
  relayTagRequired?: boolean
  checkcheckRequired?: boolean
  sellerTier?: string
  checkcheckReason?: string | null
  checkcheckStatus?: string | null
  checkcheckAdminNotes?: string | null
  randomAuditRequired?: boolean
  highRiskSkuRequired?: boolean
  legacyAuthFlow?: boolean
  relayTagStatus?: string | null
  custodyVerificationStatus?: string
  custodyAdminReviewRequired?: boolean
  sellerScannedTagValue?: string
  sellerTagPhotoUrl?: string
  sellerPairPhotoUrl?: string
  sellerBoxPhotoUrl?: string
  sellerSealedPackagePhotoUrl?: string
  buyerScannedTagValue?: string
  buyerTagPhotoUrl?: string
  buyerPairPhotoUrl?: string
  expectedRelayTagValue?: string
  expectedRelayBarcodeValue?: string
  mobileAuthUrl?: string
  mobileBuyerReviewUrl?: string
}

interface FulfillmentStatusData {
  sellerTier: string | null
  relayTagRequired: boolean
  checkcheckRequired: boolean
  checkcheckReason: string | null
  checkcheckStatus: string | null
  checkcheckAdminNotes: string | null
  relayTagStatus: string | null
  chainOfCustodyStatus: string | null
  chainOfCustodyAdminReviewRequired: boolean
  randomAuditRequired: boolean
  highRiskSkuRequired: boolean
  legacyAuthFlow: boolean
  labelReady: boolean
  labelBlockedReasons: string[]
}

const statusStages = ["paid", "auth_submitted", "label_created", "shipped", "delivered", "review_window", "completed"] as const
const statusStagesAuthExempt = ["paid", "label_created", "shipped", "delivered", "review_window", "completed"] as const

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
  refund_pending: { label: "Refund Pending", icon: <Clock className="w-4 h-4" />, color: "bg-amber-500/20 text-amber-300" },
  refunded: { label: "Refunded", icon: <AlertCircle className="w-4 h-4" />, color: "bg-gray-500/20 text-gray-300" },
  payout_failed: { label: "Payout Failed", icon: <AlertCircle className="w-4 h-4" />, color: "bg-red-500/20 text-red-300" },
  return_pending: { label: "Return Required", icon: <Package className="w-4 h-4" />, color: "bg-amber-500/20 text-amber-300" },
  return_shipped: { label: "Return Shipped", icon: <Package className="w-4 h-4" />, color: "bg-cyan-500/20 text-cyan-300" },
  return_delivered: { label: "Return Received", icon: <CheckCircle2 className="w-4 h-4" />, color: "bg-green-500/20 text-green-300" },
}

const AUTH_EXEMPT_BRANDS = new Set(["Individual Brand", "Custom"])

function formatDisputeCategoryLabel(category?: string | null) {
  if (!category) return "Dispute"
  if (category in BUYER_DISPUTE_CATEGORY_RULES) {
    return BUYER_DISPUTE_CATEGORY_RULES[category as keyof typeof BUYER_DISPUTE_CATEGORY_RULES].label
  }

  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

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
const ProgressTracker = ({ currentStatus, isAuthExempt }: { currentStatus: OrderStatus; isAuthExempt?: boolean }) => {
  const stages = isAuthExempt ? statusStagesAuthExempt : statusStages
  const labels = isAuthExempt ? { ...stageLabels, paid: "Payment" } : stageLabels
  const stageIndex = stages.indexOf(currentStatus as any)

  return (
    <div className="relay-card p-3 sm:p-6 mb-6 overflow-x-auto">
      <div className="flex items-center justify-between min-w-[480px] sm:min-w-0">
        {stages.map((stage, idx) => {
          const isCompleted = idx < stageIndex
          const isCurrent = idx === stageIndex

          return (
            <div key={stage} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all ${
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
                <p className="text-[10px] sm:text-xs font-medium text-[#7ca6ff] mt-1 sm:mt-2 text-center">
                  {labels[stage]}
                </p>
              </div>

              {idx < stages.length - 1 && (
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

  if (typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="relay-card p-6 max-w-md w-full mx-4">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[#f5f7fb]">Rate Your Experience</h2>
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
    </div>,
    document.body
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
      const uploadedUrls: string[] = []

      for (let i = 0; i < evidenceFiles.length; i++) {
        const file = evidenceFiles[i]
        const ext = file.name.split(".").pop() || "jpg"
        const fileName = `dispute-buyer-${i}.${ext}`

        const formData = new FormData()
        formData.append("file", file)
        formData.append("fileName", fileName)

        const res = await fetch(`/api/orders/${orderId}/upload-evidence`, {
          method: "POST",
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || "Failed to upload evidence photo")
        }

        const payload = await res.json()
        uploadedUrls.push((payload.storageRef || payload.url) as string)
      }

      onSubmit(reason, description, uploadedUrls)
    } catch (err: any) {
      console.error("Evidence upload error:", err)
      alert(err.message || "Failed to upload evidence photos. Please try again.")
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
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

interface BuyerCompletionSubmission {
  rating: number
  comment: string
}

interface BuyerDisputeSubmission {
  category: string
  description: string
  evidenceFiles: File[]
}

const BuyerRelayCapturePanel = ({
  mobileCaptureUrl,
  challengeCode,
  expectedTagValue,
  existingScannedValue,
  existingTagPhotoUrl,
  existingPairPhotoUrl,
  isMobileDevice,
  onRefreshEvidence,
  refreshingEvidence,
}: {
  mobileCaptureUrl: string
  challengeCode?: string
  expectedTagValue?: string
  existingScannedValue?: string
  existingTagPhotoUrl?: string
  existingPairPhotoUrl?: string
  isMobileDevice: boolean
  onRefreshEvidence: () => void
  refreshingEvidence: boolean
}) => {
  const captureQrUrl = mobileCaptureUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(mobileCaptureUrl)}`
    : ""
  const captureComplete =
    Boolean(existingScannedValue?.trim()) && Boolean(existingTagPhotoUrl) && Boolean(existingPairPhotoUrl)

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-[#f5f7fb] mb-1">Buyer Relay verification</p>
        <p className="text-xs text-white/50">
          Relay compares the buyer tag scan and live camera photos to the seller-bound order tag.
          {expectedTagValue && (
            <> Expected tag: <span className="font-mono text-[#7ca6ff]">{expectedTagValue}</span></>
          )}
        </p>
      </div>

      {challengeCode && (
        <div className="rounded-lg border border-white/10 bg-[#06070a] p-3">
          <p className="text-xs font-semibold text-white/50 mb-1">CHALLENGE CODE</p>
          <p className="text-lg font-mono font-bold text-[#f5f7fb]">{challengeCode}</p>
          <p className="text-xs text-white/40 mt-1">
            Enter this code on your phone after scanning the QR code.
          </p>
        </div>
      )}

      {captureComplete ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm text-emerald-300">
            Live buyer verification is on file.
          </p>
          <p className="text-xs text-white/50 mt-1">
            Recorded tag: <span className="font-mono text-[#7ca6ff]">{existingScannedValue}</span>
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-300">
            Live buyer verification is still required before you can continue.
          </p>
          <p className="text-xs text-white/50 mt-1">
            Desktop uploads are disabled for tag verification.
          </p>
        </div>
      )}

      {isMobileDevice ? (
        <a
          href={mobileCaptureUrl}
          className="relay-button-primary w-full flex items-center justify-center gap-2"
        >
          <QrCode className="w-4 h-4" />
          Open Live Camera Capture
        </a>
      ) : (
        <div className="rounded-lg border border-white/10 bg-[#06070a] p-4 text-center">
          <p className="text-sm font-semibold text-[#f5f7fb] mb-2">Scan with your phone</p>
          <p className="text-xs text-white/50 mb-4">
            Use your phone to capture the Relay tag and pair photos live. Desktop uploads are disabled for this step.
          </p>
          {captureQrUrl && (
            <img
              src={captureQrUrl}
              alt="QR code for buyer Relay verification"
              className="mx-auto rounded-lg"
              width={220}
              height={220}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-white/50">TAG ATTACHED TO SHOES</p>
          {existingTagPhotoUrl ? (
            <img src={existingTagPhotoUrl} alt="Buyer tag evidence" className="w-full h-40 object-cover rounded-lg" />
          ) : (
            <div className="h-40 rounded-lg border border-dashed border-white/10 bg-white/5 flex items-center justify-center text-xs text-white/35">
              Awaiting live capture
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-white/50">PAIR PHOTO</p>
          {existingPairPhotoUrl ? (
            <img src={existingPairPhotoUrl} alt="Buyer pair evidence" className="w-full h-40 object-cover rounded-lg" />
          ) : (
            <div className="h-40 rounded-lg border border-dashed border-white/10 bg-white/5 flex items-center justify-center text-xs text-white/35">
              Awaiting live capture
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onRefreshEvidence}
        disabled={refreshingEvidence}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-[#f5f7fb] hover:bg-white/10 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {refreshingEvidence && <Loader2 className="w-4 h-4 animate-spin" />}
        Refresh Verification Status
      </button>
    </div>
  )
}

const BuyerCompletionModal = ({
  requiresRelayCustody,
  expectedTagValue,
  existingScannedValue,
  existingTagPhotoUrl,
  existingPairPhotoUrl,
  mobileCaptureUrl,
  challengeCode,
  isMobileDevice,
  onRefreshEvidence,
  refreshingEvidence,
  onSubmit,
  onClose,
  submitting,
}: {
  requiresRelayCustody: boolean
  expectedTagValue?: string
  existingScannedValue?: string
  existingTagPhotoUrl?: string
  existingPairPhotoUrl?: string
  mobileCaptureUrl: string
  challengeCode?: string
  isMobileDevice: boolean
  onRefreshEvidence: () => void
  refreshingEvidence: boolean
  onSubmit: (payload: BuyerCompletionSubmission) => void
  onClose: () => void
  submitting: boolean
}) => {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [hoveredRating, setHoveredRating] = useState(0)

  if (typeof document === "undefined") return null

  const custodyReady =
    !requiresRelayCustody ||
    (!!existingScannedValue?.trim() &&
      !!existingTagPhotoUrl &&
      !!existingPairPhotoUrl)

  return createPortal(
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className="relay-card p-6 max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[#f5f7fb]">Complete Order</h2>
          <p className="text-sm text-[#7ca6ff] mt-2">
            Confirm the item and finish buyer chain-of-custody review before seller payout is released.
          </p>
        </div>

        {requiresRelayCustody && (
          <div className="mb-6">
            <BuyerRelayCapturePanel
              mobileCaptureUrl={mobileCaptureUrl}
              challengeCode={challengeCode}
              expectedTagValue={expectedTagValue}
              existingScannedValue={existingScannedValue}
              existingTagPhotoUrl={existingTagPhotoUrl}
              existingPairPhotoUrl={existingPairPhotoUrl}
              isMobileDevice={isMobileDevice}
              onRefreshEvidence={onRefreshEvidence}
              refreshingEvidence={refreshingEvidence}
            />
          </div>
        )}

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

        <div className="flex gap-3">
          <button onClick={onClose} className="relay-button-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                rating,
                comment,
              })
            }
            disabled={rating === 0 || submitting || !custodyReady}
            className="relay-button-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Complete Order
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

const BuyerDisputeForm = ({
  requiresRelayCustody,
  expectedTagValue,
  existingScannedValue,
  existingTagPhotoUrl,
  existingPairPhotoUrl,
  mobileCaptureUrl,
  challengeCode,
  isMobileDevice,
  onRefreshEvidence,
  refreshingEvidence,
  onSubmit,
  onCancel,
  submitting,
}: {
  requiresRelayCustody: boolean
  expectedTagValue?: string
  existingScannedValue?: string
  existingTagPhotoUrl?: string
  existingPairPhotoUrl?: string
  mobileCaptureUrl: string
  challengeCode?: string
  isMobileDevice: boolean
  onRefreshEvidence: () => void
  refreshingEvidence: boolean
  onSubmit: (payload: BuyerDisputeSubmission) => void
  onCancel: () => void
  submitting: boolean
}) => {
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([])
  const [evidencePreviews, setEvidencePreviews] = useState<string[]>([])
  const evidenceInputRef = useRef<HTMLInputElement>(null)

  const rule = category
    ? BUYER_DISPUTE_CATEGORY_RULES[category as keyof typeof BUYER_DISPUTE_CATEGORY_RULES]
    : null
  const showCustodySection =
    requiresRelayCustody &&
    (category === "authenticity" ||
      !existingScannedValue ||
      !existingTagPhotoUrl ||
      !existingPairPhotoUrl)
  const missingAuthenticityCustody =
    category === "authenticity" &&
    (!existingScannedValue?.trim() ||
      !existingTagPhotoUrl ||
      !existingPairPhotoUrl)

  const handleAddEvidence = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (evidenceFiles.length + files.length > 5) {
      alert("Maximum 5 evidence photos allowed")
      return
    }
    setEvidenceFiles((prev) => [...prev, ...files])
    files.forEach((file) => {
      const url = URL.createObjectURL(file)
      setEvidencePreviews((prev) => [...prev, url])
    })
  }

  const handleRemoveEvidence = (idx: number) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx))
    setEvidencePreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <div className="relay-card p-6 mb-6 border border-red-500/20 bg-red-500/5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[#f5f7fb]">Open a dispute</h3>
        <button onClick={onCancel} className="text-white/40 hover:text-white/70">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#f5f7fb] mb-2">Dispute category</label>
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-left text-[#f5f7fb] flex items-center justify-between hover:bg-white/10 transition-all"
            >
              <span>{category ? formatDisputeCategoryLabel(category) : "Select a category..."}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 bg-[#0a0d10] border border-white/10 rounded-lg mt-1 z-10">
                {BUYER_DISPUTE_CATEGORIES.map((value) => (
                  <button
                    key={value}
                    onClick={() => {
                      setCategory(value)
                      setShowDropdown(false)
                    }}
                    className="w-full text-left px-3 py-2 text-[#f5f7fb] hover:bg-white/10 text-sm"
                  >
                    {formatDisputeCategoryLabel(value)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {rule && <p className="text-xs text-white/50 mt-2">{rule.description}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-[#f5f7fb] mb-2">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={rule?.explanationPlaceholder || "Describe the issue in detail..."}
            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-[#f5f7fb] placeholder-white/40 text-sm focus:outline-none focus:border-red-500"
            rows={4}
          />
        </div>

        {showCustodySection && (
          <BuyerRelayCapturePanel
            mobileCaptureUrl={mobileCaptureUrl}
            challengeCode={challengeCode}
            expectedTagValue={expectedTagValue}
            existingScannedValue={existingScannedValue}
            existingTagPhotoUrl={existingTagPhotoUrl}
            existingPairPhotoUrl={existingPairPhotoUrl}
            isMobileDevice={isMobileDevice}
            onRefreshEvidence={onRefreshEvidence}
            refreshingEvidence={refreshingEvidence}
          />
        )}

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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
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
            <p className="text-sm text-[#f5f7fb]">Upload dispute evidence ({evidenceFiles.length}/5)</p>
            <p className="text-xs text-white/40 mt-1">Click to select files</p>
          </button>
        </div>

        <button
          onClick={() =>
            onSubmit({
              category,
              description,
              evidenceFiles,
            })
          }
          disabled={!category || !description || submitting || missingAuthenticityCustody}
          className="relay-button-danger w-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit Dispute
        </button>

        <p className="text-xs text-[#7ca6ff] text-center">
          Relay admin will review your dispute and any buyer/seller evidence.
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
  const [fulfillmentStatus, setFulfillmentStatus] = useState<FulfillmentStatusData | null>(null)
  const [statusOverride, setStatusOverride] = useState<OrderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // UI state
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [showQrCode, setShowQrCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isMobileDevice, setIsMobileDevice] = useState(false)
  const [refreshingBuyerCustody, setRefreshingBuyerCustody] = useState(false)

  // Action loading states
  const [generatingLabel, setGeneratingLabel] = useState(false)
  const [markingDelivered, setMarkingDelivered] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const [submittingSellerEvidence, setSubmittingSellerEvidence] = useState(false)

  // Seller dispute response state
  const [sellerResponse, setSellerResponse] = useState("")
  const [sellerEvidenceFiles, setSellerEvidenceFiles] = useState<File[]>([])
  const [sellerEvidencePreviews, setSellerEvidencePreviews] = useState<string[]>([])
  const sellerEvidenceInputRef = useRef<HTMLInputElement>(null)

  // ── Load order ──
  const loadOrder = useCallback(async () => {
    if (!currentUser?.id) return
    const response = await fetch(`/api/orders/${params.id}`, { cache: "no-store" })
    const data = await response.json()

    if (!response.ok || !data) {
      setError(data?.error || "Order not found")
      setLoading(false)
      return
    }

    const isBuyer = data.buyer_id === currentUser.id
    const sellerProfile = data.seller
    const listing = data.listings
    const custody = Array.isArray(data.order_chain_of_custody)
      ? data.order_chain_of_custody[0]
      : data.order_chain_of_custody
    const relayTag = Array.isArray(data.relay_tag) ? data.relay_tag[0] : data.relay_tag
    const disputeRecords = Array.isArray(data.order_disputes) ? data.order_disputes : data.order_disputes ? [data.order_disputes] : []
    const activeDispute =
      disputeRecords.find((dispute: any) => ["open", "seller_responded", "under_review"].includes(dispute.status)) ||
      disputeRecords[0]

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
      totalPrice: (data.price || 0) + (data.shipping_cost || 0),
      buyerShippingAddress: normalizeShippingAddress({
        ...(data.buyer_shipping_address || {}),
        email: data.buyer?.email || data.buyer_shipping_address?.email || undefined,
        phone: data.buyer_shipping_address?.phone || undefined,
      }),
      sellerFundsFrozen: Boolean(data.seller_funds_frozen),
      sellerName: sellerProfile?.full_name || sellerProfile?.display_name || sellerProfile?.username || "Unknown Seller",
      sellerProfileUrl: `/profile/${sellerProfile?.username || ""}`,
      sellerShipFromAddress: normalizeShippingAddress({
        ...(sellerProfile?.ship_from_address || {}),
        email: sellerProfile?.email || sellerProfile?.ship_from_address?.email || undefined,
        phone: sellerProfile?.ship_from_address?.phone || undefined,
      }),
      trackingNumber: data.tracking_number || undefined,
      shippingLabelUrl: data.shipping_label_url || undefined,
      authPhotos: data.auth_photos || undefined,
      payoutLastError: data.payout_last_error || undefined,
      checkcheckCertificateUrl: data.checkcheck_certificate_url || undefined,
      challengeCode: data.challenge_code || undefined,
      disputeReason: activeDispute?.category || data.dispute_reason || undefined,
      disputeCategory: activeDispute?.category || undefined,
      disputeStatus: activeDispute?.status || undefined,
      disputeTextBuyer: activeDispute?.buyer_description || data.dispute_text_buyer || undefined,
      disputeTextSeller: data.dispute_text_seller || undefined,
      disputeEvidenceBuyer: activeDispute?.buyer_evidence_urls || data.dispute_evidence_buyer || undefined,
      disputeEvidenceSeller: data.dispute_evidence_seller || undefined,
      reviewRating: data.review_rating || undefined,
      reviewComment: data.review_comment || undefined,
      shippingDeadline: data.shipping_deadline
        ? new Date(data.shipping_deadline).toLocaleDateString()
        : undefined,
      reviewDeadline: data.review_deadline
        ? new Date(data.review_deadline).toLocaleDateString()
        : undefined,
      returnLabelUrl: data.return_label_url || undefined,
      returnTrackingNumber: data.return_tracking_number || undefined,
      returnPackingSlipId: data.return_packing_slip_id || undefined,
      returnStatus: data.return_status || undefined,
      isAuthExempt: AUTH_EXEMPT_BRANDS.has(listing?.brand || ""),
      relayTagRequired: Boolean(data.relay_tag_required),
      checkcheckRequired: Boolean(data.checkcheck_required),
      sellerTier: sellerProfile?.seller_tier || undefined,
      checkcheckReason: data.checkcheck_reason || undefined,
      checkcheckStatus: data.checkcheck_status || undefined,
      checkcheckAdminNotes: data.checkcheck_admin_notes || undefined,
      randomAuditRequired: Boolean(data.random_audit_required),
      highRiskSkuRequired: Boolean(data.high_risk_sku_required),
      legacyAuthFlow: !data.auth_requirements_evaluated_at,
      relayTagStatus: relayTag?.status || (data.relay_tag_id ? "bound" : null),
      custodyVerificationStatus: custody?.verification_status || undefined,
      custodyAdminReviewRequired: Boolean(custody?.admin_review_required),
      sellerScannedTagValue: custody?.seller_scanned_tag_value || undefined,
      sellerTagPhotoUrl: custody?.seller_tag_photo_url || undefined,
      sellerPairPhotoUrl: custody?.seller_pair_photo_url || undefined,
      sellerBoxPhotoUrl: custody?.seller_box_photo_url || undefined,
      sellerSealedPackagePhotoUrl: custody?.seller_sealed_package_photo_url || undefined,
      buyerScannedTagValue: custody?.buyer_scanned_tag_value || undefined,
      buyerTagPhotoUrl: custody?.buyer_tag_photo_url || undefined,
      buyerPairPhotoUrl: custody?.buyer_pair_photo_url || undefined,
      expectedRelayTagValue: relayTag?.tag_serial_number || undefined,
      expectedRelayBarcodeValue: relayTag?.barcode_value || undefined,
      mobileAuthUrl: data.mobile_auth_url || undefined,
      mobileBuyerReviewUrl: data.mobile_buyer_review_url || undefined,
    }

    setOrder(orderData)
    setStatusOverride(null)
    setFulfillmentStatus(null)
    setLoading(false)
  }, [params.id, currentUser?.id])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  useEffect(() => {
    async function loadFulfillmentStatus() {
      if (!order?.id || !currentUser?.id || (order.isAuthExempt && order.legacyAuthFlow)) return

      try {
        const response = await fetch(`/api/orders/${order.id}/fulfillment-status`, { cache: "no-store" })
        const payload = await response.json()
        if (response.ok) {
          setFulfillmentStatus(payload)
        }
      } catch (statusError) {
        console.error("Failed to load fulfillment status:", statusError)
      }
    }

    void loadFulfillmentStatus()
  }, [order?.id, order?.isAuthExempt, order?.legacyAuthFlow, currentUser?.id])

  useEffect(() => {
    if (typeof window === "undefined") return

    const updateMobileState = () => {
      setIsMobileDevice(
        window.matchMedia("(max-width: 768px), (pointer: coarse)").matches
      )
    }

    updateMobileState()
    window.addEventListener("resize", updateMobileState)

    return () => {
      window.removeEventListener("resize", updateMobileState)
    }
  }, [])

  // ── Helpers ──
  const currentStatus = statusOverride || order?.status || "paid"
  const isAuthExemptOrder = Boolean(order?.isAuthExempt && order?.legacyAuthFlow)
  const sellerCustodyEvidence = [
    order?.sellerTagPhotoUrl
      ? { label: "Tag Through Both Shoes", url: order.sellerTagPhotoUrl }
      : null,
    order?.sellerPairPhotoUrl
      ? { label: "Pair Photo", url: order.sellerPairPhotoUrl }
      : null,
    order?.sellerBoxPhotoUrl
      ? { label: "Pair In Box", url: order.sellerBoxPhotoUrl }
      : null,
    order?.sellerSealedPackagePhotoUrl
      ? { label: "Sealed Package / Label", url: order.sellerSealedPackagePhotoUrl }
      : null,
  ].filter((item): item is { label: string; url: string } => Boolean(item))
  const mobileBuyerReviewUrl = order?.mobileBuyerReviewUrl || ""

  const refreshBuyerCustodyEvidence = async () => {
    setRefreshingBuyerCustody(true)
    try {
      await loadOrder()
    } finally {
      setRefreshingBuyerCustody(false)
    }
  }

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

  const uploadEvidenceFile = async (file: File, fileName: string) => {
    if (!order) {
      throw new Error("Order not loaded")
    }

    const formData = new FormData()
    formData.append("file", file)
    formData.append("fileName", fileName)

    const res = await fetch(`/api/orders/${order.id}/upload-evidence`, {
      method: "POST",
      body: formData,
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || "Failed to upload evidence photo")
    }

    const payload = await res.json()
    return (payload.storageRef || payload.url) as string
  }

  // ── Generate shipping label ──
  const handleGenerateLabel = async () => {
    if (!order) return
    setGeneratingLabel(true)
    setError(null)

    try {
      // Step 1: Get a shipping quote to obtain rateId
      const sellerAddress = toShippoAddress(order.sellerShipFromAddress)
      const buyerAddress = toShippoAddress(order.buyerShippingAddress)

      if (!sellerAddress || !buyerAddress) {
        throw new Error("Shipping address information is incomplete")
      }

      const quoteRes = await fetch("/api/shippo/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerAddress,
          buyerAddress,
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

      const payload = await res.json()
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: "delivered",
              reviewDeadline: payload?.review_deadline
                ? new Date(payload.review_deadline).toLocaleDateString()
                : prev.reviewDeadline,
            }
          : prev
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setMarkingDelivered(false)
    }
  }

  // ── Submit review / complete order ──
  const handleRatingSubmit = async (payload: BuyerCompletionSubmission) => {
    if (!order) return
    setSubmittingReview(true)
    setError(null)

    try {
      if (
        order.relayTagRequired &&
        !order.legacyAuthFlow &&
        (!order.buyerScannedTagValue || !order.buyerTagPhotoUrl || !order.buyerPairPhotoUrl)
      ) {
        throw new Error("Complete live Relay tag verification on your phone before finishing this order")
      }

      const res = await fetch(`/api/orders/${order.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: payload.rating,
          comment: payload.comment || undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to complete order")
      }

      setShowRatingModal(false)
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              status: "completed",
              reviewRating: payload.rating,
              reviewComment: payload.comment || undefined,
            }
          : prev
      )
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmittingReview(false)
    }
  }

  // ── Submit dispute ──
  const handleDisputeSubmit = async (payload: BuyerDisputeSubmission) => {
    if (!order) return
    setSubmittingDispute(true)
    setError(null)

    try {
      const buyerCustodyRequired =
        Boolean(order.relayTagRequired && !order.legacyAuthFlow) &&
        (payload.category === "authenticity" ||
          !order.buyerScannedTagValue ||
          !order.buyerTagPhotoUrl ||
          !order.buyerPairPhotoUrl)

      if (
        buyerCustodyRequired &&
        (!order.buyerScannedTagValue || !order.buyerTagPhotoUrl || !order.buyerPairPhotoUrl)
      ) {
        throw new Error("Complete live Relay tag verification on your phone before submitting this dispute")
      }

      const evidenceUrls: string[] = []
      for (let i = 0; i < payload.evidenceFiles.length; i++) {
        const file = payload.evidenceFiles[i]
        const ext = file.name.split(".").pop() || "jpg"
        evidenceUrls.push(
          await uploadEvidenceFile(file, `dispute-buyer-${Date.now()}-${i}.${ext}`)
        )
      }

      const res = await fetch(`/api/orders/${order.id}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: payload.category,
          description: payload.description,
          evidenceUrls: evidenceUrls.length > 0 ? evidenceUrls : undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to submit dispute")
      }

      setShowDisputeForm(false)
      await loadOrder()
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
      const uploadedUrls: string[] = []

      for (let i = 0; i < sellerEvidenceFiles.length; i++) {
        const file = sellerEvidenceFiles[i]
        const ext = file.name.split(".").pop() || "jpg"
        const fileName = `dispute-seller-${i}.${ext}`

        const formData = new FormData()
        formData.append("file", file)
        formData.append("fileName", fileName)

        const uploadRes = await fetch(`/api/orders/${order.id}/upload-evidence`, {
          method: "POST",
          body: formData,
        })

        if (!uploadRes.ok) {
          const err = await uploadRes.json()
          throw new Error(err.error || "Failed to upload evidence photo")
        }

        const payload = await uploadRes.json()
        uploadedUrls.push((payload.storageRef || payload.url) as string)
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

      await loadOrder()
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
  const mobileAuthUrl = order?.mobileAuthUrl || ""
  const qrUrl = order
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mobileAuthUrl)}`
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
      {!["completed", "disputed", "cancelled", "refunded", "refund_pending", "payout_failed", "return_pending", "return_shipped", "return_delivered"].includes(currentStatus) && (
        <ProgressTracker currentStatus={currentStatus} isAuthExempt={isAuthExemptOrder} />
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
                <span>{"$"}{order.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#7ca6ff]">
                <span>Shipping</span>
                <span>{"$"}{order.shippingCost.toFixed(2)}</span>
              </div>
              {order.userRole === "seller" && (
                <>
                  <div className="flex justify-between text-[#7ca6ff]">
                    <span>Platform Fee</span>
                    <span>-{"$"}{order.platformFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#7ca6ff]">
                    <span>Stripe Fee</span>
                    <span>-{"$"}{order.stripeFee.toFixed(2)}</span>
                  </div>
                </>
              )}
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
      {currentStatus === "paid" && order.userRole === "seller" && isAuthExemptOrder && (
        <div className="relay-card p-6 mb-6 border border-emerald-500/30 bg-emerald-500/5">
          <h2 className="text-lg font-bold text-emerald-300 mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            Admin-Approved Listing — No Authentication Needed
          </h2>
          <p className="text-[#7ca6ff] text-sm mb-4">
            This is {order.brand === "Individual Brand" ? "an individual brand" : "a custom"} listing that was approved by Relay admin. Authentication is not required — generate a shipping label to proceed.
            {order.shippingDeadline && (
              <>
                {" "}You have until{" "}
                <span className="font-semibold">{order.shippingDeadline}</span> to ship.
              </>
            )}
          </p>

          <button
            onClick={handleGenerateLabel}
            disabled={generatingLabel}
            className="relay-button-primary w-full mb-4 flex items-center justify-center gap-2 disabled:opacity-50"
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

          {order.shippingDeadline && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-300">
                You have 5 days from purchase to ship. Deadline:{" "}
                <span className="font-semibold">{order.shippingDeadline}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {currentStatus === "paid" && order.userRole === "seller" && !isAuthExemptOrder && (
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

          {(order.relayTagRequired || order.checkcheckRequired || fulfillmentStatus) && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4 space-y-2">
              {(fulfillmentStatus?.sellerTier || order.sellerTier) && (
                <p className="text-sm text-[#f5f7fb]">
                  Seller tier: <span className="font-semibold">{(fulfillmentStatus?.sellerTier || order.sellerTier || "tier_1").replace("tier_", "Tier ")}</span>
                </p>
              )}
              {order.relayTagRequired && (
                <p className="text-sm text-[#f5f7fb]">
                  Relay security tag required: bind an unused tag to this order and upload the custody evidence set before label generation.
                </p>
              )}
              {order.checkcheckRequired && (
                <p className="text-sm text-[#f5f7fb]">
                  CheckCheck required{(fulfillmentStatus?.checkcheckReason || order.checkcheckReason) ? `: ${fulfillmentStatus?.checkcheckReason || order.checkcheckReason}` : ": upload the certificate during authentication submission."}
                </p>
              )}
              {fulfillmentStatus?.randomAuditRequired && (
                <p className="text-sm text-amber-300">Random audit triggered for this order.</p>
              )}
              {fulfillmentStatus?.highRiskSkuRequired && (
                <p className="text-sm text-red-300">High-risk SKU rules triggered CheckCheck review on this order.</p>
              )}
              {fulfillmentStatus?.legacyAuthFlow && (
                <p className="text-sm text-white/60">Legacy order: this order predates the new custody engine, so it follows the older auth flow.</p>
              )}
              {fulfillmentStatus && (
                <p className={`text-sm ${fulfillmentStatus.labelReady ? "text-emerald-300" : "text-amber-300"}`}>
                  {fulfillmentStatus.labelReady ? "Label can be generated once you complete submission." : "Label cannot be generated yet."}
                </p>
              )}
              <p className="text-xs text-white/45">
                Shipping labels stay blocked until all required evidence is submitted and any manual review clears.
              </p>
            </div>
          )}

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

            {/* Start Authentication — always show QR code for mobile-only capture */}
            <button
              onClick={() => setShowQrCode((prev) => !prev)}
              className="relay-button-primary w-full flex items-center justify-center gap-2 mb-4"
            >
              <QrCode className="w-4 h-4" />
              {showQrCode ? "Hide QR Code" : "Start Authentication"}
            </button>

            {showQrCode && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-6 mb-4 text-center">
                <p className="text-sm text-[#7ca6ff] mb-1 font-semibold">Scan with your phone to continue</p>
                <p className="text-xs text-white/40 mb-4">
                  Live camera photos are required — you must use your phone to take real-time photos of the item.
                </p>
                <img
                  src={qrUrl}
                  alt="QR Code for mobile authentication"
                  className="mx-auto rounded-lg"
                  width={200}
                  height={200}
                />
                <p className="text-xs text-white/30 mt-4">
                  Make sure you&apos;re logged into Relay on your phone before scanning.
                </p>
              </div>
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
            {isAuthExemptOrder ? "Awaiting Shipment" : "Awaiting Seller Authentication"}
          </h2>
          <p className="text-[#7ca6ff] text-sm">
            {isAuthExemptOrder
              ? "This is an admin-approved listing. The seller is preparing your order and will ship it shortly."
              : order.relayTagRequired
                ? "The seller is authenticating your item and binding a Relay security tag before shipment."
                : "The seller is authenticating your item. You\u0027ll be notified once a shipping label is created."}
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
            {order.relayTagRequired
              ? "Your authentication and Relay tag evidence have been submitted. Shipping labels unlock after any required admin review clears."
              : "Great! Your photos have been submitted. Now generate a shipping label to continue."}
          </p>

          {(order.relayTagRequired || order.checkcheckRequired || fulfillmentStatus) && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4 space-y-2">
              {(fulfillmentStatus?.sellerTier || order.sellerTier) && (
                <p className="text-sm text-[#f5f7fb]">
                  Seller tier: <span className="font-semibold">{(fulfillmentStatus?.sellerTier || order.sellerTier || "tier_1").replace("tier_", "Tier ")}</span>
                </p>
              )}
              {order.relayTagRequired && (
                <p className="text-sm text-[#f5f7fb]">
                  Relay tag status: {fulfillmentStatus?.relayTagStatus ? fulfillmentStatus.relayTagStatus.replace(/_/g, " ") : order.custodyVerificationStatus || "pending"}
                </p>
              )}
              {order.checkcheckRequired && (
                <p className="text-sm text-[#f5f7fb]">
                  CheckCheck status: {(fulfillmentStatus?.checkcheckStatus || order.checkcheckStatus || "required").replace(/_/g, " ")}
                </p>
              )}
              {(fulfillmentStatus?.checkcheckReason || order.checkcheckReason) && (
                <p className="text-sm text-white/60">
                  CheckCheck reason: {fulfillmentStatus?.checkcheckReason || order.checkcheckReason}
                </p>
              )}
              {fulfillmentStatus?.checkcheckAdminNotes && (
                <p className="text-sm text-red-300">
                  Admin note: {fulfillmentStatus.checkcheckAdminNotes}
                </p>
              )}
              {fulfillmentStatus?.chainOfCustodyAdminReviewRequired && (
                <p className="text-sm text-amber-300">
                  Chain-of-custody review is still pending.
                </p>
              )}
              {fulfillmentStatus?.legacyAuthFlow && (
                <p className="text-sm text-white/60">
                  Legacy order: this order predates the new custody engine.
                </p>
              )}
              {fulfillmentStatus && !fulfillmentStatus.labelReady && fulfillmentStatus.labelBlockedReasons.length > 0 && (
                <div className="space-y-1">
                  {fulfillmentStatus.labelBlockedReasons.map((reason) => (
                    <p key={reason} className="text-sm text-amber-300">{reason}</p>
                  ))}
                </div>
              )}
              {fulfillmentStatus && (
                <p className={`text-sm font-medium ${fulfillmentStatus.labelReady ? "text-emerald-300" : "text-amber-300"}`}>
                  {fulfillmentStatus.labelReady ? "Label can be generated." : "Label cannot be generated yet."}
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleGenerateLabel}
            disabled={generatingLabel || Boolean(fulfillmentStatus && !fulfillmentStatus.labelReady)}
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

          {sellerCustodyEvidence.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-[#f5f7fb] mb-3">Submitted Custody Evidence</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {sellerCustodyEvidence.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="aspect-square bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                      <img src={item.url} alt={item.label} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs text-white/55">{item.label}</p>
                  </div>
                ))}
              </div>
            </>
          )}

          {order.authPhotos && order.authPhotos.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-[#f5f7fb] mb-3">Legacy Authentication Photos</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {order.authPhotos.map((url, idx) => (
                  <div
                    key={idx}
                    className="aspect-square bg-white/5 border border-white/10 rounded-lg overflow-hidden"
                  >
                    <img src={url} alt={`Legacy auth photo ${idx + 1}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {currentStatus === "auth_submitted" && order.userRole === "buyer" && (
        <div className="relay-card p-6 mb-6 bg-white/[0.04]">
          <h2 className="text-lg font-bold text-[#f5f7fb] mb-2 flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Authentication Complete
          </h2>
          <p className="text-[#7ca6ff] text-sm">
            {order.relayTagRequired
              ? "The seller has submitted authentication and Relay tag evidence. Relay will clear any required review before shipment."
              : "The seller has authenticated the item. A shipping label is being generated."}
          </p>
        </div>
      )}

      {/* ════════════════════════════════ */}
      {/* STATUS: LABEL_CREATED           */}
      {/* ════════════════════════════════ */}
      {currentStatus === "payout_failed" && (
        <div className="relay-card p-6 mb-6 border border-red-500/30 bg-red-500/5">
          <h2 className="text-lg font-bold text-red-300 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Payout Failed
          </h2>
          {order.userRole === "seller" ? (
            <>
              <p className="text-[#7ca6ff] text-sm mb-3">
                Relay attempted to release your payout, but Stripe rejected the transfer.
              </p>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="text-xs font-semibold text-white/50 mb-1">RECORDED ERROR</p>
                <p className="text-sm text-red-200">
                  {order.payoutLastError || "No payout error details were recorded on this order."}
                </p>
              </div>
            </>
          ) : (
            <p className="text-[#7ca6ff] text-sm">
              A seller payout issue was recorded for this order. Buyer-facing fulfillment and dispute history remain intact while Relay resolves the seller transfer.
            </p>
          )}
        </div>
      )}

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

          {order.userRole === "seller" && order.shippingDeadline && (
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
              <div className="space-y-3 mb-4">
                <p className="text-[#7ca6ff] text-sm">
                  Review the delivered pair before the seller receives their earnings.
                  {order.reviewDeadline && (
                    <>
                      {" "}Window closes: <span className="font-semibold">{order.reviewDeadline}</span>
                    </>
                  )}
                </p>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-[#f5f7fb]">
                    Delivery status: <span className="font-semibold">Delivered</span>
                  </p>
                  {order.legacyAuthFlow ? (
                    <p className="text-sm text-white/60">
                      Legacy order: this order predates Relay buyer custody verification, so only review/dispute actions are required.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-[#f5f7fb]">
                        Required before completion: scan the Relay tag and capture live tag and pair photos on your phone.
                      </p>
                      <p className="text-sm text-[#f5f7fb]">
                        Tag status:{" "}
                        <span className="font-semibold">
                          {order.custodyVerificationStatus
                            ? order.custodyVerificationStatus.replace(/_/g, " ")
                            : "pending buyer review"}
                        </span>
                      </p>
                      {order.expectedRelayTagValue && (
                        <p className="text-xs text-white/50">
                          Expected Relay tag: <span className="font-mono text-[#7ca6ff]">{order.expectedRelayTagValue}</span>
                        </p>
                      )}
                      {order.challengeCode && (
                        <p className="text-xs text-white/50">
                          Buyer challenge code: <span className="font-mono text-[#7ca6ff]">{order.challengeCode}</span>
                        </p>
                      )}
                      {order.custodyAdminReviewRequired && (
                        <p className="text-sm text-amber-300">
                          Chain-of-custody evidence is currently flagged for admin review.
                        </p>
                      )}
                    </>
                  )}
                  {order.sellerFundsFrozen && (
                    <p className="text-sm text-red-300">
                      Seller funds are currently frozen while this order is under review.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setShowRatingModal(true)}
                  className="relay-button-success flex items-center justify-center"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Complete Order
                </button>
                <button
                  onClick={() => setShowDisputeForm(true)}
                  className="relay-button-danger flex items-center justify-center"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Open Dispute
                </button>
              </div>
            </div>
          )}

          {order.userRole === "buyer" && showDisputeForm && (
            <BuyerDisputeForm
              requiresRelayCustody={Boolean(order.relayTagRequired && !order.legacyAuthFlow)}
              expectedTagValue={order.expectedRelayTagValue}
              existingScannedValue={order.buyerScannedTagValue}
              existingTagPhotoUrl={order.buyerTagPhotoUrl}
              existingPairPhotoUrl={order.buyerPairPhotoUrl}
              mobileCaptureUrl={mobileBuyerReviewUrl}
              challengeCode={order.challengeCode}
              isMobileDevice={isMobileDevice}
              onRefreshEvidence={() => {
                void refreshBuyerCustodyEvidence()
              }}
              refreshingEvidence={refreshingBuyerCustody}
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
                <p className="text-[#f5f7fb] mb-3">{formatDisputeCategoryLabel(order.disputeReason)}</p>
                <p className="text-xs font-semibold text-white/50 mb-2">DESCRIPTION</p>
                <p className="text-[#7ca6ff] text-sm">{order.disputeTextBuyer}</p>
              </div>

              {order.disputeEvidenceBuyer && order.disputeEvidenceBuyer.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-white/50 mb-2">YOUR EVIDENCE</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
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
                  <p className="text-[#f5f7fb] mb-3">{formatDisputeCategoryLabel(order.disputeReason)}</p>
                  <p className="text-xs font-semibold text-white/50 mb-2">BUYER&apos;S DESCRIPTION</p>
                  <p className="text-[#7ca6ff] text-sm">{order.disputeTextBuyer}</p>
                </div>

                {order.disputeEvidenceBuyer && order.disputeEvidenceBuyer.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-white/50 mb-2">BUYER&apos;S EVIDENCE</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-3">
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
      {/* STATUS: RETURN PENDING          */}
      {/* ════════════════════════════════ */}
      {(currentStatus === "return_pending" || currentStatus === "return_shipped") && (
        <div className="relay-card p-6 mb-6 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-3 mb-4">
            <Package className="w-6 h-6 text-amber-400" />
            <h2 className="text-lg font-bold text-amber-300">
              {currentStatus === "return_pending" ? "Return Required" : "Return In Transit"}
            </h2>
          </div>

          <p className="text-[#7ca6ff] text-sm mb-4">
            The dispute was resolved in your favor. Please return the item using the prepaid shipping label below.
            Your refund will be processed once we receive and verify the return.
          </p>

          {order.returnPackingSlipId && (
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
              <p className="text-xs font-semibold text-white/50 mb-1">RETURN ID</p>
              <p className="text-2xl font-mono font-bold text-[#f5f7fb] tracking-wider">
                {order.returnPackingSlipId}
              </p>
            </div>
          )}

          <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
            <p className="text-xs font-semibold text-white/50 mb-3">STEPS TO RETURN</p>
            <ol className="space-y-2 text-sm text-[#7ca6ff]">
              <li className="flex items-start gap-2">
                <span className="text-[#5f8fff] font-bold mt-0.5">1.</span>
                <span>Download and print the <strong className="text-[#f5f7fb]">packing slip</strong> below</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#5f8fff] font-bold mt-0.5">2.</span>
                <span>Place the packing slip <strong className="text-[#f5f7fb]">inside the box</strong> with the item</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#5f8fff] font-bold mt-0.5">3.</span>
                <span>Seal the package and attach the <strong className="text-[#f5f7fb]">return shipping label</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#5f8fff] font-bold mt-0.5">4.</span>
                <span>Drop off at any carrier pickup location shown on the label</span>
              </li>
            </ol>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {order.returnLabelUrl && (
              <a
                href={order.returnLabelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="relay-button-primary flex items-center justify-center gap-2 flex-1"
              >
                <Download className="w-4 h-4" />
                Download Return Label
              </a>
            )}
            <a
              href={`/api/orders/${order.id}/packing-slip`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-[#f5f7fb] font-medium hover:bg-white/10 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Packing Slip
            </a>
          </div>

          {order.returnTrackingNumber && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <p className="text-xs text-white/50">Return tracking: <span className="font-mono text-[#f5f7fb]">{order.returnTrackingNumber}</span></p>
            </div>
          )}
        </div>
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
              Earnings of <span className="font-bold">{"$"}{order.sellerEarnings.toFixed(2)}</span> have been
              transferred to your account.
            </p>
          )}

          {order.userRole === "buyer" && (
            <p className="text-sm text-emerald-300">
              Thank you for your purchase! We hope you enjoy your new shoes.
            </p>
          )}
        </div>
      )}

      {/* Rating Modal */}
      {showRatingModal && (
        <BuyerCompletionModal
          requiresRelayCustody={Boolean(order.relayTagRequired && !order.legacyAuthFlow)}
          expectedTagValue={order.expectedRelayTagValue}
          existingScannedValue={order.buyerScannedTagValue}
          existingTagPhotoUrl={order.buyerTagPhotoUrl}
          existingPairPhotoUrl={order.buyerPairPhotoUrl}
          mobileCaptureUrl={mobileBuyerReviewUrl}
          challengeCode={order.challengeCode}
          isMobileDevice={isMobileDevice}
          onRefreshEvidence={() => {
            void refreshBuyerCustodyEvidence()
          }}
          refreshingEvidence={refreshingBuyerCustody}
          onSubmit={handleRatingSubmit}
          onClose={() => setShowRatingModal(false)}
          submitting={submittingReview}
        />
      )}

    </div>
  )
}
