'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/lib/supabase';
import { Camera, Palette, User, MapPin, Edit3, Check, X, Eye, Upload, Send } from 'lucide-react';

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
  {
    id: 'blue', name: 'Default',
    accent: '#5f8fff', accentLight: '#7ca6ff',
    cardBg: 'rgba(95, 143, 255, 0.04)', cardBorder: 'rgba(95, 143, 255, 0.15)',
    bannerGradient: 'linear-gradient(135deg, rgba(95, 143, 255, 0.15) 0%, rgba(124, 166, 255, 0.05) 100%)',
    textHighlight: '#7ca6ff',
  },
  {
    id: 'emerald', name: 'Emerald',
    accent: '#34d399', accentLight: '#6ee7b7',
    cardBg: 'rgba(52, 211, 153, 0.04)', cardBorder: 'rgba(52, 211, 153, 0.15)',
    bannerGradient: 'linear-gradient(135deg, rgba(52, 211, 153, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)',
    textHighlight: '#6ee7b7',
  },
  {
    id: 'purple', name: 'Purple',
    accent: '#a78bfa', accentLight: '#c4b5fd',
    cardBg: 'rgba(167, 139, 250, 0.04)', cardBorder: 'rgba(167, 139, 250, 0.15)',
    bannerGradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.15) 0%, rgba(139, 92, 246, 0.05) 100%)',
    textHighlight: '#c4b5fd',
  },
  {
    id: 'rose', name: 'Rose',
    accent: '#fb7185', accentLight: '#fda4af',
    cardBg: 'rgba(251, 113, 133, 0.04)', cardBorder: 'rgba(251, 113, 133, 0.15)',
    bannerGradient: 'linear-gradient(135deg, rgba(251, 113, 133, 0.15) 0%, rgba(244, 63, 94, 0.05) 100%)',
    textHighlight: '#fda4af',
  },
  {
    id: 'amber', name: 'Amber',
    accent: '#fbbf24', accentLight: '#fcd34d',
    cardBg: 'rgba(251, 191, 36, 0.04)', cardBorder: 'rgba(251, 191, 36, 0.15)',
    bannerGradient: 'linear-gradient(135deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.05) 100%)',
    textHighlight: '#fcd34d',
  },
  {
    id: 'cyan', name: 'Cyan',
    accent: '#22d3ee', accentLight: '#67e8f9',
    cardBg: 'rgba(34, 211, 238, 0.04)', cardBorder: 'rgba(34, 211, 238, 0.15)',
    bannerGradient: 'linear-gradient(135deg, rgba(34, 211, 238, 0.15) 0%, rgba(6, 182, 212, 0.05) 100%)',
    textHighlight: '#67e8f9',
  },
  {
    id: 'sunset', name: 'Sunset',
    accent: '#f97316', accentLight: '#fb923c',
    cardBg: 'rgba(249, 115, 22, 0.04)', cardBorder: 'rgba(249, 115, 22, 0.15)',
    bannerGradient: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(234, 88, 12, 0.08) 50%, rgba(251, 113, 133, 0.05) 100%)',
    textHighlight: '#fb923c',
  },
  {
    id: 'midnight', name: 'Midnight',
    accent: '#818cf8', accentLight: '#a5b4fc',
    cardBg: 'rgba(129, 140, 248, 0.04)', cardBorder: 'rgba(129, 140, 248, 0.12)',
    bannerGradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(67, 56, 202, 0.08) 100%)',
    textHighlight: '#a5b4fc',
  },
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
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [address, setAddress] = useState({
    street: '',
    street2: '',
    city: '',
    state: '',
    zip: '',
    country: '',
  });

  useEffect(() => {
    async function loadProfile() {
      if (!currentUser?.id) return;

      const supabase = createClient();
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (data) {
        setDisplayName(data.display_name || '');
        setShopName(data.shop_name || '');
        setBio(data.bio || '');
        setUsername(data.username || '');
        setEmail(currentUser.email || '');
        if (data.profile_theme) setSelectedTheme(data.profile_theme);
        if (data.avatar_url) setAvatarPreview(data.avatar_url);
        if (data.profile_banner_url) setBannerPreview(data.profile_banner_url);
        if (data.ship_from_address) {
          setAddress(data.ship_from_address);
        }
      }
      setLoading(false);
    }

    loadProfile();
  }, [currentUser?.id]);

  const [hasChanges, setHasChanges] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setBannerPreview(event.target?.result as string);
        setHasChanges(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarPreview(event.target?.result as string);
        setHasChanges(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUsernameChange = async (value: string) => {
    setUsername(value);
    setHasChanges(true);

    if (value.length < 3 || value.includes(' ')) {
      setUsernameAvailable(false);
      return;
    }

    // Check availability from Supabase
    const supabase = createClient();
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', value)
      .neq('id', currentUser?.id || '')
      .single();

    setUsernameAvailable(!data);
  };

  const handleAddressChange = (field: keyof typeof address, value: string) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleThemeSelect = (themeId: string) => {
    setSelectedTheme(themeId);
    setHasChanges(true);
  };

  const handleSaveChanges = async () => {
    if (!currentUser?.id) return;

    setSaving(true);
    setSaveSuccess(false);

    try {
      const supabase = createClient();
      const profileUpdates: Record<string, any> = {
        display_name: displayName,
        shop_name: shopName,
        bio: bio,
        username: username,
        ship_from_address: address,
        profile_theme: selectedTheme,
      };

      // Upload banner if changed (data URL means it's a new local file)
      if (bannerPreview && bannerPreview.startsWith('data:')) {
        const bannerBlob = await fetch(bannerPreview).then((r) => r.blob());
        const bannerPath = `${currentUser.id}/banner-${Date.now()}.jpg`;
        const { error: bannerError } = await supabase.storage
          .from('profile-images')
          .upload(bannerPath, bannerBlob, { upsert: true });

        if (!bannerError) {
          const { data: bannerUrl } = supabase.storage
            .from('profile-images')
            .getPublicUrl(bannerPath);
          profileUpdates.profile_banner_url = bannerUrl.publicUrl;
          setBannerPreview(bannerUrl.publicUrl);
        }
      }

      // Upload avatar if changed
      if (avatarPreview && avatarPreview.startsWith('data:')) {
        const avatarBlob = await fetch(avatarPreview).then((r) => r.blob());
        const avatarPath = `${currentUser.id}/avatar-${Date.now()}.jpg`;
        const { error: avatarError } = await supabase.storage
          .from('profile-images')
          .upload(avatarPath, avatarBlob, { upsert: true });

        if (!avatarError) {
          const { data: avatarUrl } = supabase.storage
            .from('profile-images')
            .getPublicUrl(avatarPath);
          profileUpdates.avatar_url = avatarUrl.publicUrl;
          setAvatarPreview(avatarUrl.publicUrl);
        }
      }

      // Update profile in database
      const { error } = await supabase
        .from('profiles')
        .update(profileUpdates)
        .eq('id', currentUser.id);

      if (error) throw error;

      // Update local auth state so the rest of the app reflects changes
      await updateProfile(profileUpdates);

      setHasChanges(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = async () => {
    if (!currentUser?.id) return;

    const supabase = createClient();
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentUser.id)
      .single();

    if (data) {
      setDisplayName(data.display_name || '');
      setShopName(data.shop_name || '');
      setBio(data.bio || '');
      setUsername(data.username || '');
      if (data.profile_theme) setSelectedTheme(data.profile_theme);
      if (data.avatar_url) setAvatarPreview(data.avatar_url);
      if (data.profile_banner_url) setBannerPreview(data.profile_banner_url);
      if (data.ship_from_address) {
        setAddress(data.ship_from_address);
      }
    }

    setHasChanges(false);
  };

  const activeTheme = THEMES.find((t) => t.id === selectedTheme) || THEMES[0];
  const selectedThemeColor = activeTheme.accent;

  return (
    <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="space-y-2 mb-8">
          <p className="relay-eyebrow text-relay-accent">CUSTOMIZE</p>
          <h1 className="relay-title">Profile Studio</h1>
        </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Section - Editing */}
            <div className="lg:col-span-2 space-y-8">
              {/* Section 1 - Branding */}
              <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                  <Camera size={24} className="text-relay-accent" />
                  Branding
                </h2>

                {/* Banner Upload */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-3">Banner Image</label>
                  <div
                    className="relative w-full aspect-video rounded-xl border-2 border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-colors flex items-center justify-center overflow-hidden group"
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    {bannerPreview ? (
                      <img
                        src={bannerPreview}
                        alt="Banner preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(95, 143, 255, 0.1) 0%, rgba(124, 166, 255, 0.05) 100%)' }}>
                        <div className="text-center">
                          <Upload className="mx-auto mb-3 text-relay-accent" size={32} />
                          <p className="text-sm font-semibold">Click to upload banner</p>
                          <p className="text-xs text-white/50">16:5 aspect ratio recommended</p>
                        </div>
                      </div>
                    )}
                    <input
                      ref={bannerInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleBannerUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {/* Avatar Upload */}
                <div className="mb-8">
                  <label className="block text-sm font-semibold mb-3">Avatar</label>
                  <div className="flex items-center gap-6">
                    <div
                      className="relative h-32 w-32 rounded-full border-4 border-white/10 bg-gradient-to-br from-relay-accent-light to-relay-accent flex-shrink-0 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity overflow-hidden group"
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt="Avatar preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-3xl font-bold text-relay-bg">PK</div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera size={32} className="text-white" />
                      </div>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                      />
                    </div>
                    <div>
                      <p className="text-sm text-white/60">Square image recommended (128px)</p>
                      <p className="text-xs text-white/40 mt-2">Click to change your profile picture</p>
                    </div>
                  </div>
                </div>

                {/* Display Name */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold mb-2">Display Name</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => {
                      setDisplayName(e.target.value);
                      setHasChanges(true);
                    }}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                    placeholder="Your shop name"
                  />
                </div>

                {/* Shop Name */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold mb-2">Shop Name</label>
                  <input
                    type="text"
                    value={shopName}
                    onChange={(e) => {
                      setShopName(e.target.value);
                      setHasChanges(true);
                    }}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                    placeholder="Your shop name"
                  />
                </div>

                {/* Bio */}
                <div>
                  <label className="block text-sm font-semibold mb-2">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => {
                      setBio(e.target.value.slice(0, 200));
                      setHasChanges(true);
                    }}
                    maxLength={200}
                    rows={3}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors resize-none"
                    placeholder="Tell buyers about your shop..."
                  />
                  <p className="text-xs text-white/50 mt-2">
                    {bio.length}/200 characters
                  </p>
                </div>
              </div>

              {/* Section 2 - Account */}
              <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                  <User size={24} className="text-relay-accent" />
                  Account
                </h2>

                {/* Username */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold mb-2">Username</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => handleUsernameChange(e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 pr-10 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                      placeholder="username"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {usernameAvailable === true && (
                        <Check size={20} className="text-green-400" />
                      )}
                      {usernameAvailable === false && (
                        <X size={20} className="text-red-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-semibold mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2 text-white/50 cursor-not-allowed opacity-60"
                  />
                  <p className="text-xs text-white/50 mt-2">Contact support to change email</p>
                </div>
              </div>

              {/* Section 3 - Color Theme */}
              <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                  <Palette size={24} className="text-relay-accent" />
                  Color Theme
                </h2>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {THEMES.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => handleThemeSelect(theme.id)}
                      className={`relative p-3 rounded-xl border-2 transition-all ${
                        selectedTheme === theme.id
                          ? 'border-white/40 bg-white/[0.08]'
                          : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                      style={selectedTheme === theme.id ? { borderColor: theme.accent } : undefined}
                    >
                      {/* Mini preview card */}
                      <div className="rounded-lg overflow-hidden mb-2" style={{ background: theme.bannerGradient, height: '28px' }} />
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-5 h-5 rounded-full" style={{ backgroundColor: theme.accent }} />
                        <div className="flex-1 h-2 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.cardBorder}` }} />
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.accentLight }} />
                        <p className="text-xs font-semibold" style={{ color: theme.textHighlight }}>{theme.name}</p>
                      </div>
                      {selectedTheme === theme.id && (
                        <div className="absolute top-1.5 right-1.5">
                          <Check size={16} style={{ color: theme.accent }} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 4 - Ship From Address */}
              <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                  <MapPin size={24} className="text-relay-accent" />
                  Ship From Address
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <input
                    type="text"
                    value={address.street}
                    onChange={(e) => handleAddressChange('street', e.target.value)}
                    placeholder="Street address"
                    className="bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                  />
                  <input
                    type="text"
                    value={address.street2}
                    onChange={(e) => handleAddressChange('street2', e.target.value)}
                    placeholder="Apt, Suite, etc. (optional)"
                    className="bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => handleAddressChange('city', e.target.value)}
                    placeholder="City"
                    className="bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                  />
                  <input
                    type="text"
                    value={address.state}
                    onChange={(e) => handleAddressChange('state', e.target.value)}
                    placeholder="State"
                    className="bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                  />
                  <input
                    type="text"
                    value={address.zip}
                    onChange={(e) => handleAddressChange('zip', e.target.value)}
                    placeholder="ZIP code"
                    className="bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                  />
                  <input
                    type="text"
                    value={address.country}
                    onChange={(e) => handleAddressChange('country', e.target.value)}
                    placeholder="Country"
                    className="bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors"
                  />
                </div>
              </div>

              {/* Section 5 - Create Post */}
              <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                  <Edit3 size={24} className="text-relay-accent" />
                  Create Post
                </h2>

                <div className="mb-6">
                  <textarea
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Share what's new with your customers..."
                    rows={4}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2 text-relay-text placeholder-white/30 focus:outline-none focus:border-relay-accent transition-colors resize-none"
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-semibold mb-3">Images (up to 4)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((index) => (
                      <div
                        key={index}
                        className="aspect-square rounded-lg border-2 border-dashed border-white/20 bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-colors flex items-center justify-center"
                      >
                        <div className="text-center">
                          <Upload size={24} className="mx-auto mb-2 text-white/50" />
                          <p className="text-xs text-white/50">Image {index}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-white/[0.02] border border-white/10 rounded-lg mb-6">
                  <p className="text-xs text-white/60">
                    Posts appear on your profile and in buyer feeds where they can help drive traffic to
                    your listings.
                  </p>
                </div>

                <button className="w-full flex items-center justify-center gap-2 bg-relay-accent hover:bg-relay-accent-light text-relay-bg font-semibold py-3 rounded-lg transition-colors">
                  <Send size={18} />
                  Publish Post
                </button>
              </div>
            </div>

            {/* Right Section - Preview */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <div className="bg-white/[0.04] backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-6 mb-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Eye size={20} className="text-relay-accent" />
                    <h3 className="font-semibold">Profile Preview</h3>
                  </div>

                  {/* Mini Banner */}
                  <div
                    className="h-24 w-full rounded-lg mb-4 bg-gradient-to-br"
                    style={{
                      backgroundImage: bannerPreview
                        ? `url(${bannerPreview})`
                        : 'linear-gradient(135deg, rgba(95, 143, 255, 0.1) 0%, rgba(124, 166, 255, 0.05) 100%)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />

                  {/* Mini Avatar */}
                  <div className="flex items-end gap-3 mb-4 -mt-4 relative z-10">
                    <div className="h-16 w-16 rounded-full border-3 border-relay-bg bg-gradient-to-br from-relay-accent-light to-relay-accent flex items-center justify-center flex-shrink-0">
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt="Avatar"
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-relay-bg">PK</span>
                      )}
                    </div>
                  </div>

                  {/* Mini Info */}
                  <h4 className="font-bold text-sm mb-1">{displayName || 'Shop Name'}</h4>
                  <p className="text-xs text-white/50 mb-3">@{username || 'username'}</p>
                  <p className="text-xs text-relay-text line-clamp-3 mb-4">{bio}</p>

                  {/* Mini Stats */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-white/[0.04] rounded-lg p-2">
                      <p className="text-xs text-white/50">Rating</p>
                      <p className="text-sm font-bold">4.9/5</p>
                    </div>
                    <div className="bg-white/[0.04] rounded-lg p-2">
                      <p className="text-xs text-white/50">Sales</p>
                      <p className="text-sm font-bold">847</p>
                    </div>
                  </div>

                  {/* Color preview */}
                  <div className="space-y-2">
                    <div className="h-6 w-full rounded-lg" style={{ backgroundColor: activeTheme.accent }} />
                    <div className="h-6 w-full rounded-lg" style={{ background: activeTheme.bannerGradient }} />
                    <div className="flex gap-2">
                      <div className="flex-1 h-6 rounded-lg" style={{ backgroundColor: activeTheme.cardBg, border: `1px solid ${activeTheme.cardBorder}` }} />
                      <div className="flex-1 h-6 rounded-lg" style={{ backgroundColor: activeTheme.accentLight }} />
                    </div>
                  </div>
                  <p className="text-xs mt-2 text-center font-medium" style={{ color: activeTheme.textHighlight }}>{activeTheme.name} theme</p>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  {saveSuccess && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-center">
                      <p className="text-sm text-emerald-400 font-medium">Changes saved!</p>
                    </div>
                  )}
                  <button
                    onClick={handleSaveChanges}
                    disabled={!hasChanges || saving}
                    className="w-full bg-relay-accent hover:bg-relay-accent-light disabled:opacity-50 disabled:cursor-not-allowed text-relay-bg font-semibold py-3 rounded-lg transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={handleDiscardChanges}
                    disabled={!hasChanges || saving}
                    className="w-full bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed font-semibold py-3 rounded-lg transition-colors"
                  >
                    Discard Changes
                  </button>
                  {username && (
                    <a
                      href={`/profile/${username}`}
                      className="block w-full text-center bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] font-semibold py-3 rounded-lg transition-colors text-relay-accent"
                    >
                      View Public Profile
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
    </div>
  );
}
