"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Heart, Sparkles, TrendingUp, Star, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { formatListingTitle } from "@/lib/listing-display";
import useAuth from "@/hooks/useAuth";
import { useOnboardingPhase } from "@/hooks/useOnboardingPhase";
import Link from "next/link";

interface FeedPost {
  id: string;
  seller_id: string;
  sellerName: string;
  sellerUsername: string;
  sellerAvatar: string;
  isRisingBrand: boolean;
  isCustomBrand: boolean;
  content: string;
  images: string[];
  likes: number;
  isLiked: boolean;
  timeAgo: string;
  relatedListing?: {
    id: string;
    name: string;
    brand: string;
    price: number;
    image?: string;
  };
  _score?: number;
  _isFollowed?: boolean;
}

const BATCH_SIZE = 15;
const CUSTOM_BRAND_INTERVAL = 5;

export default function FeedPage() {
  const { currentUser } = useAuth();
  const { onboardingActive } = useOnboardingPhase();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const likingInFlight = useRef(new Set<string>());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const followedIdsRef = useRef<string[]>([]);
  const customBrandPoolRef = useRef<FeedPost[]>([]);
  const customBrandIndexRef = useRef(0);
  const seenPostIds = useRef(new Set<string>());
  const initialLoadDone = useRef(false);

  // Personalization weights
  const FOLLOW_BOOST = 200;
  const LIKE_TIERS = [
    { min: 100, score: 300 },
    { min: 50, score: 180 },
    { min: 20, score: 80 },
    { min: 10, score: 40 },
  ];
  const RECENCY_DECAY_RATE = 0.5; // points lost per hour
  const LINKED_LISTING_BOOST = 50;
  const RISING_BRAND_BOOST = 75;

  function scorePost(post: FeedPost, followedIds: string[]): FeedPost {
    let score = 0;

    // Recency: newer posts score higher
    const ageHours = (Date.now() - new Date(post.timeAgo).getTime()) / (1000 * 60 * 60);
    score += Math.max(0, 100 - ageHours * RECENCY_DECAY_RATE);

    // Follow boost
    if (followedIds.includes(post.seller_id)) {
      score += FOLLOW_BOOST;
      post._isFollowed = true;
    }

    // Engagement tiers
    const tier = LIKE_TIERS.find((t) => post.likes >= t.min);
    score += tier ? tier.score : post.likes * 3;

    // Linked listing boost
    if (post.relatedListing) {
      score += LINKED_LISTING_BOOST;
    }

    // Rising brand boost
    if (post.isRisingBrand) {
      score += RISING_BRAND_BOOST;
    }

    post._score = score;
    return post;
  }

  async function formatPosts(data: any[], supabase: any, userId: string | undefined, followedIds: string[]): Promise<FeedPost[]> {
    let likedPostIds = new Set<string>();
    if (userId && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const { data: likesData } = await supabase.from("post_likes").select("post_id").eq("user_id", userId).in("post_id", postIds);
      likedPostIds = new Set((likesData || []).map((l: any) => l.post_id));
    }
    return data.map((post: any) => {
      const listing = post.listing?.status === "removed" ? null : post.listing;
      const lowestPrice = listing?.sizes ? Math.min(...(listing.sizes as any[]).map((s: any) => s.price)) : 0;
      return {
        id: post.id,
        seller_id: post.seller_id,
        sellerName: post.seller?.display_name || post.seller?.full_name || "Unknown",
        sellerUsername: post.seller?.username ? "@" + post.seller.username : "@unknown",
        sellerAvatar: post.seller?.avatar_url || "https://api.dicebear.com/7.x/avataaars/svg?seed=" + (post.seller?.username || "default"),
        isRisingBrand: post.is_rising_brand || false,
        isCustomBrand: post.is_custom_brand || false,
        content: post.content,
        images: post.images || [],
        likes: post.likes_count || 0,
        isLiked: likedPostIds.has(post.id),
        timeAgo: post.created_at,
        _isFollowed: followedIds.includes(post.seller_id),
        relatedListing: listing ? { id: listing.id, name: formatListingTitle(listing.brand, listing.model, undefined, "Listing"), brand: listing.brand, price: lowestPrice, image: listing.images?.[0] || undefined } : undefined,
      };
    });
  }

  function injectCustomBrandPosts(regular: FeedPost[]): FeedPost[] {
    const pool = customBrandPoolRef.current;
    if (pool.length === 0) return regular;

    const result: FeedPost[] = [];
    for (let i = 0; i < regular.length; i++) {
      result.push(regular[i]);
      if ((i + 1) % CUSTOM_BRAND_INTERVAL === 0 && customBrandIndexRef.current < pool.length) {
        const cp = pool[customBrandIndexRef.current];
        if (!seenPostIds.current.has(cp.id)) {
          result.push(cp);
          seenPostIds.current.add(cp.id);
        }
        customBrandIndexRef.current++;
      }
    }
    return result;
  }

  const loadPosts = useCallback(async (isInitial: boolean) => {
    if (!isInitial && (loadingMore || !hasMore)) return;
    if (isInitial) {
      setLoading(true);
      setOffset(0);
      seenPostIds.current.clear();
      customBrandIndexRef.current = 0;
    } else {
      setLoadingMore(true);
    }

    const supabase = createClient();

    try {
      // Load followed IDs on initial load
      if (isInitial && currentUser?.id) {
        const { data: followsData } = await supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", currentUser.id);
        followedIdsRef.current = (followsData || []).map((f: any) => f.following_id);
      }

      const currentOffset = isInitial ? 0 : offset;
      const followedIds = followedIdsRef.current;

      // Fetch regular posts
      const { data: regularData } = await supabase
        .from("posts")
        .select("*, seller:profiles(id, full_name, username, avatar_url, display_name), listing:listings(id, brand, model, nickname, images, sizes, status)")
        .eq("is_custom_brand", false)
        .order("created_at", { ascending: false })
        .range(currentOffset, currentOffset + BATCH_SIZE - 1);

      // On initial load, also fetch custom brand posts for injection
      if (isInitial) {
        const { data: customBrandData } = await supabase
          .from("posts")
          .select("*, seller:profiles(id, full_name, username, avatar_url, display_name), listing:listings(id, brand, model, nickname, images, sizes, status)")
          .eq("is_custom_brand", true)
          .order("created_at", { ascending: false })
          .limit(30);
        const customFormatted = await formatPosts(customBrandData || [], supabase, currentUser?.id, followedIds);
        customBrandPoolRef.current = customFormatted.sort(() => Math.random() - 0.5);
      }

      const regularFormatted = await formatPosts(regularData || [], supabase, currentUser?.id, followedIds);

      // Score and sort
      const scored = regularFormatted
        .filter((p) => !seenPostIds.current.has(p.id))
        .map((p) => scorePost(p, followedIds))
        .sort((a, b) => (b._score || 0) - (a._score || 0));

      // Mark seen
      scored.forEach((p) => seenPostIds.current.add(p.id));

      // Inject custom brand posts periodically
      const withCustom = injectCustomBrandPosts(scored);

      if (isInitial) {
        setPosts(withCustom);
      } else {
        setPosts((prev) => [...prev, ...withCustom]);
      }

      setOffset(currentOffset + BATCH_SIZE);
      setHasMore((regularData || []).length >= BATCH_SIZE);
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentUser?.id, offset, loadingMore, hasMore]);

  // Initial load
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      loadPosts(true);
    }
  }, [currentUser?.id]);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore && hasMore) {
          loadPosts(false);
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, loadPosts]);

  const toggleLike = async (postId: string) => {
    if (!currentUser?.id) return;
    if (likingInFlight.current.has(postId)) return;
    likingInFlight.current.add(postId);

    const supabase = createClient();
    const post = posts.find((p) => p.id === postId);
    if (!post) { likingInFlight.current.delete(postId); return; }

    const wasLiked = post.isLiked;

    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, isLiked: !wasLiked, likes: Math.max(0, wasLiked ? p.likes - 1 : p.likes + 1) } : p));

    try {
      if (wasLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUser!.id);
      } else {
        await supabase.from("post_likes").insert({ post_id: postId, user_id: currentUser!.id });
      }
    } catch (error) {
      setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, isLiked: wasLiked, likes: Math.max(0, wasLiked ? p.likes + 1 : p.likes - 1) } : p));
      console.error("Error toggling like:", error);
    } finally {
      likingInFlight.current.delete(postId);
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return diffMins + "m ago";
    if (diffHours < 24) return diffHours + "h ago";
    if (diffDays < 7) return diffDays + "d ago";
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 pb-20 lg:pb-0">
        <Loader2 className="w-6 h-6 text-[#5f8fff] animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 lg:pb-12">
      <div className="mb-8 hidden lg:block">
        <p className="relay-eyebrow text-[#5f8fff]">YOUR FEED</p>
        <h1 className="relay-title">Discover</h1>
      </div>

      {posts.length > 0 ? (
        <div className="space-y-5">
          {posts.map((post) => (
            <div key={post.id} className="relay-card p-4 sm:p-5 hover:bg-white/[0.06] transition-colors relative overflow-visible border-b border-white/[0.04] lg:border-b-0">
              {/* Like Badge */}
              <button
                onClick={() => toggleLike(post.id)}
                className={`absolute -top-3 -right-3 sm:-top-4 sm:-right-4 z-10 flex flex-col items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-xl backdrop-blur-md border-2 transition-all duration-200 cursor-pointer group ${
                  post.isLiked
                    ? "bg-relay-accent/20 border-relay-accent/50 text-relay-accent shadow-relay-accent/25"
                    : "bg-relay-bg/90 border-white/15 text-white/50 hover:text-relay-accent hover:border-relay-accent/40 hover:shadow-relay-accent/15"
                }`}
              >
                <Heart size={18} className={`sm:w-[22px] sm:h-[22px] transition-transform duration-200 group-hover:scale-125 ${post.isLiked ? "fill-relay-accent" : ""}`} />
                <span className="text-xs sm:text-sm font-bold mt-0.5 leading-none">{post.likes}</span>
              </button>

              {/* Post header */}
              <div className="flex items-center gap-2.5 lg:gap-3 mb-3 lg:mb-4">
                <Link href={"/profile/" + post.sellerUsername.replace("@", "")}>
                  <img src={post.sellerAvatar} alt={post.sellerName} className="w-8 h-8 lg:w-10 lg:h-10 rounded-full border border-white/10 hover:opacity-80 transition-opacity" />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
                    <Link href={"/profile/" + post.sellerUsername.replace("@", "")} className="hover:underline">
                      <h3 className="text-sm lg:text-base font-semibold text-relay-text">{post.sellerName}</h3>
                    </Link>
                    {post._isFollowed && (
                      <span className="text-[10px] font-semibold text-[#5f8fff]/70 uppercase tracking-wider">Following</span>
                    )}
                    {post.isCustomBrand && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30">
                        <Star size={11} className="text-purple-400 fill-purple-400" />
                        <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Own Brand</span>
                      </span>
                    )}
                    {post.isRisingBrand && !post.isCustomBrand && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-relay-accent/10 border border-relay-accent/20">
                        <TrendingUp size={12} className="text-relay-accent" />
                        <span className="text-xs font-medium text-relay-accent">Rising</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-relay-muted">{post.sellerUsername}</p>
                    <span className="text-white/20">·</span>
                    <p className="text-sm text-relay-subtle">{formatTimeAgo(post.timeAgo)}</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <p className="text-relay-text mb-4 leading-relaxed">{post.content}</p>

              {/* Images */}
              {post.images.length > 0 && (
                <div className="mb-4 -mx-4 sm:mx-0">
                  {post.images.length === 1 ? (
                    <div className="w-full aspect-video rounded-none sm:rounded-xl overflow-hidden border border-white/5">
                      <img src={post.images[0]} alt="Post" className="w-full h-full object-cover" />
                    </div>
                  ) : post.images.length === 2 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {post.images.map((img, idx) => (
                        <div key={idx} className="aspect-square rounded-lg sm:rounded-xl overflow-hidden border border-white/5">
                          <img src={img} alt={"Post " + (idx + 1)} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {post.images.map((img, idx) => (
                        <div key={idx} className="aspect-square rounded-lg sm:rounded-xl overflow-hidden border border-white/5">
                          <img src={img} alt={"Post " + (idx + 1)} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Linked listing */}
              {post.relatedListing && !onboardingActive && (
                <Link href={"/listing/" + post.relatedListing.id} className="block mb-4 p-2.5 lg:p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-3 lg:gap-4">
                    {post.relatedListing.image && (
                      <div className="w-10 h-10 lg:w-16 lg:h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                        <img src={post.relatedListing.image} alt={post.relatedListing.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-relay-subtle uppercase tracking-wide hidden lg:block">Linked Listing</p>
                      <h4 className="text-sm font-semibold text-relay-text lg:mt-0.5 truncate">{post.relatedListing.name}</h4>
                      <p className="text-sm font-bold text-relay-accent lg:mt-1">{"$" + post.relatedListing.price}</p>
                    </div>
                    <span className="px-3 py-2 sm:py-1.5 rounded-lg bg-relay-accent text-relay-bg text-xs font-semibold whitespace-nowrap flex-shrink-0 hidden lg:inline">View</span>
                  </div>
                </Link>
              )}
            </div>
          ))}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-px" />

          {loadingMore && (
            <div className="flex items-center justify-center py-8 pb-20 lg:pb-0">
              <Loader2 className="w-5 h-5 text-[#5f8fff] animate-spin" />
            </div>
          )}

          {!hasMore && posts.length > 0 && (
            <p className="text-center text-white/30 text-sm py-8 pb-20 lg:pb-8">You&apos;re all caught up</p>
          )}
        </div>
      ) : (
        <div className="relay-empty text-center py-12">
          {onboardingActive ? (
            <div>
              <p className="text-white/50 text-lg mb-2 font-semibold">The marketplace is getting ready</p>
              <p className="text-white/35 text-sm max-w-md mx-auto leading-relaxed">
                Buyers haven&apos;t arrived yet. Now is the perfect time to make posts,
                showcase your inventory, and build your presence so you&apos;re ready when the doors open.
              </p>
            </div>
          ) : (
            <div>
              <p className="text-white/40 text-lg mb-2">No posts yet</p>
              <p className="text-white/30 text-sm">Follow sellers to see their updates here</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
