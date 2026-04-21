'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import useAuth from '@/hooks/useAuth';
import { Star, MessageCircle, Share2, TrendingUp } from 'lucide-react';
import Link from 'next/link';

interface Tab {
  id: string;
  label: string;
}

const TABS: Tab[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'posts', label: 'Posts' },
  { id: 'reviews', label: 'Reviews' },
];

interface SellerProfile {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_url?: string;
  profile_banner_url?: string;
  is_verified_seller?: boolean;
  profile_theme?: string;
}

interface ThemeColors {
  accent: string;
  accentLight: string;
  cardBg: string;
  cardBorder: string;
  bannerGradient: string;
  textHighlight: string;
}

const THEME_MAP: Record<string, ThemeColors> = {
  blue: { accent: '#5f8fff', accentLight: '#7ca6ff', cardBg: 'rgba(95, 143, 255, 0.04)', cardBorder: 'rgba(95, 143, 255, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(95, 143, 255, 0.15) 0%, rgba(124, 166, 255, 0.05) 100%)', textHighlight: '#7ca6ff' },
  emerald: { accent: '#34d399', accentLight: '#6ee7b7', cardBg: 'rgba(52, 211, 153, 0.04)', cardBorder: 'rgba(52, 211, 153, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)', textHighlight: '#6ee7b7' },
  purple: { accent: '#a78bfa', accentLight: '#c4b5fd', cardBg: 'rgba(167, 139, 250, 0.04)', cardBorder: 'rgba(167, 139, 250, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)', textHighlight: '#c4b5fd' },
  rose: { accent: '#fb7185', accentLight: '#fda4af', cardBg: 'rgba(251, 113, 133, 0.04)', cardBorder: 'rgba(251, 113, 133, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(251, 113, 133, 0.15) 0%, rgba(244, 63, 94, 0.05) 100%)', textHighlight: '#fda4af' },
  amber: { accent: '#fbbf24', accentLight: '#fcd34d', cardBg: 'rgba(251, 191, 36, 0.04)', cardBorder: 'rgba(251, 191, 36, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)', textHighlight: '#fcd34d' },
  cyan: { accent: '#22d3ee', accentLight: '#67e8f9', cardBg: 'rgba(34, 211, 238, 0.04)', cardBorder: 'rgba(34, 211, 238, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(6, 182, 212, 0.05) 100%)', textHighlight: '#67e8f9' },
  sunset: { accent: '#f97316', accentLight: '#fb923c', cardBg: 'rgba(249, 115, 22, 0.04)', cardBorder: 'rgba(249, 115, 22, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.08) 50%, rgba(251, 113, 133, 0.05) 100%)', textHighlight: '#fb923c' },
  midnight: { accent: '#818cf8', accentLight: '#a5b4fc', cardBg: 'rgba(129, 140, 248, 0.04)', cardBorder: 'rgba(129, 140, 248, 0.12)', bannerGradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(67, 56, 202, 0.08) 100%)', textHighlight: '#a5b4fc' },
};

interface Listing {
  id: string;
  brand: string;
  model: string;
  images?: string[];
  sizes: any[];
}

interface Post {
  id: string;
  content: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
}

interface Review {
  id: string;
  rating: number;
  comment: string;
  created_at: string;
  profiles: {
    username: string;
  };
  orders: {
    listings: {
      brand: string;
      model: string;
    };
  };
}

