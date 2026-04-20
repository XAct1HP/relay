"use client"

import { useState, useEffect } from "react"
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
} from "lucide-react"

type OrderStatus = "paid" | "auth_submitted" | "label_created" | "shipped" | "delivered" | "review_window" | "completed" | "disputed" | "cancelled" | "refunded"
type UserRole = "buyer" | "seller"

interface OrderData {
  id: string
  userRole: UserRole
  status: OrderStatus
  orderDate: string
  shoeImage: string
  brand: string
  model: string
  size: string
  shoePrice: number
  shippingPrice: number
  platformFeePercent: number
  stripeFeePrice: number
  totalPrice: number
  sellerEarnings?: number
  buyerAddress: string
  sellerName: string
  sellerProfileUrl: string
  trackingNumber?: string
  estimatedDelivery?: string
  reviewWindowHours?: number
  authPhotos?: string[]
  authCertificate?: string
  challengeCode?: string
  disputeReason?: string
  disputeDescription?: string
  buyerRating?: number
  buyerComment?: string
  sellerResponse?: string
  shippingDeadline?: string
  paymentMethod?: string
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

// Components
const ProgressTracker = ({ currentStatus }: { currentStatus: OrderStatus }) => {
  const stageIndex = statusStages.indexOf(currentStatus as any)

  return (
    <div className="relay-card p-6 mb-6">
      <div className="flex items-center justify-between">
        {statusStages.map((stage, idx) => {
          const isCompleted = idx < stageIndex
          const isCurrent = idx === stageIndex
          const isFuture = idx > stageIndex

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

const PhotoUploadGrid = ({ angles, onUpload }: { angles: string[]; onUpload: (angle: string) => void }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      {angles.map((angle) => (
        <button
          key={angle}
          onClick={() => onUpload(angle)}
          className="aspect-square bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all flex flex-col items-center justify-center p-3 text-center cursor-pointer"
        >
          <Upload className="w-6 h-6 text-[#7ca6ff] mb-2" />
          <p className="text-xs text-[#f5f7fb]">{angle}</p>
        </button>
      ))}
    </div>
  )
}

const RatingModal = ({ onSubmit }: { onSubmit: (rating: number, comment: string) => void }) => {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [hoveredRating, setHoveredRating] = useState(0)

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="relay-card p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-[#f5f7fb] mb-6">Rate Your Experience</h2>

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
          disabled={rating === 0}
          className="relay-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Submit Review & Complete Order
        </button>
      </div>
    </div>
  )
}

const DisputeForm = ({ onSubmit }: { onSubmit: (reason: string, description: string) => void }) => {
  const [reason, setReason] = useState("")
  const [description, setDescription] = useState("")
  const [showReasonDropdown, setShowReasonDropdown] = useState(false)

  const reasons = [
    "Item not as described",
    "Wrong item received",
    "Item damaged",
    "Authentication concerns",
    "Other",
  ]

  return (
    <div className="relay-card p-6 mb-6 border border-red-500/20 bg-red-500/5">
      <h3 className="text-lg font-bold text-[#f5f7fb] mb-4">What's wrong with your order?</h3>

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

        <div className="border-2 border-dashed border-white/10 rounded-lg p-6 text-center cursor-pointer hover:border-white/20 transition-all">
          <Upload className="w-6 h-6 text-[#7ca6ff] mx-auto mb-2" />
          <p className="text-sm text-[#f5f7fb]">Upload evidence photos (up to 5)</p>
          <p className="text-xs text-white/40 mt-1">or drag and drop</p>
        </div>

        <button
          onClick={() => onSubmit(reason, description)}
          disabled={!reason || !description}
          className="relay-button-danger w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Submit Complaint
        </button>

        <p className="text-xs text-[#7ca6ff] text-center">
          Your complaint will be reviewed by admin
        </p>
      </div>
    </div>
  )
}

// Main component
export default function OrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { currentUser } = useAuth()
  const [order, setOrder] = useState<OrderData | null>(null)
  const [statusOverride, setStatusOverride] = useState<OrderStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reviewSubmitted, setReviewSubmitted] = useState(false)

  useEffect(() => {
    async function loadOrder() {
      const supabase = createClient()

      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          listings (*),
          profiles!orders_buyer_id_fkey (*),
          profiles!orders_seller_id_fkey (*)
        `)
        .eq("id", params.id)
        .single()

      if (error || !data) {
        setLoading(false)
        return
      }

      const orderData: OrderData = {
        id: data.id,
        userRole: data.buyer_id === currentUser?.id ? "buyer" : "seller",
        status: data.status || "paid",
        orderDate: new Date(data.created_at).toLocaleDateString(),
        shoeImage: data.listings?.image_url || "/placeholder-shoe.png",
        brand: data.listings?.brand || "Unknown",
        model: data.listings?.model || "Unknown",
        size: data.size || "N/A",
        shoePrice: data.listings?.price || 0,
        shippingPrice: 15.00,
        platformFeePercent: 1,
        stripeFeePrice: data.listings?.price ? (data.listings.price * 0.029) + 0.30 : 0,
        totalPrice: (data.listings?.price || 0) + 15.00,
        sellerEarnings: data.listing ? (data.listings.price * 0.98) : 0,
        buyerAddress: data.buyer_address || "N/A",
        sellerName: data.profiles?.[1]?.display_name || "Unknown Seller",
        sellerProfileUrl: `/profile/${data.profiles?.[1]?.username}`,
        trackingNumber: data.tracking_number,
        estimatedDelivery: data.estimated_delivery,
        challengeCode: data.challenge_code,
        disputeReason: data.dispute_reason,
        disputeDescription: data.dispute_description,
        buyerRating: data.buyer_rating,
        buyerComment: data.buyer_comment,
      }

      setOrder(orderData)
      setStatusOverride(null)
      setLoading(false)
    }

    loadOrder()
  }, [params.id, currentUser?.id])

  const handleCopyTracking = () => {
    if (order?.trackingNumber) {
      navigator.clipboard.writeText(order.trackingNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleRatingSubmit = (rating: number, comment: string) => {
    setShowRatingModal(false)
    setReviewSubmitted(true)
  }

  const handleDisputeSubmit = (reason: string, description: string) => {
    setShowDisputeForm(false)
  }

  if (loading) {
    return (
      <div className="relay-empty text-center p-12">Loading...</div>
    )
  }

  if (!order) {
    return (
      <div className="relay-empty text-center p-12">
          <p className="text-white/40 text-lg">Order not found</p>
      </div>
    )
  }

  const platformFee = (order.shoePrice * order.platformFeePercent) / 100

  return (
    <div className="space-y-6">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[#7ca6ff] hover:text-[#5f8fff] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Orders
        </button>

        {/* Dev Status Switcher - Local State Only */}
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
            <p className="text-sm text-[#7ca6ff] font-medium">ORDER #{order.id}</p>
            <p className="text-xs text-white/50 mt-1">{order.orderDate}</p>
          </div>
          <span className={statusConfig[statusOverride || order.status].color + " relay-badge-info border-0 px-3 py-1 rounded-lg flex items-center gap-1 inline-flex"}>
            {statusConfig[statusOverride || order.status].icon}
            {statusConfig[statusOverride || order.status].label}
          </span>
        </div>

        {/* Progress Tracker */}
        {!["completed", "disputed"].includes(statusOverride || order.status) && (
          <ProgressTracker currentStatus={statusOverride || order.status} />
        )}

        {/* Order Summary Card */}
        <div className="relay-card p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Shoe Image & Info */}
            <div className="md:col-span-1">
              <div className="bg-white/5 aspect-square rounded-xl mb-4 flex items-center justify-center">
                <Package className="w-16 h-16 text-[#7ca6ff]" />
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
                  <span>${order.shoePrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[#7ca6ff]">
                  <span>Shipping</span>
                  <span>${order.shippingPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[#7ca6ff]">
                  <span>Platform Fee ({order.platformFeePercent}%)</span>
                  <span>${platformFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[#7ca6ff]">
                  <span>Stripe Fee</span>
                  <span>${order.stripeFeePrice.toFixed(2)}</span>
                </div>
                <div className="border-t border-white/10 pt-2 flex justify-between font-bold text-[#f5f7fb]">
                  <span>{order.userRole === "buyer" ? "Total Paid" : "Your Earnings"}</span>
                  <span>
                    $
                    {(order.userRole === "buyer"
                      ? order.totalPrice
                      : order.sellerEarnings || 0
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
              <p className="text-sm text-[#7ca6ff]">{order.buyerAddress}</p>
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

        {/* STATUS: PAID (Seller needs to authenticate) */}
        {(statusOverride || order.status) === "paid" && order.userRole === "seller" && (
          <>
            <div className="relay-card p-6 mb-6 border border-[#5f8fff]/30 bg-[#5f8fff]/5">
              <h2 className="text-lg font-bold text-[#f5f7fb] mb-2 flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#5f8fff]" />
                Post-Sale Authentication Required
              </h2>
              <p className="text-[#7ca6ff] text-sm mb-4">
                Please authenticate the item to proceed. You have until{" "}
                <span className="font-semibold">{order.shippingDeadline}</span> to ship.
              </p>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4 mb-4">
                <p className="text-sm font-mono text-[#7ca6ff] mb-2">Challenge Code:</p>
                <div className="flex items-center gap-2">
                  <code className="text-lg font-bold text-[#f5f7fb] bg-white/5 px-3 py-2 rounded font-mono">
                    {order.challengeCode}
                  </code>
                  <button className="p-2 bg-white/5 hover:bg-white/10 rounded transition-all">
                    <Copy className="w-4 h-4 text-[#7ca6ff]" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <button className="relay-button-primary flex items-center justify-center gap-2">
                  <QrCode className="w-4 h-4" />
                  Complete on Phone
                </button>
                <button className="relay-button-secondary flex items-center justify-center gap-2">
                  <FileText className="w-4 h-4" />
                  Start Authentication
                </button>
              </div>

              <h3 className="text-sm font-semibold text-[#f5f7fb] mb-3">Required Photos</h3>
              <div className="text-sm text-[#7ca6ff] space-y-1 mb-4">
                <p>• Front angle • Back angle • Side view (left) • Side view (right)</p>
                <p>• Sole of shoe • Tag/Label • With challenge code visible • With CheckCheck certificate</p>
              </div>

              <PhotoUploadGrid
                angles={["Front", "Back", "Left", "Right", "Sole", "Tag", "Challenge", "Certificate"]}
                onUpload={(angle) => console.log("Upload:", angle)}
              />

              <div className="border-2 border-dashed border-white/10 rounded-lg p-6 text-center cursor-pointer hover:border-white/20 transition-all mb-4">
                <FileText className="w-8 h-8 text-[#7ca6ff] mx-auto mb-2" />
                <p className="text-sm text-[#f5f7fb]">Upload CheckCheck Certificate</p>
                <p className="text-xs text-white/40">PDF or image format</p>
              </div>

              <button className="relay-button-primary w-full disabled:opacity-50">
                Submit Authentication
              </button>

              <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-300">
                  You have 5 days from purchase to ship. Deadline:{" "}
                  <span className="font-semibold">{order.shippingDeadline}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* STATUS: AUTH_SUBMITTED (Seller can generate label) */}
        {(statusOverride || order.status) === "auth_submitted" && order.userRole === "seller" && (
          <div className="relay-card p-6 mb-6 border border-emerald-500/30 bg-emerald-500/5">
            <h2 className="text-lg font-bold text-emerald-300 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Authentication Submitted
            </h2>
            <p className="text-[#7ca6ff] text-sm mb-4">
              Great! Your photos have been submitted. Now generate a shipping label to continue.
            </p>

            <button className="relay-button-primary w-full mb-6">
              Generate Shipping Label
            </button>

            <h3 className="text-sm font-semibold text-[#f5f7fb] mb-3">Your Submitted Photos</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {["Front", "Back", "Left", "Right", "Sole", "Tag", "Challenge", "Certificate"].map((angle) => (
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

        {/* STATUS: LABEL_CREATED */}
        {(statusOverride || order.status) === "label_created" && (
          <div className="relay-card p-6 mb-6">
            <h2 className="text-lg font-bold text-[#f5f7fb] mb-4">Shipping Label Ready</h2>

            {order.userRole === "seller" && (
              <button className="relay-button-primary w-full mb-4 flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                Download Shipping Label (PDF)
              </button>
            )}

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-xs font-semibold text-white/50 mb-1">TRACKING NUMBER</p>
                <div className="flex items-center gap-2">
                  <code className="text-lg font-mono font-bold text-[#f5f7fb] bg-white/5 px-3 py-2 rounded flex-1">
                    {order.trackingNumber}
                  </code>
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
                </div>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-300">
                Ship by <span className="font-semibold">{order.shippingDeadline}</span>
              </p>
            </div>
          </div>
        )}

        {/* STATUS: SHIPPED */}
        {(statusOverride || order.status) === "shipped" && (
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
                    {order.trackingNumber}
                  </code>
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
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-white/50 mb-1">ESTIMATED DELIVERY</p>
                <p className="text-[#f5f7fb] font-semibold">{order.estimatedDelivery}</p>
              </div>
            </div>

            {order.userRole === "buyer" && (
              <button className="relay-button-primary w-full">
                Mark as Delivered
              </button>
            )}

            <p className="text-xs text-[#7ca6ff] text-center mt-4">
              Click the button above once you receive the package
            </p>
          </div>
        )}

        {/* STATUS: DELIVERED / REVIEW WINDOW */}
        {((statusOverride || order.status) === "delivered" || (statusOverride || order.status) === "review_window") && (
          <>
            {order.userRole === "buyer" && (
              <div className="relay-card p-6 mb-6 border border-amber-500/30 bg-amber-500/5">
                <h2 className="text-lg font-bold text-amber-300 mb-2 flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  48-Hour Review Window
                </h2>
                <p className="text-[#7ca6ff] text-sm mb-4">
                  Review the item before the seller receives their earnings
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setShowRatingModal(true)}
                    className="relay-button-success"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Everything Looks Good
                  </button>
                  <button
                    onClick={() => setShowDisputeForm(true)}
                    className="relay-button-danger"
                  >
                    <AlertCircle className="w-4 h-4 mr-2" />
                    File a Complaint
                  </button>
                </div>
              </div>
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

        {/* STATUS: DISPUTED */}
        {(statusOverride || order.status) === "disputed" && (
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
                  <p className="text-[#7ca6ff] text-sm">{order.disputeDescription}</p>
                </div>

                <p className="text-xs text-[#7ca6ff] bg-white/5 border border-white/10 rounded p-3">
                  Our team is reviewing your complaint. You'll be notified once a decision is made.
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
                    <p className="text-xs font-semibold text-white/50 mb-2">BUYER'S REASON</p>
                    <p className="text-[#f5f7fb] mb-3">{order.disputeReason}</p>
                    <p className="text-xs font-semibold text-white/50 mb-2">BUYER'S DESCRIPTION</p>
                    <p className="text-[#7ca6ff] text-sm">{order.disputeDescription}</p>
                  </div>
                </div>

                <div className="relay-card p-6 mb-6">
                  <h3 className="text-lg font-bold text-[#f5f7fb] mb-4">Submit Your Response</h3>

                  <textarea
                    placeholder="Explain your side of the situation..."
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-[#f5f7fb] placeholder-white/40 text-sm mb-4 focus:outline-none focus:border-[#5f8fff]"
                    rows={4}
                  />

                  <div className="border-2 border-dashed border-white/10 rounded-lg p-6 text-center cursor-pointer hover:border-white/20 transition-all mb-4">
                    <Upload className="w-6 h-6 text-[#7ca6ff] mx-auto mb-2" />
                    <p className="text-sm text-[#f5f7fb]">Upload evidence photos (up to 5)</p>
                  </div>

                  <button className="relay-button-primary w-full">
                    Submit Evidence
                  </button>
                </div>

                <div className="relay-card p-4 text-center bg-white/[0.02]">
                  <p className="text-sm text-[#7ca6ff]">Awaiting admin decision</p>
                </div>
              </>
            )}
          </>
        )}

        {/* STATUS: COMPLETED */}
        {(statusOverride || order.status) === "completed" && (
          <div className="relay-card p-6 mb-6 border border-emerald-500/30 bg-emerald-500/5">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <h2 className="text-lg font-bold text-emerald-300">Order Complete</h2>
            </div>

            {order.buyerRating && !reviewSubmitted && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="text-xs font-semibold text-white/50 mb-2">BUYER'S RATING</p>
                <div className="flex items-center gap-2 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${
                        i < order.buyerRating!
                          ? "fill-[#5f8fff] text-[#5f8fff]"
                          : "text-white/20"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[#f5f7fb] text-sm">{order.buyerComment}</p>
              </div>
            )}

            {order.userRole === "seller" && (
              <p className="text-sm text-emerald-300">
                Earnings of <span className="font-bold">${order.sellerEarnings?.toFixed(2)}</span> have been
                transferred to your account
              </p>
            )}
          </div>
        )}

        {/* Show dispute form modal */}
        {showDisputeForm && <DisputeForm onSubmit={handleDisputeSubmit} />}

        {/* Show rating modal */}
        {showRatingModal && <RatingModal onSubmit={handleRatingSubmit} />}
    </div>
  )
}
