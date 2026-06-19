'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { dedupeSkuListings, formatSizeDisplay, getListingDisplayMetrics } from '@/lib/listing-display';
import {
  canBuyerMessageSeller,
  getBuyerMessagingUnavailableReason,
  getVacationModeNotice,
} from '@/lib/seller-availability';
import useAuth from '@/hooks/useAuth';
import { useOnboardingPhase } from '@/hooks/useOnboardingPhase';
import { Star, MessageCircle, TrendingUp, UserPlus, UserCheck, Heart, Instagram } from 'lucide-react';
import Link from 'next/link';
import FoundingSellerBadge from '@/components/founding/FoundingSellerBadge';

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
  full_name?: string;
  bio: string;
  avatar_url?: string;
  profile_banner_url?: string;
  is_verified_seller?: boolean;
  profile_theme?: string;
  followers_count?: number;
  sales_count?: number;
  avg_rating?: number;
  instagram_url?: string;
  is_founding_seller?: boolean;
  role?: string;
  customer_messaging_enabled?: boolean;
  vacation_mode_enabled?: boolean;
  offers_enabled?: boolean;
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
  seller_id?: string;
  listing_type?: 'manual' | 'sku';
  sku_normalized?: string | null;
  brand: string;
  model: string;
  nickname?: string | null;
  images?: string[];
  sizes: any[];
  listing_variants?: Array<{
    id: string;
    size: string;
    price: number;
    quantity: number;
    is_active: boolean;
  }>;
  created_at?: string;
  updated_at?: string;
}

interface InventoryCardListing extends Listing {
  availableSizes: number[];
  availableSizeLabels: string[];
  lowestPrice: number;
}

interface Post {
  id: string;
  content: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
  images?: string[];
  is_custom_brand?: boolean;
  related_listing?: {
    id: string;
    brand: string;
    model: string;
    images?: string[];
    sizes?: any[];
  };
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  profiles: { username: string };
  orders: { listings: { brand: string; model: string } };
}