export default function SellerProfilePage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('inventory');
  const [loading, setLoading] = useState(true);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState('0');
  const [totalSales, setTotalSales] = useState(0);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();

      // Fetch seller profile — try by username first, then by id as fallback
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.username);

      let profileData = null;

      if (isUuid) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', params.username)
          .single();
        profileData = data;
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('username', params.username)
          .single();
        profileData = data;
      }

      if (!profileData) {
        setLoading(false);
        return;
      }

      setProfile(profileData);

      // Fetch active listings
      const { data: listingsData } = await supabase
        .from('listings')
        .select('*')
        .eq('seller_id', profileData.id)
        .eq('status', 'active');

      setListings(listingsData || []);

      // Fetch posts
      const { data: postsData } = await supabase
        .from('posts')
        .select('*')
        .eq('seller_id', profileData.id)
        .order('created_at', { ascending: false });

      setPosts(postsData || []);

      // Fetch reviews with profile and order/listing info
      const { data: reviewsData } = await supabase
        .from('reviews')
        .select(`
          *,
          profiles (username),
          orders (listings (*))
        `)
        .eq('seller_id', profileData.id);

      setReviews(reviewsData || []);

      if (reviewsData && reviewsData.length > 0) {
        const avg = (
          reviewsData.reduce((sum: number, review: Review) => sum + review.rating, 0) / reviewsData.length
        ).toFixed(1);
        setAverageRating(avg);
      }

      // Calculate total sales from completed orders
      const { data: salesData, count } = await supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('seller_id', profileData.id)
        .eq('status', 'completed');

      setTotalSales(count || 0);

      setLoading(false);
    }

    loadData();
  }, [params.username]);

  const handleMessage = async () => {
    if (!currentUser?.id || !profile?.id) {
      router.push('/login');
      return;
    }

    if (currentUser!.id === profile.id) {
      alert("You can't message yourself!");
      return;
    }

    setMessagingLoading(true);
    try {
      const supabase = createClient();

      // Check for existing conversation
      const { data: existingConvos } = await supabase
        .from('conversations')
        .select('*')
        .contains('participant_ids', [currentUser!.id, profile.id]);

      if (existingConvos && existingConvos.length > 0) {
        router.push('/messages');
        return;
      }

      // Create new conversation
      const { error } = await supabase
        .from('conversations')
        .insert({
          participant_ids: [currentUser!.id, profile.id],
          listing_id: null,
          last_message: null,
          last_message_at: new Date().toISOString(),
        });

      if (error) throw error;

      router.push('/messages');
    } catch (error) {
      console.error('Error creating conversation:', error);
      alert('Failed to start conversation. Please try again.');
    } finally {
      setMessagingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center text-white/40 py-12">Loading...</div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center text-white/40 py-12">Profile not found</div>
    );
  }

  const theme = THEME_MAP[profile.profile_theme || 'blue'] || THEME_MAP.blue;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div>
      {/* Banner */}
      <div
        className="h-56 w-full bg-cover bg-center relative"
        style={{
          backgroundImage: profile.profile_banner_url
            ? `url(${profile.profile_banner_url})`
            : theme.bannerGradient,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 opacity-10" style={{ background: `linear-gradient(to right, transparent, ${theme.accent}, transparent)` }} />
      </div>

      {/* Profile Info Section */}
      <div className="px-4 md:px-8 pb-12">
        {/* Profile Header */}
        <div className="relative -mt-16 mb-12">
          {/* Avatar */}
          <div className="h-28 w-28 rounded-full border-4 flex-shrink-0 flex items-center justify-center overflow-hidden mb-4" style={{ borderColor: theme.accent, background: `linear-gradient(135deg, ${theme.accentLight}, ${theme.accent})` }}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-relay-bg">{getInitials(profile.display_name)}</span>
            )}
          </div>

          {/* Info — below avatar */}
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{profile.display_name}</h1>
              {profile.is_verified_seller && (
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${theme.accent}20`, borderColor: `${theme.accent}40`, color: theme.accent, border: `1px solid ${theme.cardBorder}` }}>
                  ✓ Verified
                </span>
              )}
            </div>
            <p className="text-white/50 text-sm">@{profile.username}</p>
            {profile.bio && (
              <p className="text-relay-text mt-3 max-w-2xl">{profile.bio}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleMessage}
              disabled={messagingLoading}
              className="flex items-center gap-2 px-4 py-2 text-relay-bg font-semibold rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: theme.accent }}
            >
              <MessageCircle size={18} />
              {messagingLoading ? 'Opening...' : 'Message'}
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] backdrop-blur-xl border border-white/10 hover:bg-white/[0.08] rounded-lg transition-colors">
              <Share2 size={18} />
              Share
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <div className="backdrop-blur-xl rounded-[1.5rem] p-6 transition-colors" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
            <p className="text-white/60 text-sm mb-2">Total Sales</p>
            <p className="text-3xl font-bold" style={{ color: theme.accent }}>{totalSales}</p>
          </div>
          <div className="backdrop-blur-xl rounded-[1.5rem] p-6 transition-colors" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
            <p className="text-white/60 text-sm mb-2">Rating</p>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold" style={{ color: theme.accent }}>{averageRating}</span>
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    style={i < Math.round(parseFloat(averageRating)) ? { fill: theme.accent, color: theme.accent } : undefined}
                    className={i >= Math.round(parseFloat(averageRating)) ? 'text-white/20' : ''}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="backdrop-blur-xl rounded-[1.5rem] p-6 transition-colors" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
            <p className="text-white/60 text-sm mb-2">Active Listings</p>
            <p className="text-3xl font-bold" style={{ color: theme.accent }}>{listings.length}</p>
          </div>
          <div className="backdrop-blur-xl rounded-[1.5rem] p-6 transition-colors" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
            <p className="text-white/60 text-sm mb-2">Inventory Worth</p>
            <p className="text-3xl font-bold" style={{ color: theme.accent }}>
              ${(listings.reduce((sum, l) => sum + (l.sizes?.[0]?.price || 0), 0) / 1000).toFixed(1)}K
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-white/10 mb-8">
          <div className="flex gap-8">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-2 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? ''
                    : 'text-white/60 border-transparent hover:text-relay-text'
                }`}
                style={activeTab === tab.id ? { color: theme.accent, borderColor: theme.accent } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'inventory' && (
          <div>
            {listings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((listing) => (
                  <Link
                    key={listing.id}
                    href={`/listing/${listing.id}`}
                    className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] overflow-hidden hover:bg-white/[0.08] transition-colors group cursor-pointer block"
                  >
                    <div className="h-48 w-full relative overflow-hidden">
                      {listing.images?.[0] ? (
                        <img
                          src={listing.images[0]}
                          alt={`${listing.brand} ${listing.model}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full"
                          style={{
                            background: 'linear-gradient(135deg, #2d2d3d 0%, #3d3d4d 100%)',
                          }}
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-relay-bg/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <span className="w-full text-relay-bg font-semibold py-2 rounded-lg transition-colors text-center block" style={{ backgroundColor: theme.accent }}>
                          View Details
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-relay-text mb-2 line-clamp-2">
                        {listing.brand} {listing.model}
                      </h3>
                      <div className="flex items-baseline justify-between">
                        <p className="text-2xl font-bold" style={{ color: theme.accent }}>
                          ${listing.sizes?.[0]?.price || 0}
                        </p>
                        <p className="text-xs text-white/50">
                          {listing.sizes?.length || 0} size{listing.sizes?.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="relay-empty text-center p-12">
                <p className="text-white/40 text-lg">No active listings</p>
              </div>
            )}
            <div className="flex justify-center gap-2 mt-12">
              <button className="px-3 py-2 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
                1
              </button>
              <button className="px-3 py-2 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
                2
              </button>
              <button className="px-3 py-2 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
                3
              </button>
            </div>
          </div>
        )}

        {activeTab === 'posts' && (
          <div>
            {posts.length > 0 ? (
              <div className="space-y-6">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-6 hover:bg-white/[0.08] transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-relay-accent-light to-relay-accent flex-shrink-0 flex items-center justify-center">
                        <span className="text-lg font-bold text-relay-bg">{getInitials(profile.display_name)}</span>
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <h4 className="font-semibold">{profile.display_name}</h4>
                            <p className="text-xs text-white/50">
                              @{profile.username} • {new Date(post.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <p className="text-relay-text mb-4">{post.content}</p>
                        <div className="flex gap-6 text-sm text-white/50">
                          <button className="flex items-center gap-2 hover:text-relay-accent transition-colors">
                            <Star size={16} /> {post.likes_count}
                          </button>
                          <button className="flex items-center gap-2 hover:text-relay-accent transition-colors">
                            <MessageCircle size={16} /> {post.comments_count}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="relay-empty text-center p-12">
                <p className="text-white/40 text-lg">No posts yet</p>
              </div>
            )}
            <div className="flex justify-center gap-2 mt-12">
              <button className="px-3 py-2 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
                1
              </button>
              <button className="px-3 py-2 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
                2
              </button>
            </div>
          </div>
        )}

        {activeTab === 'reviews' && (
          <div>
            {reviews.length > 0 ? (
              <>
                <div className="mb-8 p-6 backdrop-blur-xl rounded-[1.5rem]" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}>
                  <div className="flex items-center gap-4">
                    <div className="text-4xl font-bold" style={{ color: theme.accent }}>{averageRating}</div>
                    <div>
                      <div className="flex gap-1 mb-2">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={20}
                            className={
                              i < Math.round(parseFloat(averageRating))
                                ? 'fill-relay-accent text-relay-accent'
                                : 'text-white/20'
                            }
                          />
                        ))}
                      </div>
                      <p className="text-sm text-white/60">Based on {reviews.length} reviews</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {reviews.map((review) => {
                    const shoeModel = review.orders?.listings
                      ? `${review.orders.listings.brand} ${review.orders.listings.model}`
                      : 'Unknown Model';
                    return (
                      <div
                        key={review.id}
                        className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-6 hover:bg-white/[0.08] transition-colors"
                      >
                        <div className="flex items-start gap-4">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-relay-accent-light to-relay-accent flex-shrink-0 flex items-center justify-center text-xs font-bold text-relay-bg">
                            {review.profiles?.username?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <div className="flex-grow">
                            <div className="flex items-center justify-between mb-2">
                              <div>
                                <h4 className="font-semibold">{review.profiles?.username}</h4>
                                <p className="text-xs text-white/50">{new Date(review.created_at).toLocaleDateString()}</p>
                              </div>
                              <div className="flex gap-1">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    size={14}
                                    className={
                                      i < review.rating
                                        ? 'fill-relay-accent text-relay-accent'
                                        : 'text-white/20'
                                    }
                                  />
                                ))}
                              </div>
                            </div>
                            <p className="text-relay-text mb-2">{review.comment}</p>
                            <p className="text-xs text-relay-accent">Purchased: {shoeModel}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="relay-empty text-center p-12">
                <p className="text-white/40 text-lg">No reviews yet</p>
              </div>
            )}

            <div className="flex justify-center gap-2 mt-12">
              <button className="px-3 py-2 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
                1
              </button>
              <button className="px-3 py-2 border border-white/10 rounded-lg hover:bg-white/[0.04] transition-colors">
                2
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
