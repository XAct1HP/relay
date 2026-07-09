'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase';
import { formatListingTitle } from '@/lib/listing-display';
import { Camera, Palette, User, MapPin, Edit3, Check, X, Eye, Upload, Send, Link as LinkIcon, Sparkles, Loader2, ArrowLeft } from 'lucide-react';

interface Theme {
  id: string;
  name: string;
  accent: string;
  accentLight: string;
  cardBg: string;
  cardBorder: string;
  bannerGradient: string;
  textHighlight: string;
}

const THEMES: Theme[] = [
  { id: 'blue', name: 'Default', accent: '#5f8fff', accentLight: '#7ca6ff', cardBg: 'rgba(95, 143, 255, 0.04)', cardBorder: 'rgba(95, 143, 255, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(95, 143, 255, 0.15) 0%, rgba(124, 166, 255, 0.05) 100%)', textHighlight: '#7ca6ff' },
  { id: 'emerald', name: 'Emerald', accent: '#34d399', accentLight: '#6ee7b7', cardBg: 'rgba(52, 211, 153, 0.04)', cardBorder: 'rgba(52, 211, 153, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)', textHighlight: '#6ee7b7' },
  { id: 'purple', name: 'Purple', accent: '#a78bfa', accentLight: '#c4b5fd', cardBg: 'rgba(167, 139, 250, 0.04)', cardBorder: 'rgba(167, 139, 250, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)', textHighlight: '#c4b5fd' },
  { id: 'rose', name: 'Rose', accent: '#fb7185', accentLight: '#fda4af', cardBg: 'rgba(251, 113, 133, 0.04)', cardBorder: 'rgba(251, 113, 133, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(251, 113, 133, 0.15) 0%, rgba(244, 63, 94, 0.05) 100%)', textHighlight: '#fda4af' },
  { id: 'amber', name: 'Amber', accent: '#fbbf24', accentLight: '#fcd34d', cardBg: 'rgba(251, 191, 36, 0.04)', cardBorder: 'rgba(251, 191, 36, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)', textHighlight: '#fcd34d' },
  { id: 'cyan', name: 'Cyan', accent: '#22d3ee', accentLight: '#67e8f9', cardBg: 'rgba(34, 211, 238, 0.04)', cardBorder: 'rgba(34, 211, 238, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(6, 182, 212, 0.05) 100%)', textHighlight: '#67e8f9' },
  { id: 'sunset', name: 'Sunset', accent: '#f97316', accentLight: '#fb923c', cardBg: 'rgba(249, 115, 22, 0.04)', cardBorder: 'rgba(249, 115, 22, 0.15)', bannerGradient: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.08) 50%, rgba(251, 113, 133, 0.05) 100%)', textHighlight: '#fb923c' },
  { id: 'midnight', name: 'Midnight', accent: '#818cf8', accentLight: '#a5b4fc', cardBg: 'rgba(129, 140, 248, 0.04)', cardBorder: 'rgba(129, 140, 248, 0.12)', bannerGradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(67, 56, 202, 0.08) 100%)', textHighlight: '#a5b4fc' },
];

