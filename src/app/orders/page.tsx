"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ChevronRight, Package, Clock, CheckCircle2, AlertCircle } from "lucide-react"
import { createClient } from "@/lib/supabase"
import useAuth from "@/hooks/useAuth"
import { Order } from "@/types"
import { useNotificationStore } from "@/store/notificationStore"

type OrderStatus =
  | "paid"
  | "auth_submitted"
  | "label_created"
  | "shipped"
  | "delivered"
  | "review_window"
  | "completed"
  | "disputed"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "payout_failed"
  | "return_pending"
  | "return_shipped"
  | "return_delivered"

type FilterTab = "all" | "in_progress" | "completed" | "cancelled"

interface DisplayOrder {
  id: string
  role: "buying" | "selling"
  shoeImage: string
  brand: string
  model: string
  size: string
  orderDate: string
  status: OrderStatus
  price: number
}

const statusConfig: Record<
  OrderStatus,
  { label: string; color: string; icon: React.ReactNode; badge: string }
> = {
  paid: {
    label: "Payment Received",
    color: "bg-blue-500/20 text-blue-300",
    icon: <Package className="w-4 h-4" />,
    badge: "bg-blue-500/10 text-blue-300",
  },
  auth_submitted: {
    label: "Auth Submitted",
    color: "bg-purple-500/20 text-purple-300",
    icon: <Clock className="w-4 h-4" />,
    badge: "bg-purple-500/10 text-purple-300",
  },
  label_created: {
    label: "Label Created",
    color: "bg-indigo-500/20 text-indigo-300",
    icon: <Package className="w-4 h-4" />,
    badge: "bg-indigo-500/10 text-indigo-300",
  },
  shipped: {
    label: "Shipped",
    color: "bg-cyan-500/20 text-cyan-300",
    icon: <Package className="w-4 h-4" />,
    badge: "bg-cyan-500/10 text-cyan-300",
  },
  delivered: {
    label: "Delivered",
    color: "bg-green-500/20 text-green-300",
    icon: <CheckCircle2 className="w-4 h-4" />,
    badge: "bg-green-500/10 text-green-300",
  },
  review_window: {
    label: "Review Window",
    color: "bg-amber-500/20 text-amber-300",
    icon: <Clock className="w-4 h-4" />,
    badge: "bg-amber-500/10 text-amber-300",
  },
  completed: {
    label: "Completed",
    color: "bg-emerald-500/20 text-emerald-300",
    icon: <CheckCircle2 className="w-4 h-4" />,
    badge: "bg-emerald-500/10 text-emerald-300",
  },
  disputed: {
    label: "Disputed",
    color: "bg-red-500/20 text-red-300",
    icon: <AlertCircle className="w-4 h-4" />,
    badge: "bg-red-500/10 text-red-300",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-gray-500/20 text-gray-300",
    icon: <AlertCircle className="w-4 h-4" />,
    badge: "bg-gray-500/10 text-gray-300",
  },
  refund_pending: {
    label: "Refund Pending",
    color: "bg-amber-500/20 text-amber-300",
    icon: <Clock className="w-4 h-4" />,
    badge: "bg-amber-500/10 text-amber-300",
  },
  refunded: {
    label: "Refunded",
    color: "bg-gray-500/20 text-gray-300",
    icon: <AlertCircle className="w-4 h-4" />,
    badge: "bg-gray-500/10 text-gray-300",
  },
  payout_failed: {
    label: "Payout Failed",
    color: "bg-red-500/20 text-red-300",
    icon: <AlertCircle className="w-4 h-4" />,
    badge: "bg-red-500/10 text-red-300",
  },
  return_pending: {
    label: "Return Required",
    color: "bg-amber-500/20 text-amber-300",
    icon: <Package className="w-4 h-4" />,
    badge: "bg-amber-500/10 text-amber-300",
  },
  return_shipped: {
    label: "Return Shipped",
    color: "bg-cyan-500/20 text-cyan-300",
    icon: <Package className="w-4 h-4" />,
    badge: "bg-cyan-500/10 text-cyan-300",
  },
  return_delivered: {
    label: "Return Received",
    color: "bg-green-500/20 text-green-300",
    icon: <CheckCircle2 className="w-4 h-4" />,
    badge: "bg-green-500/10 text-green-300",
  },
}

const isInProgress = (status: OrderStatus) =>
  ["paid", "auth_submitted", "label_created", "shipped", "review_window", "return_pending", "return_shipped"].includes(status)

const isCompleted = (status: OrderStatus) => status === "completed" || status === "return_delivered"

const isCancelledOrRefunded = (status: OrderStatus) =>
  status === "cancelled" || status === "refunded" || status === "refund_pending" || status === "payout_failed"

