"use client";

import { useState, useEffect } from "react";
import { Pagination } from "@/components/layout/Pagination";
import { Heart, MessageCircle, Share2, Sparkles, TrendingUp, BadgeCheck } from "lucide-react";
import { createClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";

interface FeedPost {
  id: string;
  sellerName: string;
  sellerUsername: string;
  sellerAvatar: string;
  isRisingBrand: boolean;
  content: string;
  images: string[];
  likes: number;
  isLiked: boolean;
  comments: number;
  timeAgo: string;
  relatedShoe?: {
    name: string;
    brand: string;
    price: number;
  };
}

const FILTER_TABS = ["For You", "Following", "Rising Brands"];
const ITEMS_PER_PAGE = 5;

export default function FeedPage() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState("For You");
  const [currentPage, setCurrentPage] = useState(1);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      const supabase = createClient();
      setLoading(true);

      try {
        // Build query based on active tab
        let query = supabase
          .from("posts")
          .select("*, seller:profiles(id, full_name, username, avatar_url)");

        // Apply filters based on tab
        if (activeTab === "Rising Brands") {
          query = query.eq("is_rising_brand", true);
        }
        // TODO: implement "Following" filter when following system is set up

        const { data } = await query
          .order("created_at", { ascending: false })
          .range(
            (currentPage - 1) * ITEMS_PER_PAGE,
            currentPage * ITEMS_PER_PAGE - 1
          );

        if (data) {
          // Fetch likes for current user
          const postsWithLikes = await Promise.all(
            data.map(async (post: any) => {
              let isLiked = false;
              if (currentUser?.id) {
                const { data: likeData } = await supabase
                  .from("post_likes")
                  .select("id")
                  .eq("post_id", post.id)
                  .eq("user_id", currentUser!.id)
                  .single();
                isLiked = !!likeData;
              }

              return {
                id: post.id,
                sellerName: post.seller?.full_name || "Unknown",
                sellerUsername: post.seller?.username
                  ? `@${post.seller.username}`
                  : "@unknown",
                sellerAvatar:
                  post.seller?.avatar_url ||
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
                isRisingBrand: post.is_rising_brand || false,
                content: post.content,
                images: post.images || [],
                likes: post.likes_count || 0,
                isLiked,
                comments: post.comments_count || 0,
                timeAgo: new Date(post.created_at).toLocaleDateString(),
                relatedShoe: post.related_listing ? {
                  name: post.related_listing.model,
                  brand: post.related_listing.brand,
                  price: post.related_listing.prices?.[0] || 0,
                } : undefined,
              };
            })
          );

          setPosts(postsWithLikes);
        }
      } catch (error) {
        console.error("Error fetching posts:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPosts();
  }, [activeTab, currentPage, currentUser?.id]);

  const paginatedPosts = posts;
  const totalPages = Math.ceil(posts.length / ITEMS_PER_PAGE) || 1;

  const toggleLike = async (postId: string) => {
    if (!currentUser?.id) return;

    const supabase = createClient();
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    try {
      if (post.isLiked) {
        // Unlike
        await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId)
          .eq("user_id", currentUser!.id);
      } else {
        // Like
        await supabase.from("post_likes").insert({
          post_id: postId,
          user_id: currentUser!.id,
        });
      }

      // Update local state
      setPosts(
        posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                isLiked: !p.isLiked,
                likes: p.isLiked ? p.likes - 1 : p.likes + 1,
              }
            : p
        )
      );
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  if (loading) {
    return (
      <div className="relay-empty text-center">Loading...</div>
    );
  }

  return (
    <div>
        {/* Page Header */}
        <div className="mb-8">
          <div className="relay-eyebrow text-relay-accent flex items-center gap-2">
            <Sparkles size={16} />
            YOUR FEED
          </div>
          <h1 className="relay-title text-relay-text mt-2">Discover</h1>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-3 mb-8 overflow-x-auto pb-2">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-full whitespace-nowrap font-medium transition-all duration-200 flex-shrink-0 ${
                activeTab === tab
                  ? "bg-relay-accent text-relay-bg"
                  : "bg-white/[0.04] text-relay-text border border-white/10 hover:bg-white/[0.08]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Feed Posts */}
        {paginatedPosts.length > 0 ? (
          <div className="space-y-5">
            {paginatedPosts.map((post) => (
            <div
              key={post.id}
              className="relay-card p-5 hover:bg-white/[0.06] transition-colors"
            >
              {/* Post Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <img
                    src={post.sellerAvatar}
                    alt={post.sellerName}
                    className="w-10 h-10 rounded-full border border-white/10"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-relay-text">
                        {post.sellerName}
                      </h3>
                      {post.isRisingBrand && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-relay-accent/10 border border-relay-accent/20">
                          <TrendingUp size={12} className="text-relay-accent" />
                          <span className="text-xs font-medium text-relay-accent">
                            Rising Brand
                          </span>
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-relay-muted">{post.sellerUsername}</p>
                  </div>
                </div>
                <p className="text-sm text-relay-subtle">{post.timeAgo}</p>
              </div>

              {/* Post Content */}
              <p className="text-relay-text mb-4 leading-relaxed">{post.content}</p>

              {/* Post Images */}
              {post.images.length > 0 && (
                <div className="mb-4">
                  {post.images.length === 1 ? (
                    // Single image - full width
                    <div className="w-full aspect-video rounded-xl bg-gradient-to-br from-relay-accent/20 to-purple-500/20 border border-white/5"></div>
                  ) : post.images.length === 2 ? (
                    // Two images - side by side
                    <div className="grid grid-cols-2 gap-3">
                      {post.images.map((_, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-xl bg-gradient-to-br from-relay-accent/20 to-purple-500/20 border border-white/5"
                        ></div>
                      ))}
                    </div>
                  ) : (
                    // Three or more - grid layout
                    <div className="grid grid-cols-3 gap-2">
                      {post.images.map((_, idx) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-xl bg-gradient-to-br from-relay-accent/20 to-purple-500/20 border border-white/5"
                        ></div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Related Shoe Card */}
              {post.relatedShoe && (
                <div className="mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-relay-subtle uppercase tracking-wide">
                        Related Listing
                      </p>
                      <h4 className="text-sm font-semibold text-relay-text mt-1">
                        {post.relatedShoe.name}
                      </h4>
                      <p className="text-xs text-relay-muted mt-1">
                        {post.relatedShoe.brand}
                      </p>
                      <p className="text-sm font-bold text-relay-accent mt-2">
                        ${post.relatedShoe.price}
                      </p>
                    </div>
                    <a
                      href="#"
                      className="px-3 py-1.5 rounded-lg bg-relay-accent text-relay-bg text-xs font-semibold hover:bg-relay-accent/90 transition-colors whitespace-nowrap"
                    >
                      View
                    </a>
                  </div>
                </div>
              )}

              {/* Post Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <button
                  onClick={() => toggleLike(post.id)}
                  className="flex items-center gap-2 text-relay-subtle hover:text-relay-accent transition-colors group"
                >
                  <div className="p-2 rounded-lg group-hover:bg-relay-accent/10 transition-colors">
                    <Heart
                      size={18}
                      className={post.isLiked ? "fill-relay-accent" : ""}
                      color={post.isLiked ? "#7ca6ff" : "currentColor"}
                    />
                  </div>
                  <span className="text-sm font-medium">{post.likes}</span>
                </button>

                <a
                  href="#"
                  className="flex items-center gap-2 text-relay-subtle hover:text-relay-accent transition-colors group"
                >
                  <div className="p-2 rounded-lg group-hover:bg-relay-accent/10 transition-colors">
                    <MessageCircle size={18} />
                  </div>
                  <span className="text-sm font-medium">{post.comments}</span>
                </a>

                <a
                  href="#"
                  className="flex items-center gap-2 text-relay-subtle hover:text-relay-accent transition-colors group"
                >
                  <div className="p-2 rounded-lg group-hover:bg-relay-accent/10 transition-colors">
                    <Share2 size={18} />
                  </div>
                </a>
              </div>
            </div>
          ))}
          </div>
        ) : (
          <div className="relay-empty text-center py-12">
            <p>No posts yet. Follow sellers to see their updates.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
  );
}
