"use client";

import { useState, useEffect, useRef } from "react";
import { Pagination } from "@/components/layout/Pagination";
import { Heart, Sparkles, TrendingUp, Star } from "lucide-react";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";
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

const FILTER_TABS = ["For You", "Following", "Rising Brands"];
const ITEMS_PER_PAGE = 10;
const CUSTOM_BRAND_INTERVAL = 5;

export default function FeedPage() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("For You");
  const [currentPage, setCurrentPage] = useState(1);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const likingInFlight = useRef(new Set<string>());

  useEffect(() => {
    async function fetchPosts() {
      const supabase = createClient();
      setLoading(true);

      try {
        let followedIds: string[] = [];
        if (currentUser?.id) {
          const { data: followsData } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", currentUser.id);
          followedIds = (followsData || []).map((f: any) => f.following_id);
        }

        if (activeTab === "Following") {
          if (followedIds.length === 0) {
            setPosts([]);
            setTotalCount(0);
            setLoading(false);
            return;
          }
          const { data, count } = await supabase
            .from("posts")
            .select("*, seller:profiles(id, full_name, username, avatar_url, display_name), listing:listings(id, brand, model, nickname, images, sizes)", { count: "exact" })
            .in("seller_id", followedIds)
            .order("created_at", { ascending: false })
            .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);
          const formatted = await formatPosts(data || [], supabase, currentUser?.id, followedIds);
          setPosts(formatted);
          setTotalCount(count || 0);
        } else if (activeTab === "Rising Brands") {
          const { data, count } = await supabase
            .from("posts")
            .select("*, seller:profiles(id, full_name, username, avatar_url, display_name), listing:listings(id, brand, model, nickname, images, sizes)", { count: "exact" })
            .eq("is_rising_brand", true)
            .order("created_at", { ascending: false })
            .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);
          const formatted = await formatPosts(data || [], supabase, currentUser?.id, followedIds);
          setPosts(formatted);
          setTotalCount(count || 0);
        } else {
          const fetchLimit = 50;
          const { data: regularData } = await supabase
            .from("posts")
            .select("*, seller:profiles(id, full_name, username, avatar_url, display_name), listing:listings(id, brand, model, nickname, images, sizes)")
            .eq("is_custom_brand", false)
            .order("created_at", { ascending: false })
            .limit(fetchLimit);
          const { data: customBrandData } = await supabase
            .from("posts")
            .select("*, seller:profiles(id, full_name, username, avatar_url, display_name), listing:listings(id, brand, model, nickname, images, sizes)")
            .eq("is_custom_brand", true)
            .order("created_at", { ascending: false })
            .limit(20);
          let regularFormatted = await formatPosts(regularData || [], supabase, currentUser?.id, followedIds);
          regularFormatted = scoreAndSort(regularFormatted, followedIds);
          let customFormatted = await formatPosts(customBrandData || [], supabase, currentUser?.id, followedIds);
          customFormatted = customFormatted.sort(() => Math.random() - 0.5);
          const merged = injectCustomBrandPosts(regularFormatted, customFormatted);
          const start = (currentPage - 1) * ITEMS_PER_PAGE;
          const paged = merged.slice(start, start + ITEMS_PER_PAGE);
          setPosts(paged);
          setTotalCount(merged.length);
        }
      } catch (error) {
        console.error("Error fetching posts:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchPosts();
  }, [activeTab, currentPage, currentUser?.id]);

  function scoreAndSort(posts: FeedPost[], followedIds: string[]): FeedPost[] {
    return posts.map((post) => {
      let score = 0;
      const ageHours = (Date.now() - new Date(post.timeAgo).getTime()) / (1000 * 60 * 60);
      score += Math.max(0, 100 - ageHours * 0.5);
      if (followedIds.includes(post.seller_id)) { score += 200; post._isFollowed = true; }
      if (post.likes >= 100) { score += 300; }
      else if (post.likes >= 50) { score += 180; }
      else if (post.likes >= 20) { score += 80; }
      else if (post.likes >= 10) { score += 40; }
      else { score += post.likes * 3; }
      post._score = score;
      return post;
    }).sort((a, b) => (b._score || 0) - (a._score || 0));
  }

  function injectCustomBrandPosts(regular: FeedPost[], custom: FeedPost[]): FeedPost[] {
    if (custom.length === 0) return regular;
    const result: FeedPost[] = [];
    let customIndex = 0;
    for (let i = 0; i < regular.length; i++) {
      result.push(regular[i]);
      if ((i + 1) % CUSTOM_BRAND_INTERVAL === 0 && customIndex < custom.length) {
        const cp = custom[customIndex];
        if (!result.find((p) => p.id === cp.id)) { result.push(cp); }
        customIndex++;
      }
    }
    return result;
  }

  async function formatPosts(data: any[], supabase: any, userId: string | undefined, followedIds: string[]): Promise<FeedPost[]> {
    let likedPostIds = new Set<string>();
    if (userId && data.length > 0) {
      const postIds = data.map((p: any) => p.id);
      const { data: likesData } = await supabase.from("post_likes").select("post_id").eq("user_id", userId).in("post_id", postIds);
      likedPostIds = new Set((likesData || []).map((l: any) => l.post_id));
    }
    return data.map((post: any) => {
      const listing = post.listing;
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
        relatedListing: listing ? { id: listing.id, name: listing.brand + " " + listing.model, brand: listing.brand, price: lowestPrice, image: listing.images?.[0] || undefined } : undefined,
      };
    });
  }

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE) || 1;

  const toggleLike = async (postId: string) => {
    if (!currentUser?.id) return;
    // Prevent rapid double-clicks — ignore if this post is already being toggled
    if (likingInFlight.current.has(postId)) return;
    likingInFlight.current.add(postId);

    const supabase = createClient();
    const post = posts.find((p) => p.id === postId);
    if (!post) { likingInFlight.current.delete(postId); return; }

    const wasLiked = post.isLiked;

    // Optimistic update (clamp to 0 minimum)
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, isLiked: !wasLiked, likes: Math.max(0, wasLiked ? p.likes - 1 : p.likes + 1) } : p));

    try {
      if (wasLiked) {
        await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", currentUser!.id);
      } else {
        await supabase.from("post_likes").insert({ post_id: postId, user_id: currentUser!.id });
      }
      // Re-fetch actual count from DB to reconcile
      const { data: postData } = await supabase.from("posts").select("likes_count").eq("id", postId).single();
      if (postData) {
        setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, likes: postData.likes_count } : p));
      }
    } catch (error) {
      // Revert optimistic update on failure
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
    return <div className="relay-empty text-center">Loading...</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <div className="relay-eyebrow text-relay-accent flex items-center gap-2">
          <Sparkles size={16} />
          YOUR FEED
        </div>
        <h1 className="relay-title text-relay-text mt-2">Discover</h1>
      </div>

      <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-full whitespace-nowrap font-medium transition-all duration-200 flex-shrink-0 ${activeTab === tab ? "bg-relay-accent text-relay-bg" : "bg-white/[0.04] text-relay-text border border-white/10 hover:bg-white/[0.08]"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {posts.length > 0 ? (
        <div className="space-y-5">
          {posts.map((post) => (
            <div key={post.id} className="relay-card p-5 hover:bg-white/[0.06] transition-colors relative overflow-visible">
              {/* Like Badge — floats top-right corner */}
              <button
                onClick={() => toggleLike(post.id)}
                className={`absolute -top-4 -right-4 z-10 flex flex-col items-center justify-center w-16 h-16 rounded-2xl shadow-xl backdrop-blur-md border-2 transition-all duration-200 cursor-pointer group ${
                  post.isLiked
                    ? "bg-relay-accent/20 border-relay-accent/50 text-relay-accent shadow-relay-accent/25"
                    : "bg-relay-bg/90 border-white/15 text-white/50 hover:text-relay-accent hover:border-relay-accent/40 hover:shadow-relay-accent/15"
                }`}
              >
                <Heart size={22} className={`transition-transform duration-200 group-hover:scale-125 ${post.isLiked ? "fill-relay-accent" : ""}`} />
                <span className="text-sm font-bold mt-0.5 leading-none">{post.likes}</span>
              </button>

              <div className="flex items-center gap-3 mb-4">
                <Link href={"/profile/" + post.sellerUsername.replace("@", "")}>
                  <img src={post.sellerAvatar} alt={post.sellerName} className="w-10 h-10 rounded-full border border-white/10 hover:opacity-80 transition-opacity" />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={"/profile/" + post.sellerUsername.replace("@", "")} className="hover:underline">
                      <h3 className="font-semibold text-relay-text">{post.sellerName}</h3>
                    </Link>
                    {post.isCustomBrand && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30">
                        <Star size={11} className="text-purple-400 fill-purple-400" />
                        <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Own Brand</span>
                      </span>
                    )}
                    {post.isRisingBrand && !post.isCustomBrand && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-relay-accent/10 border border-relay-accent/20">
                        <TrendingUp size={12} className="text-relay-accent" />
                        <span className="text-xs font-medium text-relay-accent">Rising Brand</span>
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

              <p className="text-relay-text mb-4 leading-relaxed">{post.content}</p>

              {post.images.length > 0 && (
                <div className="mb-4">
                  {post.images.length === 1 ? (
                    <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/5">
                      <img src={post.images[0]} alt="Post" className="w-full h-full object-cover" />
                    </div>
                  ) : post.images.length === 2 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {post.images.map((img, idx) => (
                        <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-white/5">
                          <img src={img} alt={"Post " + (idx + 1)} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {post.images.map((img, idx) => (
                        <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-white/5">
                          <img src={img} alt={"Post " + (idx + 1)} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {post.relatedListing && (
                <Link href={"/listing/" + post.relatedListing.id} className="block mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] transition-colors">
                  <div className="flex items-center gap-4">
                    {post.relatedListing.image && (
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                        <img src={post.relatedListing.image} alt={post.relatedListing.name} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-relay-subtle uppercase tracking-wide">Linked Listing</p>
                      <h4 className="text-sm font-semibold text-relay-text mt-0.5 truncate">{post.relatedListing.name}</h4>
                      <p className="text-sm font-bold text-relay-accent mt-1">{"$" + post.relatedListing.price}</p>
                    </div>
                    <span className="px-3 py-1.5 rounded-lg bg-relay-accent text-relay-bg text-xs font-semibold whitespace-nowrap flex-shrink-0">View</span>
                  </div>
                </Link>
              )}

            </div>
          ))}
        </div>
      ) : (
        <div className="relay-empty text-center py-12">
          {activeTab === "Following" ? (
            <div>
              <p className="text-white/40 text-lg mb-2">No posts from people you follow yet</p>
              <p className="text-white/30 text-sm">Follow sellers to see their updates here</p>
            </div>
          ) : (
            <p className="text-white/40">No posts yet. Follow sellers to see their updates.</p>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      )}
    </div>
  );
}