export default function OrdersPage() {
  const { currentUser } = useAuth()
  const { markOrdersSeen } = useNotificationStore()
  const [orders, setOrders] = useState<DisplayOrder[]>([])
  const [filter, setFilter] = useState<FilterTab>("all")
  const [loading, setLoading] = useState(true)

  // Clear the notification dot when viewing orders
  useEffect(() => {
    markOrdersSeen()
  }, [markOrdersSeen])

  // Mark all active orders as seen for this user
  useEffect(() => {
    if (!currentUser?.id) return
    const supabase = createClient()
    const now = new Date().toISOString()

    // Update buyer_last_seen_at for orders where user is buyer
    supabase
      .from("orders")
      .update({ buyer_last_seen_at: now })
      .eq("buyer_id", currentUser.id)
      .is("buyer_last_seen_at", null)
      .then()

    supabase
      .from("orders")
      .update({ buyer_last_seen_at: now })
      .eq("buyer_id", currentUser.id)
      .lt("buyer_last_seen_at", now)
      .then()

    // Update seller_last_seen_at for orders where user is seller
    supabase
      .from("orders")
      .update({ seller_last_seen_at: now })
      .eq("seller_id", currentUser.id)
      .is("seller_last_seen_at", null)
      .then()

    supabase
      .from("orders")
      .update({ seller_last_seen_at: now })
      .eq("seller_id", currentUser.id)
      .lt("seller_last_seen_at", now)
      .then()
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false)
      return
    }

    async function fetchOrders() {
      const supabase = createClient()
      setLoading(true)

      try {
        const { data: buyingOrders } = await supabase
          .from("orders")
          .select("*, listing:listings(brand, model, images)")
          .eq("buyer_id", currentUser!.id)
          .order("created_at", { ascending: false })

        const { data: sellingOrders } = await supabase
          .from("orders")
          .select("*, listing:listings(brand, model, images)")
          .eq("seller_id", currentUser!.id)
          .order("created_at", { ascending: false })

        const formatted: DisplayOrder[] = []

        if (buyingOrders) {
          formatted.push(
            ...buyingOrders.map((order: Order) => ({
              id: order.id,
              role: "buying" as const,
              shoeImage: order.listing?.images?.[0] || "",
              brand: order.listing?.brand || "Unknown",
              model: order.listing?.model || "Unknown",
              size: order.size,
              orderDate: new Date(order.created_at).toLocaleDateString(),
              status: order.status as OrderStatus,
              price: order.price,
            }))
          )
        }

        if (sellingOrders) {
          formatted.push(
            ...sellingOrders.map((order: Order) => ({
              id: order.id,
              role: "selling" as const,
              shoeImage: order.listing?.images?.[0] || "",
              brand: order.listing?.brand || "Unknown",
              model: order.listing?.model || "Unknown",
              size: order.size,
              orderDate: new Date(order.created_at).toLocaleDateString(),
              status: order.status as OrderStatus,
              price: order.price,
            }))
          )
        }

        setOrders(formatted)
      } catch (error) {
        console.error("Error fetching orders:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [currentUser?.id])

  const filteredOrders = orders.filter((order) => {
    if (filter === "all") return true
    if (filter === "in_progress") return isInProgress(order.status)
    if (filter === "completed") return isCompleted(order.status)
    if (filter === "cancelled") {
      return isCancelledOrRefunded(order.status) || order.status === "disputed"
    }
    return true
  })

  if (loading) {
    return <div className="relay-empty text-center">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="relay-eyebrow text-[#5f8fff]">MY ORDERS</p>
        <h1 className="relay-title">Orders</h1>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-3 border-b border-white/10 pb-4">
        {(["all", "in_progress", "completed", "cancelled"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`rounded-full px-4 py-2 font-medium transition-all ${
              filter === tab ? "bg-[#5f8fff] text-white" : "text-[#7ca6ff] hover:bg-white/5"
            }`}
          >
            {tab === "all" && "All"}
            {tab === "in_progress" && "In Progress"}
            {tab === "completed" && "Completed"}
            {tab === "cancelled" && "Cancelled/Disputed"}
          </button>
        ))}
      </div>

      {/* Orders List */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="relay-card p-8 text-center">
            <p className="text-relay-muted">No orders in this category</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const config = statusConfig[order.status]

            return (
              <Link key={order.id} href={`/orders/${order.id}`}>
                <div className="relay-card group mb-4 cursor-pointer p-5 transition-all hover:bg-white/[0.06]">
                  <div className="flex items-center gap-4">
                    {/* Left: Image */}
                    <div className="flex-shrink-0">
                      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/5 overflow-hidden">
                        {order.shoeImage ? (
                          <img src={order.shoeImage} alt={`${order.brand} ${order.model}`} className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-8 w-8 text-[#7ca6ff]" />
                        )}
                      </div>
                    </div>

                    {/* Middle: Info */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="truncate font-semibold text-[#f5f7fb]">
                          {order.brand} {order.model}
                        </h3>
                      </div>
                      <div className="mb-2 text-sm text-[#7ca6ff]">
                        Size {order.size} • {order.orderDate}
                      </div>
                      <div className="text-xs text-white/40">{order.id}</div>
                    </div>

                    {/* Status & Role */}
                    <div className="flex flex-shrink-0 items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="relay-badge-info flex items-center gap-1 rounded-lg border-0 px-3 py-1 text-xs">
                          {config.icon}
                          {config.label}
                        </span>
                        <span className="relay-badge-neutral rounded-lg border-0 px-3 py-1 text-xs">
                          {order.role === "buying" ? "Buying" : "Selling"}
                        </span>
                      </div>
                    </div>

                    {/* Price & Arrow */}
                    <div className="flex flex-shrink-0 items-center gap-3 text-right">
                      <div className="font-semibold text-[#f5f7fb]">{"$"}{order.price.toFixed(2)}</div>
                      <ChevronRight className="h-5 w-5 text-[#7ca6ff] transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-white/10 pt-4">
        <p className="text-sm text-[#7ca6ff]">
          Showing {filteredOrders.length} of {orders.length} orders
        </p>
        <div className="flex gap-2">
          <button className="relay-button-secondary" disabled>
            Previous
          </button>
          <button className="relay-button-secondary" disabled>
            Next
          </button>
        </div>
      </div>
    </div>
  )
}