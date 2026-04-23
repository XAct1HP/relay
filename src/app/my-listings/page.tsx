'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Listing } from '@/types'

interface MyListing {
  id: string
  image: string
  brand: string
  model: string
  status: 'active' | 'sold_out' | 'inactive' | 'removed' | 'pending_review' | 'rejected'
  sizes: string[]
  priceRange: { min: number; max: number }
  totalQuantity: number
  createdAt: string
}


const STATUS_BADGES = {
  active: { label: 'Active', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  inactive: {
    label: 'Inactive',
    color: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
  },
  sold_out: {
    label: 'Sold Out',
    color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  removed: { label: 'Removed', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  pending_review: { label: 'Pending Review', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  rejected: { label: 'Rejected', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
}

export default function MyListingsPage() {
  const router = useRouter()
  const { currentUser } = useAuth()
  const [listings, setListings] = useState<MyListing[]>([])
  const [filter, setFilter] = useState<
    'all' | 'active' | 'inactive' | 'sold_out' | 'removed'
  >('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  const itemsPerPage = 5

  const handleToggleStatus = async (listingId: string, currentStatus: string) => {
    setActionLoading(listingId)
    try {
      const supabase = createClient()
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
      const { error } = await supabase
        .from('listings')
        .update({ status: newStatus })
        .eq('id', listingId)
        .eq('seller_id', currentUser!.id)

      if (error) throw error

      setListings((prev) =>
        prev.map((l) =>
          l.id === listingId ? { ...l, status: newStatus as MyListing['status'] } : l
        )
      )
    } catch (error) {
      console.error('Error updating listing status:', error)
      alert('Failed to update listing status. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (listingId: string) => {
    setActionLoading(listingId)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('listings')
        .update({ status: 'removed' })
        .eq('id', listingId)
        .eq('seller_id', currentUser!.id)

      if (error) throw error

      setListings((prev) =>
        prev.map((l) =>
          l.id === listingId ? { ...l, status: 'removed' as MyListing['status'] } : l
        )
      )
      setShowDeleteConfirm(null)
    } catch (error) {
      console.error('Error deleting listing:', error)
      alert('Failed to delete listing. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }

  useEffect(() => {
    if (!currentUser?.id) {
      setLoading(false)
      return
    }

    async function fetchListings() {
      const supabase = createClient()
      setLoading(true)

      try {
        const { data } = await supabase
          .from('listings')
          .select('*')
          .eq('seller_id', currentUser!.id)
          .order('created_at', { ascending: false })

        if (data) {
          const formatted: MyListing[] = data.map((listing: Listing) => {
            const sizes = (listing.sizes as any[])
              ?.map((s) => s.size?.toString() || '')
              .filter((s) => s) || []

            const prices = (listing.sizes as any[])
              ?.map((s) => s.price || 0)
              .filter((p) => p > 0) || [0]

            const minPrice = Math.min(...prices)
            const maxPrice = Math.max(...prices)

            const totalQty = (listing.sizes as any[])
              ?.reduce((sum, s) => sum + (s.quantity || 0), 0) || 0

            return {
              id: listing.id,
              image: listing.images?.[0] || '/placeholder-shoe.png',
              brand: listing.brand,
              model: listing.model,
              status: listing.status as MyListing['status'],
              sizes,
              priceRange: { min: minPrice, max: maxPrice },
              totalQuantity: totalQty,
              createdAt: new Date(listing.created_at).toLocaleDateString(),
            }
          })

          setListings(formatted)
        }
      } catch (error) {
        console.error('Error fetching listings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchListings()
  }, [currentUser?.id])

  const filteredListings =
    filter === 'all'
      ? listings
      : listings.filter((listing) => listing.status === filter)

  const totalPages = Math.ceil(filteredListings.length / itemsPerPage)
  const startIdx = (currentPage - 1) * itemsPerPage
  const paginatedListings = filteredListings.slice(startIdx, startIdx + itemsPerPage)

  const activeCount = listings.filter((l) => l.status === 'active').length
  const totalInventoryValue = listings.reduce((sum, l) => {
    const avg = (l.priceRange.min + l.priceRange.max) / 2
    return sum + avg * l.totalQuantity
  }, 0)
  const totalSizes = new Set(listings.flatMap((l) => l.sizes)).size

  if (loading) {
    return (
      <div className="relay-empty text-center">Loading...</div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="space-y-2 mb-2">
          <p className="relay-eyebrow text-relay-accent">INVENTORY</p>
          <h1 className="relay-title">My Listings</h1>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
          <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-6">
            <p className="text-white/70 text-sm mb-2">Active Listings</p>
            <p className="text-3xl font-bold text-white">{activeCount}</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-6">
            <p className="text-white/70 text-sm mb-2">Total Inventory Value</p>
            <p className="text-3xl font-bold text-white">${totalInventoryValue.toFixed(0)}</p>
          </div>
          <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-6">
            <p className="text-white/70 text-sm mb-2">Sizes Listed</p>
            <p className="text-3xl font-bold text-white">{totalSizes}</p>
          </div>
        </div>

        {/* Content */}
        <div>
          {/* Filters and Create Button */}
          <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {(['all', 'active', 'inactive', 'sold_out', 'removed'] as const).map(
                (status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setFilter(status)
                      setCurrentPage(1)
                    }}
                    className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                      filter === status
                        ? 'bg-[#5f8fff] text-white'
                        : 'bg-white/[0.04] text-white/70 border border-white/10 hover:bg-white/[0.08]'
                    }`}
                  >
                    {status === 'all'
                      ? 'All'
                      : status === 'sold_out'
                        ? 'Sold Out'
                        : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                )
              )}
            </div>

            <Link
              href="/sell"
              className="px-6 py-2 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-semibold rounded-full transition-colors whitespace-nowrap"
            >
              Create New Listing
            </Link>
          </div>

          {/* Listings */}
          {paginatedListings.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-white/50 mb-4">No listings found</p>
              <Link
                href="/sell"
                className="inline-block px-6 py-2 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-semibold rounded-full transition-colors"
              >
                Create Your First Listing
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedListings.map((listing) => (
                <div
                  key={listing.id}
                  className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-6 hover:bg-white/[0.06] transition-colors"
                >
                  <div className="flex flex-col sm:flex-row gap-6">
                    {/* Image */}
                    <div className="w-full sm:w-32 h-32 flex-shrink-0 rounded-xl overflow-hidden bg-white/5">
                      {listing.image && listing.image !== '/placeholder-shoe.png' ? (
                        <img
                          src={listing.image}
                          alt={`${listing.brand} ${listing.model}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500/20 to-indigo-500/20">
                          <span className="text-white/30 text-xs">No Image</span>
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-1">
                            {listing.brand} {listing.model}
                          </h3>
                          <p className="text-white/60 text-sm">
                            Created {new Date(listing.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span
                          className={`${
                            STATUS_BADGES[listing.status as keyof typeof STATUS_BADGES]
                              .color
                          } border px-3 py-1 rounded-full text-xs font-semibold`}
                        >
                          {
                            STATUS_BADGES[listing.status as keyof typeof STATUS_BADGES]
                              .label
                          }
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-white/50 text-xs uppercase tracking-wide mb-1">
                            Sizes
                          </p>
                          <p className="text-white font-medium text-sm">
                            {listing.sizes.length} available
                          </p>
                        </div>
                        <div>
                          <p className="text-white/50 text-xs uppercase tracking-wide mb-1">
                            Price Range
                          </p>
                          <p className="text-white font-medium text-sm">
                            ${listing.priceRange.min} - ${listing.priceRange.max}
                          </p>
                        </div>
                        <div>
                          <p className="text-white/50 text-xs uppercase tracking-wide mb-1">
                            Total Quantity
                          </p>
                          <p className="text-white font-medium text-sm">
                            {listing.totalQuantity} items
                          </p>
                        </div>
                        <div>
                          <p className="text-white/50 text-xs uppercase tracking-wide mb-1">
                            Total Value
                          </p>
                          <p className="text-white font-medium text-sm">
                            ${(
                              ((listing.priceRange.min + listing.priceRange.max) / 2) *
                              listing.totalQuantity
                            ).toFixed(0)}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 flex-wrap">
                        <Link
                          href={`/listing/${listing.id}`}
                          className="px-4 py-1.5 bg-[#5f8fff]/20 text-[#7ca6ff] hover:bg-[#5f8fff]/30 text-sm font-medium rounded-full transition-colors border border-[#5f8fff]/30"
                        >
                          View
                        </Link>
                        <Link
                          href={`/edit-listing/${listing.id}`}
                          className="px-4 py-1.5 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] text-sm font-medium rounded-full transition-colors border border-white/10"
                        >
                          Edit
                        </Link>
                        {listing.status !== 'removed' && (
                          <button
                            onClick={() => handleToggleStatus(listing.id, listing.status)}
                            disabled={actionLoading === listing.id}
                            className="px-4 py-1.5 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] text-sm font-medium rounded-full transition-colors border border-white/10 disabled:opacity-50"
                          >
                            {actionLoading === listing.id
                              ? 'Updating...'
                              : listing.status === 'active'
                                ? 'Deactivate'
                                : 'Activate'}
                          </button>
                        )}
                        {listing.status !== 'removed' && (
                          showDeleteConfirm === listing.id ? (
                            <div className="flex gap-2 items-center">
                              <span className="text-red-300 text-xs">Are you sure?</span>
                              <button
                                onClick={() => handleDelete(listing.id)}
                                disabled={actionLoading === listing.id}
                                className="px-3 py-1.5 bg-red-500/30 text-red-300 hover:bg-red-500/40 text-sm font-medium rounded-full transition-colors border border-red-500/30 disabled:opacity-50"
                              >
                                {actionLoading === listing.id ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-3 py-1.5 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] text-sm font-medium rounded-full transition-colors border border-white/10"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowDeleteConfirm(listing.id)}
                              className="px-4 py-1.5 bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm font-medium rounded-full transition-colors border border-red-500/30"
                            >
                              Delete
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-[#5f8fff] text-white'
                      : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08] border border-white/10'
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
          )}
        </div>
    </div>
  )
}
