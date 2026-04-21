"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { Search, Eye, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";

interface Listing {
  id: string;
  brand: string;
  model: string;
  price: number;
  image_url?: string;
  status: string;
  created_at: string;
  profiles: {
    display_name: string;
  };
}

type ModalState = "none" | "remove";
type SelectedListing = null | {
  id: string;
  title: string;
};

function ListingRow({ listing, onRemoveClick }: any) {
  const isActive = listing.status === "active";

  return (
    <div className="flex items-center justify-between py-4 px-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
      <div className="flex items-center gap-4 flex-1">
        <img
          src={listing.image}
          alt={listing.title}
          className="w-16 h-16 rounded-lg bg-white/5 object-cover"
        />
        <div className="flex-1 min-w-0">
          <p className="text-[#f5f7fb] font-medium truncate">{listing.title}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-white/40 text-sm">{listing.seller}</span>
            <span className="text-white/40 text-sm">·</span>
            <span className="text-white/40 text-sm">{listing.date}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-shrink-0">
        <span className="text-[#f5f7fb] font-semibold w-20 text-right">
          {listing.price}
        </span>

        {!isActive && (
          <span className="px-2.5 py-1 bg-orange-500/20 text-orange-300 text-xs font-semibold rounded-lg">
            FLAGGED
          </span>
        )}

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link href={`/listing/${listing.id}`}>
            <button className="relay-button-secondary text-xs px-2 py-1 flex items-center gap-1">
              <Eye className="w-3 h-3" />
              View
            </button>
          </Link>
          <button
            onClick={() => onRemoveClick(listing.id, listing.title)}
            className="relay-button-secondary text-xs px-2 py-1 flex items-center gap-1 bg-red-500/20 text-red-400 hover:bg-red-500/30"
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function RemoveListingModal({ isOpen, listing, onConfirm, onCancel }: any) {
  if (!isOpen || !listing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relay-card p-5 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold text-[#f5f7fb] mb-2">
          Remove Listing?
        </h2>
        <p className="text-white/60 mb-6">
          This will immediately remove &quot;{listing.title}&quot; from the marketplace.
          The seller will be notified.
        </p>

        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 relay-button-secondary">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 relay-button-secondary bg-red-500/20 text-red-400 hover:bg-red-500/30"
          >
            Remove Listing
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ListingsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [modalState, setModalState] = useState<ModalState>("none");
  const [selectedListing, setSelectedListing] = useState<SelectedListing>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadListings() {
      const supabase = createClient();
      const { data } = await supabase
        .from("listings")
        .select("*, profiles(*)")
        .order("created_at", { ascending: false });

      setListings(data || []);
      setLoading(false);
    }

    loadListings();
  }, []);

  const filteredListings = listings.filter((listing) =>
    `${listing.brand} ${listing.model}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    listing.profiles?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRemoveClick = (id: string, title: string) => {
    setSelectedListing({ id, title });
    setModalState("remove");
  };

  const handleConfirmRemove = async () => {
    if (!selectedListing) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("listings")
      .update({ status: "removed" })
      .eq("id", selectedListing.id);

    if (error) {
      console.error("Failed to remove listing:", error);
      alert("Failed to remove listing. Please try again.");
    } else {
      setListings((prev) =>
        prev.map((l) =>
          l.id === selectedListing.id ? { ...l, status: "removed" } : l
        )
      );
    }

    setModalState("none");
    setSelectedListing(null);
  };

  return (
    <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="space-y-2">
          <p className="relay-eyebrow text-[#5f8fff]">ADMIN</p>
          <h1 className="relay-title">Listing Moderation</h1>
        </div>

        {/* Search Bar */}
        <div className="relay-card p-5">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/5 rounded-lg border border-white/10">
            <Search className="w-5 h-5 text-white/40" />
            <input
              type="text"
              placeholder="Search by listing title or seller..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder-white/40 outline-none text-sm"
            />
          </div>
        </div>

        {/* Listings Table */}
        {loading ? (
          <div className="relay-card p-12 text-center">
            <p className="text-white/40">Loading...</p>
          </div>
        ) : (
          <div className="relay-card overflow-hidden p-0">
            <div className="divide-y divide-white/5">
              {filteredListings.length > 0 ? (
                filteredListings.map((listing: any) => {
                  const images = listing.images as any[];
                  const sizes = listing.sizes as any[];
                  const minPrice = Array.isArray(sizes) && sizes.length > 0
                    ? Math.min(...sizes.map((s: any) => s.price || 0))
                    : 0;
                  return (
                  <ListingRow
                    key={listing.id}
                    listing={{
                      id: listing.id,
                      image: Array.isArray(images) ? images[0] : listing.image_url || '/placeholder-shoe.png',
                      title: `${listing.brand} ${listing.model}`,
                      seller: listing.profiles?.full_name || listing.profiles?.display_name || 'Unknown',
                      date: new Date(listing.created_at).toLocaleDateString(),
                      price: `$${minPrice.toFixed(2)}`,
                      status: listing.status,
                    }}
                    onRemoveClick={handleRemoveClick}
                  />
                  );
                })
              ) : (
                <div className="py-12 text-center">
                  <p className="text-white/40">No listings found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal */}
        <RemoveListingModal
          isOpen={modalState === "remove"}
          listing={selectedListing}
          onConfirm={handleConfirmRemove}
          onCancel={() => setModalState("none")}
        />
      </div>
  );
}