export default function ProfileStudioPage() {
  const { currentUser, updateProfile } = useAuth();
  const [selectedTheme, setSelectedTheme] = useState<string>('blue');
  const [displayName, setDisplayName] = useState<string>('');
  const [shopName, setShopName] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [postContent, setPostContent] = useState<string>('');
  const [postImages, setPostImages] = useState<string[]>([]);
  const [postImageFiles, setPostImageFiles] = useState<File[]>([]);
  const [selectedListingId, setSelectedListingId] = useState<string>('');
  const [publishingPost, setPublishingPost] = useState(false);
  const [postSuccess, setPostSuccess] = useState(false);
  const [sellerListings, setSellerListings] = useState<any[]>([]);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [address, setAddress] = useState({ street: '', street2: '', city: '', state: '', zip: '', country: '' });

  useEffect(() => {
    async function loadProfile() {
      if (!currentUser?.id) return;
      const supabase = createClient();
      const { data } = await supabase.from('profiles').select('*').eq('id', currentUser!.id).single();
      if (data) {
        setDisplayName(data.display_name || '');
        setShopName(data.shop_name || '');
        setBio(data.bio || '');
        setUsername(data.username || '');
        setEmail(currentUser!.email || '');
        if (data.profile_theme) setSelectedTheme(data.profile_theme);
        if (data.avatar_url) setAvatarPreview(data.avatar_url);
        if (data.profile_banner_url) setBannerPreview(data.profile_banner_url);
        if (data.ship_from_address) setAddress(data.ship_from_address);
      }
      const { data: listingsData } = await supabase.from('listings').select('id, brand, model, nickname, images, sizes, admin_review_status').eq('seller_id', currentUser!.id).eq('status', 'active');
      setSellerListings(listingsData || []);
      setLoading(false);
    }
    loadProfile();
  }, [currentUser?.id]);

  // Auto-detect indie brand boost: only for linked listings that are approved "Individual Brand"
  const selectedListing = sellerListings.find((l: any) => l.id === selectedListingId);
  const isCustomBrand = !!(
    selectedListing &&
    selectedListing.brand === 'Individual Brand' &&
    selectedListing.admin_review_status === 'approved'
  );

  const [hasChanges, setHasChanges] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const postImageInputRef = useRef<HTMLInputElement>(null);

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onload = (event) => { setBannerPreview(event.target?.result as string); setHasChanges(true); }; reader.readAsDataURL(file); }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { const reader = new FileReader(); reader.onload = (event) => { setAvatarPreview(event.target?.result as string); setHasChanges(true); }; reader.readAsDataURL(file); }
  };

  const handleAddPostImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const available = 4 - postImages.length;
    if (available <= 0) return;
    const incoming = Array.from(files).slice(0, available);
    incoming.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPostImages((prev) =>
          prev.length >= 4 ? prev : [...prev, event.target?.result as string]
        );
        setPostImageFiles((prev) => (prev.length >= 4 ? prev : [...prev, file]));
      };
      reader.readAsDataURL(file);
    });
  };

  const removePostImage = (index: number) => {
    setPostImages((prev) => prev.filter((_, i) => i !== index));
    setPostImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublishPost = async () => {
    if (!currentUser?.id) return;
    if (!postContent.trim() && postImageFiles.length === 0) return;
    setPublishingPost(true); setPostSuccess(false);
    try {
      const supabase = createClient();
      const uploadedImageUrls: string[] = [];
      const uploadFailures: string[] = [];
      for (let i = 0; i < postImageFiles.length; i++) {
        const file = postImageFiles[i];
        if (!file) continue;
        const formData = new FormData();
        formData.set('file', file);
        try {
          const res = await fetch('/api/seller/posts/upload-image', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data?.url) {
            const message =
              (data && typeof data.error === 'string' && data.error) ||
              'upload failed';
            uploadFailures.push(file.name + ': ' + message);
            continue;
          }
          uploadedImageUrls.push(data.url);
        } catch (fetchErr) {
          console.error('post image upload failed', fetchErr);
          uploadFailures.push(
            file.name + ': ' + (fetchErr instanceof Error ? fetchErr.message : 'network error')
          );
        }
      }
      if (uploadFailures.length > 0) {
        throw new Error(
          uploadFailures.length === postImageFiles.length
            ? 'None of the images uploaded. ' + uploadFailures[0]
            : 'Some images failed to upload: ' + uploadFailures.join('; ')
        );
      }
      const { error } = await supabase.from('posts').insert({
        seller_id: currentUser!.id,
        content: postContent.trim(),
        images: uploadedImageUrls.length > 0 ? uploadedImageUrls : null,
        related_listing_id: selectedListingId || null,
        is_custom_brand: isCustomBrand,
      });
      if (error) throw error;
      setPostContent(''); setPostImages([]); setPostImageFiles([]); setSelectedListingId('');
      setPostSuccess(true); setTimeout(() => setPostSuccess(false), 3000);
    } catch (err) {
      console.error('Post publish error:', err);
      alert(err instanceof Error ? err.message : 'Failed to publish post. Please try again.');
    } finally { setPublishingPost(false); }
  };

  const handleUsernameChange = async (value: string) => {
    setUsername(value); setHasChanges(true);
    if (value.length < 3 || value.includes(' ')) { setUsernameAvailable(false); return; }
    const supabase = createClient();
    const { data } = await supabase.from('profiles').select('id').eq('username', value).neq('id', currentUser?.id || '').single();
    setUsernameAvailable(!data);
  };

  const handleAddressChange = (field: keyof typeof address, value: string) => { setAddress((prev) => ({ ...prev, [field]: value })); setHasChanges(true); };
  const handleThemeSelect = (themeId: string) => { setSelectedTheme(themeId); setHasChanges(true); };

  const handleSaveChanges = async () => {
    if (!currentUser?.id) return;
    setSaving(true); setSaveSuccess(false);
    try {
      const supabase = createClient();
      const profileUpdates: Record<string, any> = { display_name: displayName, shop_name: shopName, bio: bio, username: username, ship_from_address: address, profile_theme: selectedTheme };
      if (bannerPreview && bannerPreview.startsWith('data:')) {
        const bannerBlob = await fetch(bannerPreview).then((r) => r.blob());
        const bannerPath = currentUser!.id + '/banner-' + Date.now() + '.jpg';
        const { error: bannerError } = await supabase.storage.from('profile-images').upload(bannerPath, bannerBlob, { upsert: true });
        if (!bannerError) { const { data: bannerUrl } = supabase.storage.from('profile-images').getPublicUrl(bannerPath); profileUpdates.profile_banner_url = bannerUrl.publicUrl; setBannerPreview(bannerUrl.publicUrl); }
      }
      if (avatarPreview && avatarPreview.startsWith('data:')) {
        const avatarBlob = await fetch(avatarPreview).then((r) => r.blob());
        const avatarPath = currentUser!.id + '/avatar-' + Date.now() + '.jpg';
        const { error: avatarError } = await supabase.storage.from('profile-images').upload(avatarPath, avatarBlob, { upsert: true });
        if (!avatarError) { const { data: avatarUrl } = supabase.storage.from('profile-images').getPublicUrl(avatarPath); profileUpdates.avatar_url = avatarUrl.publicUrl; setAvatarPreview(avatarUrl.publicUrl); }
      }
      const { error } = await supabase.from('profiles').update(profileUpdates).eq('id', currentUser!.id);
      if (error) throw error;
      await updateProfile(profileUpdates);
      setHasChanges(false); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) { console.error('Save error:', err); alert('Failed to save changes. Please try again.'); }
    finally { setSaving(false); }
  };

  const handleDiscardChanges = async () => {
    if (!currentUser?.id) return;
    const supabase = createClient();
    const { data } = await supabase.from('profiles').select('*').eq('id', currentUser!.id).single();
    if (data) {
      setDisplayName(data.display_name || ''); setShopName(data.shop_name || ''); setBio(data.bio || ''); setUsername(data.username || '');
      if (data.profile_theme) setSelectedTheme(data.profile_theme);
      if (data.avatar_url) setAvatarPreview(data.avatar_url);
      if (data.profile_banner_url) setBannerPreview(data.profile_banner_url);
      if (data.ship_from_address) setAddress(data.ship_from_address);
    }
    setHasChanges(false);
  };

  const activeTheme = THEMES.find((t) => t.id === selectedTheme) || THEMES[0];

  return (
    <div className="space-y-6 pb-20 lg:pb-12">
      <div className="space-y-2 mb-8">
        <p className="relay-eyebrow text-[#5f8fff]">CUSTOMIZE</p>
        <h1 className="relay-title">Profile Studio</h1>
        <p className="lg:hidden text-white/30 text-xs font-medium tracking-wider mb-2">STUDIO</p>
      </div>

      {/* ====== MOBILE LAYOUT ====== */}
      <div className="lg:hidden">
        {/* Preview card - fills available viewport */}
        <div className="h-[calc(100dvh-160px-env(safe-area-inset-bottom,0px))] overflow-hidden rounded-2xl">
          <div
            className="backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden h-full transition-shadow duration-500"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.3), 0 0 60px ' + activeTheme.accent + '08',
            }}
          >
            {/* Live Preview badge */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-semibold text-white/60 tracking-wide uppercase">Live Preview</span>
              </div>
              <Eye size={14} className="text-white/30" />
            </div>

            {/* Banner blending into avatar area */}
            <div className="relative">
              <div className="h-28 w-full" style={{ backgroundImage: bannerPreview ? 'url(' + bannerPreview + ')' : activeTheme.bannerGradient, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div className="absolute bottom-0 left-0 right-0 h-12" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)' }} />
              <div className="absolute -bottom-8 left-5">
                <div className="h-16 w-16 rounded-full border-[3px] bg-gradient-to-br from-relay-accent-light to-relay-accent flex items-center justify-center flex-shrink-0 shadow-lg" style={{ borderColor: 'rgba(20,20,40,0.9)' }}>
                  {avatarPreview ? (<img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover rounded-full" />) : (<span className="text-xl font-bold text-relay-bg">PK</span>)}
                </div>
              </div>
            </div>

            {/* Profile info */}
            <div className="px-5 pt-12 pb-5">
              <h4 className="font-bold text-base mb-0.5" style={{ color: activeTheme.textHighlight }}>{displayName || 'Shop Name'}</h4>
              <p className="text-xs text-white/40 mb-3">@{username || 'username'}</p>
              {bio && <p className="text-xs text-white/60 line-clamp-2 mb-4 leading-relaxed">{bio}</p>}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 rounded-xl p-2.5 text-center" style={{ backgroundColor: activeTheme.cardBg, border: '1px solid ' + activeTheme.cardBorder }}>
                  <p className="text-xs text-white/40">Rating</p>
                  <p className="text-sm font-bold" style={{ color: activeTheme.textHighlight }}>4.9/5</p>
                </div>
                <div className="flex-1 rounded-xl p-2.5 text-center" style={{ backgroundColor: activeTheme.cardBg, border: '1px solid ' + activeTheme.cardBorder }}>
                  <p className="text-xs text-white/40">Sales</p>
                  <p className="text-sm font-bold" style={{ color: activeTheme.textHighlight }}>847</p>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid ' + activeTheme.cardBorder, backgroundColor: activeTheme.cardBg }}>
                <div className="h-14 w-full" style={{ background: activeTheme.bannerGradient }} />
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: activeTheme.accent + '20' }} />
                    <div className="flex-1">
                      <div className="h-2 w-16 rounded-full mb-1" style={{ backgroundColor: activeTheme.accent + '40' }} />
                      <div className="h-1.5 w-10 rounded-full" style={{ backgroundColor: activeTheme.accentLight + '30' }} />
                    </div>
                    <div className="px-2 py-1 rounded-md text-[10px] font-bold" style={{ backgroundColor: activeTheme.accent, color: '#0a0a1a' }}>$180</div>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: activeTheme.accent + '25' }} />
                    <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: activeTheme.accentLight + '25' }} />
                  </div>
                </div>
              </div>
              <p className="text-[10px] mt-3 text-center font-medium tracking-wide uppercase" style={{ color: activeTheme.textHighlight + '90' }}>{activeTheme.name} theme</p>
            </div>
          </div>
        </div>

        {/* Customize button */}
        <button
          onClick={() => setEditorOpen(true)}
          className="w-full bg-[#5f8fff] text-white rounded-xl py-3 font-medium mt-4 active:opacity-80 transition-opacity"
        >
          Customize
        </button>

        {/* Editor overlay */}
        {editorOpen && (
          <div className="fixed inset-0 z-40 bg-[#06070a] overflow-auto pt-4 pb-[100px]">
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 mb-6">
              <button onClick={() => setEditorOpen(false)} className="flex items-center gap-2 text-[#5f8fff] text-sm font-medium active:opacity-70">
                <ArrowLeft size={16} />
                Preview
              </button>
              <button onClick={() => { handleSaveChanges(); setEditorOpen(false); }} className="text-[#5f8fff] text-sm font-semibold active:opacity-70">
                Done
              </button>
            </div>

            <div className="px-4 space-y-6">
              {/* Branding */}
              <div className="space-y-5">
                <h2 className="text-lg font-bold flex items-center gap-2 text-white"><Camera size={20} className="text-relay-accent" /> Branding</h2>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-white/70">Banner Image</label>
                  <div className="relative w-full aspect-[16/5] rounded-xl border-2 border-dashed border-white/15 cursor-pointer flex items-center justify-center overflow-hidden" onClick={() => bannerInputRef.current?.click()}>
                    {bannerPreview ? (
                      <img src={bannerPreview} alt="Banner preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center p-4">
                        <Upload className="text-relay-accent mx-auto mb-2" size={24} />
                        <p className="text-xs text-white/60">Tap to upload banner</p>
                      </div>
                    )}
                    <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-white/70">Avatar</label>
                  <div className="flex items-center gap-4">
                    <div className="relative h-20 w-20 rounded-full border-4 border-white/10 bg-gradient-to-br from-relay-accent-light to-relay-accent flex-shrink-0 flex items-center justify-center cursor-pointer overflow-hidden" onClick={() => avatarInputRef.current?.click()}>
                      {avatarPreview ? (<img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />) : (<div className="text-2xl font-bold text-relay-bg">PK</div>)}
                      <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    </div>
                    <p className="text-xs text-white/50">Tap to change</p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-white/70">Display Name</label>
                  <input type="text" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setHasChanges(true); }} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" placeholder="Your display name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-white/70">Shop Name</label>
                  <input type="text" value={shopName} onChange={(e) => { setShopName(e.target.value); setHasChanges(true); }} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" placeholder="Your shop name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-white/70">Bio</label>
                  <textarea value={bio} onChange={(e) => { setBio(e.target.value.slice(0, 200)); setHasChanges(true); }} maxLength={200} rows={3} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all resize-none" placeholder="Tell buyers about your shop..." />
                  <p className="text-xs text-white/40 mt-1">{bio.length}/200</p>
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Account */}
              <div className="space-y-5">
                <h2 className="text-lg font-bold flex items-center gap-2 text-white"><User size={20} className="text-relay-accent" /> Account</h2>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-white/70">Username</label>
                  <div className="relative">
                    <input type="text" value={username} onChange={(e) => handleUsernameChange(e.target.value)} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" placeholder="username" />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameAvailable === true && <Check size={18} className="text-green-400" />}
                      {usernameAvailable === false && <X size={18} className="text-red-400" />}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-white/70">Email</label>
                  <input type="email" value={email} disabled className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-4 py-2.5 text-white/40 cursor-not-allowed opacity-60" />
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Color Theme */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2 text-white"><Palette size={20} className="text-relay-accent" /> Color Theme</h2>
                <div className="grid grid-cols-4 gap-3">
                  {THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => handleThemeSelect(theme.id)}
                      className={"relative p-2 rounded-xl border-2 transition-all " + (selectedTheme === theme.id ? 'bg-white/[0.08]' : 'border-white/10 bg-white/[0.02]')}
                      style={selectedTheme === theme.id ? { borderColor: theme.accent } : undefined}
                    >
                      <div className="w-full h-5 rounded-lg mb-1.5" style={{ background: theme.bannerGradient }} />
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.accent }} />
                        <p className="text-[10px] font-semibold truncate" style={{ color: theme.textHighlight }}>{theme.name}</p>
                      </div>
                      {selectedTheme === theme.id && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                          <Check size={12} className="text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Ship From Address */}
              <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2 text-white"><MapPin size={20} className="text-relay-accent" /> Ship From Address</h2>
                <div className="space-y-3">
                  <input type="text" value={address.street} onChange={(e) => handleAddressChange('street', e.target.value)} placeholder="Street address" className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" />
                  <input type="text" value={address.street2} onChange={(e) => handleAddressChange('street2', e.target.value)} placeholder="Apt, Suite, etc." className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={address.city} onChange={(e) => handleAddressChange('city', e.target.value)} placeholder="City" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" />
                    <input type="text" value={address.state} onChange={(e) => handleAddressChange('state', e.target.value)} placeholder="State" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" value={address.zip} onChange={(e) => handleAddressChange('zip', e.target.value)} placeholder="ZIP code" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" />
                    <input type="text" value={address.country} onChange={(e) => handleAddressChange('country', e.target.value)} placeholder="Country" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 transition-all" />
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06]" />

              {/* Create Post (mobile) */}
              <PostComposer
                displayName={displayName}
                username={username}
                avatarPreview={avatarPreview}
                postContent={postContent}
                setPostContent={setPostContent}
                postImages={postImages}
                removePostImage={removePostImage}
                onSelectFiles={handleAddPostImages}
                postImageInputRef={postImageInputRef}
                sellerListings={sellerListings}
                selectedListingId={selectedListingId}
                setSelectedListingId={setSelectedListingId}
                isCustomBrand={isCustomBrand}
                onPublish={handlePublishPost}
                publishingPost={publishingPost}
                postSuccess={postSuccess}
              />

              {/* Save button at bottom of overlay */}
              <div className="pt-4 space-y-3">
                {saveSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center flex items-center justify-center gap-2">
                    <Check size={16} className="text-emerald-400" />
                    <p className="text-sm text-emerald-400 font-medium">Changes saved!</p>
                  </div>
                )}
                <button
                  onClick={handleSaveChanges}
                  disabled={!hasChanges || saving}
                  className={"w-full text-relay-bg font-semibold py-3 rounded-xl transition-all " + (hasChanges && !saving ? 'shadow-lg shadow-relay-accent/25' : 'disabled:opacity-40 disabled:cursor-not-allowed')}
                  style={hasChanges && !saving ? { background: 'linear-gradient(135deg, ' + activeTheme.accent + ' 0%, ' + activeTheme.accentLight + ' 100%)' } : { backgroundColor: activeTheme.accent }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={handleDiscardChanges} disabled={!hasChanges || saving} className="w-full bg-white/[0.04] border border-white/10 disabled:opacity-40 disabled:cursor-not-allowed font-semibold py-3 rounded-xl transition-colors">Discard Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====== DESKTOP LAYOUT ====== */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Section - Create Post (moved to top) */}
          <div className="relative bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] overflow-hidden">
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, ' + activeTheme.accent + ' 0%, ' + activeTheme.accentLight + ' 50%, transparent 100%)' }} />
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold flex items-center gap-3"><Edit3 size={22} className="text-relay-accent" /> Create Post</h2>
                <p className="text-xs text-white/40">Appears on your profile and in buyer feeds.</p>
              </div>
              <PostComposer
                displayName={displayName}
                username={username}
                avatarPreview={avatarPreview}
                postContent={postContent}
                setPostContent={setPostContent}
                postImages={postImages}
                removePostImage={removePostImage}
                onSelectFiles={handleAddPostImages}
                postImageInputRef={postImageInputRef}
                sellerListings={sellerListings}
                selectedListingId={selectedListingId}
                setSelectedListingId={setSelectedListingId}
                isCustomBrand={isCustomBrand}
                onPublish={handlePublishPost}
                publishingPost={publishingPost}
                postSuccess={postSuccess}
                variant="desktop"
              />
            </div>
          </div>

          {/* Section 1 - Branding */}
          <div className="relative bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] overflow-hidden">
            {/* Gradient top accent bar */}
            <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, ' + activeTheme.accent + ' 0%, ' + activeTheme.accentLight + ' 50%, transparent 100%)' }} />
            <div className="p-8">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-3"><Camera size={22} className="text-relay-accent" /> Branding</h2>
              <div className="mb-8">
                <label className="block text-sm font-semibold mb-3 text-white/70">Banner Image</label>
                <div className="relative w-full aspect-[16/5] rounded-xl border-2 border-dashed border-white/15 cursor-pointer transition-all hover:border-relay-accent/40 hover:shadow-lg hover:shadow-relay-accent/5 flex items-center justify-center overflow-hidden group" onClick={() => bannerInputRef.current?.click()}>
                  {bannerPreview ? (
                    <>
                      <img src={bannerPreview} alt="Banner preview" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="bg-white/10 backdrop-blur-md rounded-xl px-4 py-2 flex items-center gap-2">
                          <Camera size={18} className="text-white" />
                          <span className="text-sm font-medium text-white">Change Banner</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center relative">
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(95, 143, 255, 0.12) 0%, rgba(124, 166, 255, 0.03) 40%, rgba(95, 143, 255, 0.08) 100%)' }} />
                      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 50% 80%, rgba(95, 143, 255, 0.1) 0%, transparent 60%)' }} />
                      <div className="relative text-center z-10">
                        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-relay-accent/10 border border-relay-accent/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                          <Upload className="text-relay-accent" size={28} />
                        </div>
                        <p className="text-sm font-semibold text-white/80">Drop your banner here or click to upload</p>
                        <p className="text-xs text-white/40 mt-1">16:5 aspect ratio recommended</p>
                      </div>
                    </div>
                  )}
                  <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
                </div>
              </div>
              <div className="mb-8">
                <label className="block text-sm font-semibold mb-3 text-white/70">Avatar</label>
                <div className="flex items-center gap-6">
                  <div className="relative h-28 w-28 rounded-full border-4 border-white/10 bg-gradient-to-br from-relay-accent-light to-relay-accent flex-shrink-0 flex items-center justify-center cursor-pointer hover:border-relay-accent/40 transition-all hover:shadow-lg hover:shadow-relay-accent/20 overflow-hidden group" onClick={() => avatarInputRef.current?.click()}>
                    {avatarPreview ? (<img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />) : (<div className="text-3xl font-bold text-relay-bg">PK</div>)}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"><Camera size={28} className="text-white" /></div>
                    <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </div>
                  <div>
                    <p className="text-sm text-white/60">Square image recommended</p>
                    <p className="text-xs text-white/35 mt-1">Click to change your profile picture</p>
                  </div>
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold mb-2 text-white/70">Display Name</label>
                <input type="text" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setHasChanges(true); }} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" placeholder="Your display name" />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold mb-2 text-white/70">Shop Name</label>
                <input type="text" value={shopName} onChange={(e) => { setShopName(e.target.value); setHasChanges(true); }} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" placeholder="Your shop name" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2 text-white/70">Bio</label>
                <textarea value={bio} onChange={(e) => { setBio(e.target.value.slice(0, 200)); setHasChanges(true); }} maxLength={200} rows={3} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all resize-none" placeholder="Tell buyers about your shop..." />
                <p className="text-xs text-white/40 mt-1.5">{bio.length}/200 characters</p>
              </div>
            </div>
          </div>

          {/* Section 2 - Account */}
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-8 hover:border-white/15 transition-colors">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3"><User size={22} className="text-relay-accent" /> Account</h2>
            <div className="mb-5">
              <label className="block text-sm font-semibold mb-2 text-white/70">Username</label>
              <div className="relative">
                <input type="text" value={username} onChange={(e) => handleUsernameChange(e.target.value)} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 pr-10 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" placeholder="username" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {usernameAvailable === true && <Check size={20} className="text-green-400" />}
                  {usernameAvailable === false && <X size={20} className="text-red-400" />}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-white/70">Email</label>
              <input type="email" value={email} disabled className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-4 py-2.5 text-white/40 cursor-not-allowed opacity-60" />
              <p className="text-xs text-white/40 mt-1.5">Contact support to change email</p>
            </div>
          </div>

          {/* Section 3 - Color Theme */}
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-8 hover:border-white/15 transition-colors">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-3"><Palette size={22} className="text-relay-accent" /> Color Theme</h2>
            <p className="text-sm text-white/40 mb-6">Pick a vibe for your storefront</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id)}
                  className={"relative p-3 rounded-xl border-2 transition-all duration-200 hover:scale-105 " + (selectedTheme === theme.id ? 'bg-white/[0.08] scale-[1.02]' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]')}
                  style={selectedTheme === theme.id ? { borderColor: theme.accent, boxShadow: '0 0 20px ' + theme.accent + '30, 0 0 40px ' + theme.accent + '10' } : undefined}
                >
                  <div className="rounded-lg overflow-hidden mb-2" style={{ background: theme.bannerGradient, height: '28px' }} />
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full transition-transform duration-200" style={{ backgroundColor: theme.accent }} />
                    <div className="flex-1 h-2 rounded" style={{ backgroundColor: theme.cardBg, border: '1px solid ' + theme.cardBorder }} />
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.accentLight }} />
                    <p className="text-xs font-semibold" style={{ color: theme.textHighlight }}>{theme.name}</p>
                  </div>
                  {selectedTheme === theme.id && (
                    <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                      <Check size={14} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section 4 - Ship From Address */}
          <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-8 hover:border-white/15 transition-colors">
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3"><MapPin size={22} className="text-relay-accent" /> Ship From Address</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input type="text" value={address.street} onChange={(e) => handleAddressChange('street', e.target.value)} placeholder="Street address" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" />
              <input type="text" value={address.street2} onChange={(e) => handleAddressChange('street2', e.target.value)} placeholder="Apt, Suite, etc. (optional)" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <input type="text" value={address.city} onChange={(e) => handleAddressChange('city', e.target.value)} placeholder="City" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" />
              <input type="text" value={address.state} onChange={(e) => handleAddressChange('state', e.target.value)} placeholder="State" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" />
              <input type="text" value={address.zip} onChange={(e) => handleAddressChange('zip', e.target.value)} placeholder="ZIP code" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" />
              <input type="text" value={address.country} onChange={(e) => handleAddressChange('country', e.target.value)} placeholder="Country" className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent/50 focus:bg-white/[0.07] transition-all" />
            </div>
          </div>

        </div>

        {/* Right Section - Profile Preview Card (Desktop) */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Live Preview Card */}
            <div className="overflow-hidden rounded-[1.5rem]">
            <div
              className="backdrop-blur-xl border border-white/10 rounded-[1.5rem] overflow-hidden transition-shadow duration-500"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.3), 0 0 60px ' + activeTheme.accent + '08',
              }}
            >
              {/* Live Preview badge */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs font-semibold text-white/60 tracking-wide uppercase">Live Preview</span>
                </div>
                <Eye size={14} className="text-white/30" />
              </div>

              {/* Banner blending into avatar area */}
              <div className="relative">
                <div className="h-28 w-full" style={{ backgroundImage: bannerPreview ? 'url(' + bannerPreview + ')' : activeTheme.bannerGradient, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                {/* Fade overlay at bottom of banner */}
                <div className="absolute bottom-0 left-0 right-0 h-12" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)' }} />
                {/* Avatar overlapping banner */}
                <div className="absolute -bottom-8 left-5">
                  <div className="h-16 w-16 rounded-full border-[3px] bg-gradient-to-br from-relay-accent-light to-relay-accent flex items-center justify-center flex-shrink-0 shadow-lg" style={{ borderColor: 'rgba(20,20,40,0.9)' }}>
                    {avatarPreview ? (<img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover rounded-full" />) : (<span className="text-xl font-bold text-relay-bg">PK</span>)}
                  </div>
                </div>
              </div>

              {/* Profile info */}
              <div className="px-5 pt-12 pb-5">
                <h4 className="font-bold text-base mb-0.5" style={{ color: activeTheme.textHighlight }}>{displayName || 'Shop Name'}</h4>
                <p className="text-xs text-white/40 mb-3">@{username || 'username'}</p>
                {bio && <p className="text-xs text-white/60 line-clamp-2 mb-4 leading-relaxed">{bio}</p>}

                {/* Stats row */}
                <div className="flex gap-2 mb-4">
                  <div className="flex-1 rounded-xl p-2.5 text-center" style={{ backgroundColor: activeTheme.cardBg, border: '1px solid ' + activeTheme.cardBorder }}>
                    <p className="text-xs text-white/40">Rating</p>
                    <p className="text-sm font-bold" style={{ color: activeTheme.textHighlight }}>4.9/5</p>
                  </div>
                  <div className="flex-1 rounded-xl p-2.5 text-center" style={{ backgroundColor: activeTheme.cardBg, border: '1px solid ' + activeTheme.cardBorder }}>
                    <p className="text-xs text-white/40">Sales</p>
                    <p className="text-sm font-bold" style={{ color: activeTheme.textHighlight }}>847</p>
                  </div>
                </div>

                {/* Mini listing card preview using theme colors */}
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid ' + activeTheme.cardBorder, backgroundColor: activeTheme.cardBg }}>
                  <div className="h-14 w-full" style={{ background: activeTheme.bannerGradient }} />
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: activeTheme.accent + '20' }} />
                      <div className="flex-1">
                        <div className="h-2 w-16 rounded-full mb-1" style={{ backgroundColor: activeTheme.accent + '40' }} />
                        <div className="h-1.5 w-10 rounded-full" style={{ backgroundColor: activeTheme.accentLight + '30' }} />
                      </div>
                      <div className="px-2 py-1 rounded-md text-[10px] font-bold" style={{ backgroundColor: activeTheme.accent, color: '#0a0a1a' }}>$180</div>
                    </div>
                    <div className="flex gap-1.5">
                      <div className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: activeTheme.accent + '25' }} />
                      <div className="h-1.5 w-8 rounded-full" style={{ backgroundColor: activeTheme.accentLight + '25' }} />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] mt-3 text-center font-medium tracking-wide uppercase" style={{ color: activeTheme.textHighlight + '90' }}>{activeTheme.name} theme</p>
              </div>
            </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center flex items-center justify-center gap-2">
                  <Check size={16} className="text-emerald-400" />
                  <p className="text-sm text-emerald-400 font-medium">Changes saved!</p>
                </div>
              )}
              <button
                onClick={handleSaveChanges}
                disabled={!hasChanges || saving}
                className={"w-full text-relay-bg font-semibold py-3 rounded-xl transition-all duration-300 " + (hasChanges && !saving ? 'shadow-lg shadow-relay-accent/25' : 'disabled:opacity-40 disabled:cursor-not-allowed')}
                style={hasChanges && !saving ? { background: 'linear-gradient(135deg, ' + activeTheme.accent + ' 0%, ' + activeTheme.accentLight + ' 100%)', animation: 'pulse 2s ease-in-out infinite' } : { backgroundColor: activeTheme.accent }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={handleDiscardChanges} disabled={!hasChanges || saving} className="w-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed font-semibold py-3 rounded-xl transition-colors">Discard Changes</button>
              {username && (<a href={'/profile/' + username} className="block w-full text-center border font-semibold py-3 rounded-xl transition-all hover:bg-white/[0.06]" style={{ borderColor: activeTheme.accent + '40', color: activeTheme.accent }}>View Public Profile</a>)}
            </div>

            {/* Pulse keyframes */}
            <style>{`
              @keyframes pulse {
                0%, 100% { box-shadow: 0 4px 20px ${activeTheme.accent}30; }
                50% { box-shadow: 0 4px 30px ${activeTheme.accent}50, 0 0 40px ${activeTheme.accent}20; }
              }
            `}</style>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PostComposerProps {
  displayName: string;
  username: string;
  avatarPreview: string | null;
  postContent: string;
  setPostContent: (value: string) => void;
  postImages: string[];
  removePostImage: (index: number) => void;
  onSelectFiles: (files: FileList | null) => void;
  postImageInputRef: React.RefObject<HTMLInputElement>;
  sellerListings: any[];
  selectedListingId: string;
  setSelectedListingId: (value: string) => void;
  isCustomBrand: boolean;
  onPublish: () => void;
  publishingPost: boolean;
  postSuccess: boolean;
  variant?: 'mobile' | 'desktop';
}

function PostComposer({
  displayName,
  username,
  avatarPreview,
  postContent,
  setPostContent,
  postImages,
  removePostImage,
  onSelectFiles,
  postImageInputRef,
  sellerListings,
  selectedListingId,
  setSelectedListingId,
  isCustomBrand,
  onPublish,
  publishingPost,
  postSuccess,
  variant = 'mobile',
}: PostComposerProps) {
  const displayInitials = (displayName || username || 'PK').slice(0, 2).toUpperCase();
  const displayHandle = username ? '@' + username : '@you';
  const displayShown = displayName || 'Your Shop';
  const linkedListing = sellerListings.find((l) => l.id === selectedListingId);
  const canPublish = (postContent.trim().length > 0 || postImages.length > 0) && !publishingPost;
  const remaining = 4 - postImages.length;

  const previewImageLayout = (() => {
    if (postImages.length === 0) return null;
    if (postImages.length === 1) {
      return (
        <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black/20">
          <img
            src={postImages[0]}
            alt="Post preview"
            className="w-full max-h-[420px] object-cover"
          />
        </div>
      );
    }
    if (postImages.length === 2) {
      return (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-white/10">
          {postImages.map((img, i) => (
            <div key={i} className="relative aspect-square bg-black/20">
              <img src={img} alt={'Post preview ' + (i + 1)} className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      );
    }
    // 3 or 4 images
    return (
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl overflow-hidden border border-white/10">
        {postImages.slice(0, 4).map((img, i) => (
          <div key={i} className="relative aspect-square bg-black/20">
            <img src={img} alt={'Post preview ' + (i + 1)} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  })();

  return (
    <div className="space-y-4">
      {postSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center flex items-center justify-center gap-2">
          <Check size={16} className="text-emerald-400" />
          <p className="text-sm text-emerald-400 font-medium">Post published!</p>
        </div>
      )}

      {/* Composer + inline feed-style preview */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-relay-accent-light to-relay-accent flex items-center justify-center flex-shrink-0 overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-relay-bg">{displayInitials}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-relay-text truncate">{displayShown}</p>
                <p className="text-xs text-white/40 truncate">{displayHandle}</p>
              </div>
              <textarea
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="Share what's new with your customers..."
                rows={variant === 'desktop' ? 3 : 2}
                className="mt-1 w-full bg-transparent border-none text-relay-text placeholder-white/30 focus:outline-none resize-none text-sm leading-relaxed"
              />
              {previewImageLayout}
              {postImages.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {postImages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => removePostImage(i)}
                      className="text-[11px] text-white/50 hover:text-red-300 border border-white/10 rounded-full px-2 py-0.5"
                    >
                      Remove image {i + 1}
                    </button>
                  ))}
                </div>
              )}
              {linkedListing && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2">
                  {linkedListing.images?.[0] && (
                    <img
                      src={linkedListing.images[0]}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white/40">Linked listing</p>
                    <p className="text-sm text-relay-text truncate">
                      {formatListingTitle(linkedListing.brand, linkedListing.model, undefined, "Listing")}
                      {linkedListing.nickname ? ' "' + linkedListing.nickname + '"' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedListingId('')}
                    className="text-white/40 hover:text-white/80"
                    aria-label="Remove linked listing"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="border-t border-white/[0.06] px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => postImageInputRef.current?.click()}
              disabled={remaining <= 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-relay-accent bg-relay-accent/10 hover:bg-relay-accent/20 border border-relay-accent/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={remaining <= 0 ? 'Maximum 4 images' : 'Add photo'}
            >
              <Upload size={14} />
              Photo{postImages.length > 0 ? ' (' + postImages.length + '/4)' : ''}
            </button>
            <input
              ref={postImageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onSelectFiles(e.target.files);
                if (e.target) e.target.value = '';
              }}
            />
            <div className="relative min-w-0">
              <LinkIcon size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-white/40" />
              <select
                value={selectedListingId}
                onChange={(e) => setSelectedListingId(e.target.value)}
                className="appearance-none bg-white/[0.03] border border-white/10 text-white/70 pl-7 pr-3 py-1.5 rounded-lg text-xs focus:outline-none max-w-[160px] sm:max-w-[220px] truncate"
              >
                <option value="" className="bg-[#1a1a2e]">Link a listing</option>
                {sellerListings.map((listing) => (
                  <option key={listing.id} value={listing.id} className="bg-[#1a1a2e]">
                    {formatListingTitle(listing.brand, listing.model, undefined, "Listing")}
                    {listing.nickname ? ' "' + listing.nickname + '"' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <span className="text-[11px] text-white/30 whitespace-nowrap">
            {postContent.length > 0 ? postContent.length + ' chars' : ''}
          </span>
        </div>
      </div>

      {isCustomBrand && (
        <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: 'linear-gradient(135deg, rgba(95, 143, 255, 0.08) 0%, rgba(52, 211, 153, 0.06) 100%)', border: '1px solid rgba(95, 143, 255, 0.2)' }}>
          <Sparkles size={16} className="text-relay-accent flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-relay-accent">Independent Brand Boost active</p>
            <p className="text-xs text-white/50 mt-0.5">This post will get boosted visibility because it links to an approved independent brand listing.</p>
          </div>
        </div>
      )}

      <button
        onClick={onPublish}
        disabled={!canPublish}
        className="w-full flex items-center justify-center gap-2 bg-relay-accent hover:bg-relay-accent-light disabled:opacity-40 disabled:cursor-not-allowed text-relay-bg font-semibold py-3 rounded-xl transition-all"
      >
        {publishingPost ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Publishing...
          </>
        ) : (
          <>
            <Send size={18} /> Publish Post
          </>
        )}
      </button>
    </div>
  );
}