export default function SellerProfilePage({ params }: { params: { username: string } }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { onboardingActive } = useOnboardingPhase();
  const [activeTab, setActiveTab] = useState<string>('inventory');
  const [loading, setLoading] = useState(true);
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [listings, setListings] = useState<InventoryCardListing[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [averageRating, setAverageRating] = useState('0');
  const [totalSales, setTotalSales] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const followInFlight = useRef(false);

  useEffect(() => {
    async function loadData() {
      const supabase = createClient();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.username);
      let profileData = null;
      if (isUuid) {
        const { data } = await supabase.from('profiles').select('*').eq('id', params.username).single();
        profileData = data;
      } else {
        const { data } = await supabase.from('profiles').select('*').eq('username', params.username).single();
        profileData = data;
      }
      if (!profileData) { setLoading(false); return; }
      setProfile(profileData);

      const { data: listingsData } = await supabase
        .from('listings')
        .select('*, listing_variants(id, size, price, quantity, condition, is_active), listing_used_items(id, size, price, quantity, is_active)')
        .eq('seller_id', profileData.id)
        .eq('status', 'active');

      const formattedListings = dedupeSkuListings((listingsData || []) as Listing[], { includeUsedItems: true }).map((listing) => {
        const metrics = getListingDisplayMetrics(listing, { includeUsedItems: true });
        return {
          ...listing,
          availableSizes: metrics.sizes,
          availableSizeLabels: metrics.sizeLabels,
          lowestPrice: metrics.lowestPrice,
        };
      });
      setListings(formattedListings);

      const { data: postsData } = await supabase.from('posts').select('*, related_listing:listings(id, brand, model, images, sizes)').eq('seller_id', profileData.id).order('created_at', { ascending: false });
      setPosts(postsData || []);

      const { data: reviewsData } = await supabase.from('reviews').select('*, profiles (username), orders (listings (*))').eq('seller_id', profileData.id);
      setReviews(reviewsData || []);

      if (reviewsData && reviewsData.length > 0) {
        const avg = (reviewsData.reduce((sum: number, review: Review) => sum + review.rating, 0) / reviewsData.length).toFixed(1);
        setAverageRating(avg);
      }

      // Use stored profile stats, fall back to counting
      if (profileData.sales_count != null && profileData.sales_count > 0) {
        setTotalSales(profileData.sales_count);
      } else {
        const { count } = await supabase.from('orders').select('*', { count: 'exact' }).eq('seller_id', profileData.id).eq('status', 'completed');
        setTotalSales(count || 0);
      }

      // Use stored avg_rating as fallback if no reviews fetched
      if ((!reviewsData || reviewsData.length === 0) && profileData.avg_rating) {
        setAverageRating(parseFloat(profileData.avg_rating).toFixed(1));
      }

      setFollowersCount(profileData.followers_count || 0);

      if (currentUser?.id && currentUser.id !== profileData.id) {
        const { data: followData } = await supabase.from('follows').select('id').eq('follower_id', currentUser.id).eq('following_id', profileData.id).single();
        setIsFollowing(!!followData);
      }

      setLoading(false);
    }
    loadData();
  }, [params.username, currentUser?.id]);

  const handleMessage = async () => {
    if (!currentUser?.id || !profile?.id) { router.push('/login'); return; }
    if (currentUser!.id === profile.id) { alert("You can't message yourself!"); return; }
    setMessagingLoading(true);
    try {
      const supabase = createClient();
      const { data: existingConvos } = await supabase.from('conversations').select('*').contains('participant_ids', [currentUser!.id, profile.id]);
      if (existingConvos && existingConvos.length > 0) { router.push('/messages'); return; }
      const buyerMessagingUnavailableReason = currentUser?.role === 'seller' || currentUser?.role === 'admin'
        ? null
        : getBuyerMessagingUnavailableReason({
            role: profile.role || 'seller',
            customerMessagingEnabled: profile.customer_messaging_enabled,
            vacationModeEnabled: profile.vacation_mode_enabled,
          });
      if (buyerMessagingUnavailableReason) {
        alert(buyerMessagingUnavailableReason);
        return;
      }
      const { error } = await supabase.from('conversations').insert({ participant_ids: [currentUser!.id, profile.id], listing_id: null, last_message: null, last_message_at: new Date().toISOString() });
      if (error) throw error;
      router.push('/messages');
    } catch (error) {
      console.error('Error creating conversation:', error);
      alert('Failed to start conversation. Please try again.');
    } finally {
      setMessagingLoading(false);
    }
  };

  const handleFollow = async () => {
    if (!currentUser?.id || !profile?.id) { router.push('/login'); return; }
    if (followInFlight.current) return;
    followInFlight.current = true;
    const wasFollowing = isFollowing;
    // Optimistic update
    setIsFollowing(!wasFollowing);
    setFollowersCount((prev) => wasFollowing ? Math.max(prev - 1, 0) : prev + 1);
    try {
      const supabase = createClient();
      if (wasFollowing) {
        await supabase.from('follows').delete().eq('follower_id', currentUser!.id).eq('following_id', profile.id);
      } else {
        await supabase.from('follows').insert({ follower_id: currentUser!.id, following_id: profile.id });
      }
    } catch (error) {
      // Revert on failure
      setIsFollowing(wasFollowing);
      setFollowersCount((prev) => wasFollowing ? prev + 1 : Math.max(prev - 1, 0));
      console.error('Error toggling follow:', error);
    } finally {
      followInFlight.current = false;
    }
  };

  if (loading) return <div className="text-center text-white/40 py-12">Loading...</div>;
  if (!profile) return <div className="text-center text-white/40 py-12">Profile not found</div>;

  const theme = THEME_MAP[profile.profile_theme || 'blue'] || THEME_MAP.blue;
  const getInitials = (name: string) => (name || '?').split(' ').map((n) => n[0]).join('').toUpperCase();
  const buyerMessagingUnavailableReason = getBuyerMessagingUnavailableReason({
    role: profile.role || 'seller',
    customerMessagingEnabled: profile.customer_messaging_enabled,
    vacationModeEnabled: profile.vacation_mode_enabled,
  });
  const viewerCanMessageSeller =
    currentUser?.id === profile.id ||
    currentUser?.role === 'seller' ||
    currentUser?.role === 'admin' ||
    canBuyerMessageSeller({
      role: profile.role || 'seller',
      customerMessagingEnabled: profile.customer_messaging_enabled,
      vacationModeEnabled: profile.vacation_mode_enabled,
    });

  // Fallback display name if not yet set
  const displayName = profile.display_name || profile.full_name || profile.username || 'Seller';

  return (
    <div>
      <div className="h-40 sm:h-56 w-full bg-cover bg-center relative" style={{ backgroundImage: profile.profile_banner_url ? 'url(' + profile.profile_banner_url + ')' : theme.bannerGradient, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <div className="absolute inset-0 opacity-10" style={{ background: 'linear-gradient(to right, transparent, ' + theme.accent + ', transparent)' }} />
      </div>

      <div className="px-4 md:px-8 pb-12">
        <div className="relative -mt-16 mb-12">
          <div className="h-28 w-28 rounded-full border-4 flex-shrink-0 flex items-center justify-center overflow-hidden mb-4" style={{ borderColor: theme.accent, background: 'linear-gradient(135deg, ' + theme.accentLight + ', ' + theme.accent + ')' }}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl font-bold text-relay-bg">{getInitials(displayName)}</span>
            )}
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{displayName}</h1>
              {profile.is_verified_seller && (
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: theme.accent + '20', color: theme.accent, border: '1px solid ' + theme.cardBorder }}>Verified</span>
              )}
              {profile.is_founding_seller && <FoundingSellerBadge />}
              {profile.vacation_mode_enabled && (
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-300">
                  Vacation Mode
                </span>
              )}
            </div>
            <p className="text-white/50 text-sm">@{profile.username}</p>
            {profile.bio && <p className="text-relay-text mt-3 max-w-2xl">{profile.bio}</p>}
            {profile.vacation_mode_enabled && (
              <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <p className="text-sm font-medium text-amber-300">{getVacationModeNotice()}</p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mb-4 text-sm">
            <span className="text-white/60">
              <span className="font-bold text-relay-text">{followersCount}</span> {followersCount === 1 ? 'follower' : 'followers'}
            </span>
          </div>

          <div className="flex gap-3 flex-wrap">
            {currentUser?.id !== profile.id && (
              <button onClick={handleFollow} disabled={followLoading} className={"flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-colors disabled:opacity-50 " + (isFollowing ? "bg-white/[0.08] border border-white/20 hover:bg-white/[0.12] text-relay-text" : "text-relay-bg")} style={!isFollowing ? { backgroundColor: theme.accent } : undefined}>
                {isFollowing ? <UserCheck size={18} /> : <UserPlus size={18} />}
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
            {currentUser?.id !== profile.id && (
              <button onClick={handleMessage} disabled={messagingLoading || !viewerCanMessageSeller} className="flex items-center gap-2 px-4 py-2 font-semibold rounded-lg transition-colors disabled:opacity-50 border" style={{ borderColor: theme.cardBorder, color: theme.accent }}>
                <MessageCircle size={18} />
                {messagingLoading ? 'Opening...' : profile.vacation_mode_enabled ? 'Seller on Vacation' : 'Message'}
              </button>
            )}
            {profile.instagram_url && (
              <a href={profile.instagram_url.startsWith('http') ? profile.instagram_url : 'https://instagram.com/' + profile.instagram_url.replace(/^@/, '')} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] backdrop-blur-xl border border-white/10 hover:bg-white/[0.08] rounded-lg transition-colors" style={{ color: theme.accent }}>
                <Instagram size={18} />
                Instagram
              </a>
            )}
          </div>

          {!viewerCanMessageSeller && currentUser?.id !== profile.id && buyerMessagingUnavailableReason && (
            <p className="text-sm text-white/50 mt-3">{buyerMessagingUnavailableReason}</p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
          <div className="backdrop-blur-xl rounded-[1.5rem] p-6" style={{ backgroundColor: theme.cardBg, border: '1px solid ' + theme.cardBorder }}>
            <p className="text-white/60 text-sm mb-2">Total Sales</p>
            <p className="text-3xl font-bold" style={{ color: theme.accent }}>{totalSales}</p>
          </div>
          <div className="backdrop-blur-xl rounded-[1.5rem] p-6" style={{ backgroundColor: theme.cardBg, border: '1px solid ' + theme.cardBorder }}>
            <p className="text-white/60 text-sm mb-2">Rating</p>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold" style={{ color: theme.accent }}>{averageRating}</span>
              <div className="flex gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={16} style={i < Math.round(parseFloat(averageRating)) ? { fill: theme.accent, color: theme.accent } : undefined} className={i >= Math.round(parseFloat(averageRating)) ? 'text-white/20' : ''} />
                ))}
              </div>
            </div>
          </div>
          <div className="backdrop-blur-xl rounded-[1.5rem] p-6" style={{ backgroundColor: theme.cardBg, border: '1px solid ' + theme.cardBorder }}>
            <p className="text-white/60 text-sm mb-2">Active Listings</p>
            <p className="text-3xl font-bold" style={{ color: theme.accent }}>{listings.length}</p>
          </div>
          <div className="backdrop-blur-xl rounded-[1.5rem] p-6" style={{ backgroundColor: theme.cardBg, border: '1px solid ' + theme.cardBorder }}>
            <p className="text-white/60 text-sm mb-2">Followers</p>
            <p className="text-3xl font-bold" style={{ color: theme.accent }}>{followersCount}</p>
          </div>
        </div>

        <div className="border-b border-white/10 mb-8 overflow-x-auto">
          <div className="flex gap-4 sm:gap-8">
            {TABS.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={"py-4 px-2 text-sm font-semibold border-b-2 transition-colors " + (activeTab === tab.id ? '' : 'text-white/60 border-transparent hover:text-relay-text')} style={activeTab === tab.id ? { color: theme.accent, borderColor: theme.accent } : undefined}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'inventory' && (
          <div>
            {listings.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {listings.map((listing) => {
                  const cardContent = (
                    <>
                      <div className="h-48 w-full relative overflow-hidden">
                        {listing.images?.[0] ? (
                          <img src={listing.images[0]} alt={listing.brand + ' ' + listing.model} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full" style={{ background: 'linear-gradient(135deg, #2d2d3d 0%, #3d3d4d 100%)' }} />
                        )}
                        {!onboardingActive && (
                          <div className="absolute inset-0 bg-gradient-to-t from-relay-bg/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                            <span className="w-full text-relay-bg font-semibold py-2 rounded-lg transition-colors text-center block" style={{ backgroundColor: theme.accent }}>View Details</span>
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold text-relay-text mb-2 line-clamp-2">{listing.brand} {listing.model}</h3>
                        <div className="flex items-baseline justify-between">
                          <p className="text-2xl font-bold" style={{ color: theme.accent }}>{`From $${listing.lowestPrice || 0}`}</p>
                          <p className="text-xs text-white/50 text-right">{formatSizeDisplay(listing.availableSizes, listing.availableSizeLabels)}</p>
                        </div>
                      </div>
                    </>
                  );

                  return onboardingActive ? (
                    <div key={listing.id} className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] overflow-hidden">
                      {cardContent}
                    </div>
                  ) : (
                    <Link key={listing.id} href={'/listing/' + listing.id} className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] overflow-hidden hover:bg-white/[0.08] transition-colors group cursor-pointer block">
                      {cardContent}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="relay-empty text-center p-12"><p className="text-white/40 text-lg">No active listings</p></div>
            )}
          </div>
        )}

        {activeTab === 'posts' && (
          <div>
            {posts.length > 0 ? (
              <div className="space-y-6">
                {posts.map((post) => (
                  <div key={post.id} className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-4 sm:p-6 hover:bg-white/[0.08] transition-colors">
                    <div className="flex items-start gap-4">
                      <div className="h-12 w-12 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ background: 'linear-gradient(135deg, ' + theme.accentLight + ', ' + theme.accent + ')' }}>
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg font-bold text-relay-bg">{getInitials(displayName)}</span>
                        )}
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{displayName}</h4>
                              {post.is_custom_brand && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-400/30">
                                  <Star size={11} className="text-purple-400 fill-purple-400" />
                                  <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Own Brand</span>
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-white/50">@{profile.username} · {new Date(post.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <p className="text-relay-text mb-4">{post.content}</p>

                        {post.images && post.images.length > 0 && (
                          <div className="mb-4">
                            <div className={"grid gap-2 " + (post.images.length === 1 ? 'grid-cols-1' : post.images.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3')}>
                              {post.images.map((img, idx) => (
                                <div key={idx} className={"rounded-xl overflow-hidden border border-white/5 " + (post.images!.length === 1 ? 'aspect-video' : 'aspect-square')}>
                                  <img src={img} alt={"Post image " + (idx + 1)} className="w-full h-full object-cover" />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {post.related_listing && (
                          <Link href={'/listing/' + post.related_listing.id} className="block mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] transition-colors">
                            <div className="flex items-center gap-3">
                              {post.related_listing.images?.[0] && (
                                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border border-white/10">
                                  <img src={post.related_listing.images[0]} alt="" className="w-full h-full object-cover" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-white/40 uppercase tracking-wide">Linked Listing</p>
                                <h4 className="text-sm font-semibold truncate">{post.related_listing.brand} {post.related_listing.model}</h4>
                                <p className="text-sm font-bold" style={{ color: theme.accent }}>{"$" + (post.related_listing.sizes?.[0]?.price || 0)}</p>
                              </div>
                              <span className="px-3 py-1 rounded-lg text-xs font-semibold text-relay-bg" style={{ backgroundColor: theme.accent }}>View</span>
                            </div>
                          </Link>
                        )}

                        <div className="flex gap-4 text-sm text-white/50">
                          <span className="flex items-center gap-1.5">
                            <Heart size={14} className={post.likes_count > 0 ? "fill-relay-accent text-relay-accent" : ""} /> {post.likes_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="relay-empty text-center p-12"><p className="text-white/40 text-lg">No posts yet</p></div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (() => {
          const reviewsWithComments = reviews.filter((r) => r.comment);
          return (
            <div>
              {reviewsWithComments.length > 0 ? (
                <>
                  <div className="mb-8 p-6 backdrop-blur-xl rounded-[1.5rem]" style={{ backgroundColor: theme.cardBg, border: '1px solid ' + theme.cardBorder }}>
                    <div className="flex items-center gap-4">
                      <div className="text-4xl font-bold" style={{ color: theme.accent }}>{averageRating}</div>
                      <div>
                        <div className="flex gap-1 mb-2">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} size={20} className={i < Math.round(parseFloat(averageRating)) ? 'fill-relay-accent text-relay-accent' : 'text-white/20'} />
                          ))}
                        </div>
                        <p className="text-sm text-white/60">Based on {reviews.length} rating{reviews.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {reviewsWithComments.map((review) => {
                      const shoeModel = review.orders?.listings ? review.orders.listings.brand + ' ' + review.orders.listings.model : 'Unknown Model';
                      return (
                        <div key={review.id} className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-6 hover:bg-white/[0.08] transition-colors">
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
                                    <Star key={i} size={14} className={i < review.rating ? 'fill-relay-accent text-relay-accent' : 'text-white/20'} />
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
                <div className="relay-empty text-center p-12"><p className="text-white/40 text-lg">No reviews yet</p></div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
