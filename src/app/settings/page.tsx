"use client"

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { Clock, CheckCircle, XCircle, Upload, KeyRound, Copy, User, Shield, Bell, Store, Key, CreditCard, AlertTriangle, ChevronRight, ArrowLeft } from 'lucide-react'
import type { SellerApiKey } from '@/types'

interface GeneratedApiKeyState {
  value: string
  name: string
  prefix: string
}

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { currentUser, updateProfile } = useAuth()
  const [avatar, setAvatar] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [emailNotifications, setEmailNotifications] = useState({
    orders: true,
    messages: true,
    promotions: false,
  })
  const [stripeConnected, setStripeConnected] = useState(false)
  const [stripeVerificationStatus, setStripeVerificationStatus] = useState<string>('unverified')
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null)
  const [stripePayoutsEnabled, setStripePayoutsEnabled] = useState<boolean | null>(null)
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState<boolean | null>(null)
  const [stripeTransfersCapabilityStatus, setStripeTransfersCapabilityStatus] = useState<string>('unknown')
  const [stripeCanReceiveTransfers, setStripeCanReceiveTransfers] = useState(false)
  const [stripeLoading, setStripeLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [instagramUrl, setInstagramUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [sellerApplicationStatus, setSellerApplicationStatus] = useState<string | null>(null)
  const [customerMessagingEnabled, setCustomerMessagingEnabled] = useState(false)
  const [vacationModeEnabled, setVacationModeEnabled] = useState(false)
  const [offersEnabled, setOffersEnabled] = useState(false)
  const [apiKeys, setApiKeys] = useState<SellerApiKey[]>([])
  const [apiKeysLoading, setApiKeysLoading] = useState(false)
  const [apiKeyName, setApiKeyName] = useState('')
  const [apiKeySubmitting, setApiKeySubmitting] = useState(false)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
  const [generatedApiKey, setGeneratedApiKey] = useState<GeneratedApiKeyState | null>(null)
  const [apiKeyError, setApiKeyError] = useState('')
  const [apiKeySuccess, setApiKeySuccess] = useState('')
  const [activeSection, setActiveSection] = useState(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return 'menu'
    return 'profile'
  })

  // Handle return from Stripe onboarding
  useEffect(() => {
    if (searchParams.get('stripe_onboarded') === 'true') {
      setStripeConnected(true)
      // Clean up URL params
      router.replace('/settings', { scroll: false })
    }
  }, [searchParams, router])

  useEffect(() => {
    async function loadProfile() {
      if (!currentUser?.id) return

      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser!.id)
        .single()

      if (data) {
        setFullName(data.full_name || '')
        if (data.avatar_url) setAvatar(data.avatar_url)
        if (data.seller_application_status) setSellerApplicationStatus(data.seller_application_status)
        if (data.instagram_url) setInstagramUrl(data.instagram_url)
        setCustomerMessagingEnabled(!!data.customer_messaging_enabled)
        setVacationModeEnabled(!!data.vacation_mode_enabled)
        setOffersEnabled(!!data.offers_enabled)
        // Check if Stripe account is connected based on profile data
        if (data.stripe_account_id) {
          setStripeAccountId(data.stripe_account_id)
          setStripeConnected(!!data.stripe_connect_onboarding_complete)
          setStripeVerificationStatus(data.stripe_identity_verification_status || 'unverified')
          setStripePayoutsEnabled(
            typeof data.stripe_payouts_enabled === 'boolean' ? data.stripe_payouts_enabled : null
          )
          setStripeChargesEnabled(
            typeof data.stripe_charges_enabled === 'boolean' ? data.stripe_charges_enabled : null
          )
          setStripeTransfersCapabilityStatus(data.stripe_transfers_capability_status || 'unknown')
        }
      }

      setEmail(currentUser!.email || '')
      setLoading(false)
    }

    loadProfile()
  }, [currentUser?.id])

  useEffect(() => {
    async function syncStripeStatus() {
      if (!currentUser?.id || !(currentUser.role === 'seller' || (sellerApplicationStatus && sellerApplicationStatus !== 'none'))) {
        return
      }

      try {
        const response = await fetch('/api/stripe/connect/status', { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) return

        setStripeAccountId(payload.connectedAccountId || payload.stripeAccountId || null)
        setStripeConnected(!!payload.onboardingComplete)
        setStripeVerificationStatus(payload.verificationStatus || 'unverified')
        setStripePayoutsEnabled(
          typeof payload.payoutsEnabled === 'boolean' ? payload.payoutsEnabled : null
        )
        setStripeChargesEnabled(
          typeof payload.chargesEnabled === 'boolean' ? payload.chargesEnabled : null
        )
        setStripeTransfersCapabilityStatus(payload.transfersCapabilityStatus || 'unknown')
        setStripeCanReceiveTransfers(!!payload.canReceiveTransfers)
      } catch {
        // Ignore sync failures here and fall back to stored profile state.
      }
    }

    syncStripeStatus()
  }, [currentUser?.id, currentUser?.role, sellerApplicationStatus])

  useEffect(() => {
    async function loadApiKeys() {
      if (!currentUser?.id || currentUser.role !== 'seller' || sellerApplicationStatus !== 'approved') {
        setApiKeys([])
        setApiKeysLoading(false)
        return
      }

      setApiKeysLoading(true)
      setApiKeyError('')

      try {
        const response = await fetch('/api/seller/api-keys', { cache: 'no-store' })
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Failed to load API keys.')
        }

        setApiKeys(Array.isArray(result.apiKeys) ? result.apiKeys : [])
      } catch (error: any) {
        setApiKeyError(error.message || 'Failed to load API keys.')
      } finally {
        setApiKeysLoading(false)
      }
    }

    loadApiKeys()
  }, [currentUser?.id, currentUser?.role, sellerApplicationStatus])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onload = (event) => {
        setAvatar(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSaveChanges = async () => {
    if (!currentUser?.id) return
    setSaving(true)

    try {
      const supabase = createClient()
      let avatarUrl = currentUser!.avatar_url

      if (avatarFile) {
        const fileExt = avatarFile.name.split('.').pop()
        const filePath = `${currentUser!.id}/avatar.${fileExt}`

        const { error: uploadError } = await supabase.storage
          .from('profile-images')
          .upload(filePath, avatarFile, { upsert: true })

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('profile-images')
            .getPublicUrl(filePath)
          avatarUrl = urlData.publicUrl
        }
      }

      await updateProfile({
        full_name: fullName,
        avatar_url: avatarUrl,
        instagram_url: instagramUrl || null,
        customer_messaging_enabled: customerMessagingEnabled,
        vacation_mode_enabled: vacationModeEnabled,
        offers_enabled: offersEnabled,
      })

      setAvatarFile(null)
      alert('Settings saved successfully!')
    } catch (error) {
      console.error('Error saving settings:', error)
      alert('Error saving settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      alert('Passwords do not match')
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      alert('Error updating password: ' + error.message)
    } else {
      alert('Password updated successfully')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }

  const handleDeleteAccount = async () => {
    if (!currentUser?.id) return

    const supabase = createClient()
    await supabase
      .from('profiles')
      .update({ is_deleted: true })
      .eq('id', currentUser!.id)

    await supabase.auth.signOut()
  }

  const handleGenerateApiKey = async () => {
    if (!(sellerApplicationStatus === 'approved' && currentUser?.role === 'seller')) {
      setApiKeyError('Only approved sellers can generate Relay API keys.')
      return
    }

    setApiKeySubmitting(true)
    setApiKeyError('')
    setApiKeySuccess('')

    try {
      const response = await fetch('/api/seller/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: apiKeyName }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create API key.')
      }

      setGeneratedApiKey({
        value: result.apiKey,
        name: result.record?.name || apiKeyName.trim(),
        prefix: result.record?.key_prefix || '',
      })
      setApiKeys((prev) => [result.record, ...prev])
      setApiKeyName('')
      setApiKeySuccess('API key created. Copy it now — it will not be shown again.')
    } catch (error: any) {
      setApiKeyError(error.message || 'Failed to create API key.')
    } finally {
      setApiKeySubmitting(false)
    }
  }

  const handleRevokeApiKey = async (keyId: string) => {
    setRevokingKeyId(keyId)
    setApiKeyError('')
    setApiKeySuccess('')

    try {
      const response = await fetch(`/api/seller/api-keys/${keyId}/revoke`, {
        method: 'POST',
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to revoke API key.')
      }

      setApiKeys((prev) =>
        prev.map((key) =>
          key.id === keyId
            ? { ...key, revoked_at: result.record?.revoked_at || new Date().toISOString() }
            : key
        )
      )
      setApiKeySuccess('API key revoked successfully.')
    } catch (error: any) {
      setApiKeyError(error.message || 'Failed to revoke API key.')
    } finally {
      setRevokingKeyId(null)
    }
  }

  const handleCopyApiKey = async () => {
    if (!generatedApiKey?.value) return

    try {
      await navigator.clipboard.writeText(generatedApiKey.value)
      setApiKeySuccess('API key copied to clipboard.')
    } catch {
      setApiKeyError('Failed to copy the API key. Copy it manually before leaving this page.')
    }
  }

  const isApprovedSeller = sellerApplicationStatus === 'approved' && currentUser?.role === 'seller'

  if (loading) {
    return (
      <div className="text-center text-white/40 py-12">Loading...</div>
    )
  }

  const sections = [
    { id: 'profile', label: 'Profile' },
    { id: 'security', label: 'Security' },
    { id: 'notifications', label: 'Notifications' },
    ...(isApprovedSeller ? [{ id: 'seller', label: 'Seller' }] : []),
    ...(isApprovedSeller ? [{ id: 'api-keys', label: 'API Keys' }] : []),
    ...((currentUser?.role === 'seller' || currentUser?.role === 'admin' || (sellerApplicationStatus && sellerApplicationStatus !== 'none')) ? [{ id: 'accounts', label: 'Connected Accounts' }] : []),
    { id: 'danger', label: 'Danger Zone' },
  ]

  return (
    <div className="space-y-6 pb-20 lg:pb-0 overflow-auto h-[calc(100dvh-80px-env(safe-area-inset-bottom,0px))] lg:h-auto lg:overflow-visible">
      {/* Header */}
      <div className="space-y-2 mb-8">
        <p className="relay-eyebrow text-relay-accent">ACCOUNT</p>
        <h1 className="relay-title">Settings</h1>
        <p className="lg:hidden text-white/30 text-xs font-medium tracking-wider mb-3">SETTINGS</p>
      </div>

      {/* Section Tabs - Desktop */}
      <div className="hidden lg:flex gap-2 mb-8 overflow-x-auto scrollbar-hide flex-nowrap pb-2">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`px-4 py-2 rounded-full whitespace-nowrap font-medium transition-all text-sm ${
              activeSection === section.id
                ? 'bg-[#5f8fff] text-white'
                : 'bg-white/[0.04] text-white/60 border border-white/10 hover:bg-white/[0.08]'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Section Nav - Mobile */}
      <div className="lg:hidden mb-6">
        {activeSection !== 'menu' ? (
          <button
            onClick={() => setActiveSection('menu')}
            className="flex items-center gap-2 text-[#5f8fff] text-sm font-medium mb-4 active:opacity-70"
          >
            <ArrowLeft size={16} />
            All Settings
          </button>
        ) : (
          <div className="space-y-0.5">
            {sections.map((section) => {
              const iconMap: Record<string, React.ReactNode> = {
                profile: <User size={20} />,
                security: <Shield size={20} />,
                notifications: <Bell size={20} />,
                seller: <Store size={20} />,
                'api-keys': <Key size={20} />,
                accounts: <CreditCard size={20} />,
                danger: <AlertTriangle size={20} className="text-red-400" />,
              }
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className="w-full flex items-center gap-4 px-3 h-[52px] rounded-xl text-left active:bg-white/[0.06] transition-colors border-b border-white/[0.04] last:border-b-0"
                >
                  <span className={section.id === 'danger' ? 'text-red-400/70' : 'text-white/40'}>
                    {iconMap[section.id]}
                  </span>
                  <span className={`flex-1 text-sm font-medium ${section.id === 'danger' ? 'text-red-300' : 'text-white/80'}`}>
                    {section.label}
                  </span>
                  <ChevronRight size={16} className="text-white/20" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className={activeSection === 'menu' ? 'hidden' : ''}>
        {/* Profile Information */}
        {activeSection === 'profile' && (<>
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">Profile Information</h2>

          <div className="space-y-6">
            {/* Avatar */}
            <div>
              <label className="block text-white/70 text-xs lg:text-sm font-medium mb-3">Avatar</label>
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-white/5 flex-shrink-0">
                  {avatar && (
                    <img
                      src={avatar}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div>
                  <label className="inline-block px-4 py-2 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-medium rounded-lg cursor-pointer transition-colors">
                    Upload Photo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-white/50 text-xs mt-2">JPG, PNG or WebP. Max 10MB.</p>
                </div>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-white/70 text-xs lg:text-sm font-medium mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#5f8fff]/50 transition-colors"
                placeholder="Your name"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-white/70 text-xs lg:text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-lg text-white/50 cursor-not-allowed"
              />
              <p className="text-white/50 text-xs mt-2">Email cannot be changed</p>
            </div>

            {/* Instagram */}
            <div>
              <label className="block text-white/70 text-xs lg:text-sm font-medium mb-2">
                Instagram
              </label>
              <input
                type="text"
                value={instagramUrl}
                onChange={(e) => setInstagramUrl(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#5f8fff]/50 transition-colors"
                placeholder="@yourusername or full URL"
              />
              <p className="text-white/50 text-xs mt-2">Shown on your public profile</p>
            </div>
          </div>
        </div>

        {/* Seller Application Status */}
        {sellerApplicationStatus && sellerApplicationStatus !== 'none' ? (
          <div className={`backdrop-blur-xl rounded-[1.5rem] border p-8 mb-6 ${
            sellerApplicationStatus === 'approved'
              ? 'bg-green-500/[0.06] border-green-500/20'
              : sellerApplicationStatus === 'rejected'
              ? 'bg-red-500/[0.06] border-red-500/20'
              : 'bg-amber-500/[0.06] border-amber-500/20'
          }`}>
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-3">
              {sellerApplicationStatus === 'approved' && <CheckCircle size={22} className="text-green-400" />}
              {sellerApplicationStatus === 'pending' && <Clock size={22} className="text-amber-400" />}
              {sellerApplicationStatus === 'rejected' && <XCircle size={22} className="text-red-400" />}
              Seller Application
            </h2>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-white/60 text-sm">Status:</span>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                sellerApplicationStatus === 'approved'
                  ? 'bg-green-500/20 text-green-300 border-green-500/30'
                  : sellerApplicationStatus === 'rejected'
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {sellerApplicationStatus.charAt(0).toUpperCase() + sellerApplicationStatus.slice(1)}
              </span>
            </div>
            <p className="text-white/50 text-sm">
              {sellerApplicationStatus === 'pending' && 'Your seller application is being reviewed by our team. You will gain access to seller features once approved.'}
              {sellerApplicationStatus === 'approved' && 'Your seller application has been approved! You now have access to all seller features.'}
              {sellerApplicationStatus === 'rejected' && 'Your seller application was not approved. You may reapply below.'}
            </p>
            {sellerApplicationStatus === 'rejected' && (
              <button
                onClick={() => router.push('/onboarding')}
                className="mt-4 px-6 py-2 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-medium rounded-lg transition-colors"
              >
                Reapply as Seller
              </button>
            )}
          </div>
        ) : currentUser?.role === 'buyer' && (
          <div className="bg-[#5f8fff]/[0.06] backdrop-blur-xl rounded-[1.5rem] border border-[#5f8fff]/20 p-8 mb-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-3">
              <Upload size={22} className="text-[#5f8fff]" />
              Become a Seller
            </h2>
            <p className="text-white/50 text-sm mb-4">
              Want to start selling on Relay? Apply to become a verified seller and get access to listing tools, order management, and payouts.
            </p>
            <button
              onClick={() => router.push('/onboarding')}
              className="px-6 py-2 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-medium rounded-lg transition-colors"
            >
              Apply to Sell
            </button>
          </div>
        )}
        </>)}

        {/* Password */}
        {activeSection === 'security' && (
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">Password</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-white/70 text-xs lg:text-sm font-medium mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#5f8fff]/50 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-white/70 text-xs lg:text-sm font-medium mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#5f8fff]/50 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-white/70 text-xs lg:text-sm font-medium mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#5f8fff]/50 transition-colors"
                placeholder="••••••••"
              />
            </div>

            <button
              onClick={handlePasswordChange}
              className="px-6 py-2 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-medium rounded-lg transition-colors"
            >
              Update Password
            </button>
          </div>
        </div>
        )}

        {/* Notifications */}
        {activeSection === 'notifications' && (
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">Notifications</h2>

          <div className="space-y-4">
            {[
              {
                id: 'orders',
                label: 'Order Updates',
                description: 'Receive notifications about your orders',
              },
              {
                id: 'messages',
                label: 'Messages',
                description: 'Receive new message notifications',
              },
              {
                id: 'promotions',
                label: 'Promotions & News',
                description: 'Receive promotional emails and news',
              },
            ].map((notification) => (
              <div
                key={notification.id}
                className="flex items-center justify-between py-4 border-b border-white/10 last:border-b-0"
              >
                <div>
                  <p className="text-white font-medium">{notification.label}</p>
                  <p className="text-white/50 text-sm">{notification.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications[notification.id as keyof typeof emailNotifications]}
                    onChange={(e) =>
                      setEmailNotifications({
                        ...emailNotifications,
                        [notification.id]: e.target.checked,
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white/50 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5f8fff]"></div>
                </label>
              </div>
            ))}
          </div>
        </div>
        )}

        {activeSection === 'seller' && isApprovedSeller && (
          <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-8 mb-6">
            <h2 className="text-xl font-semibold text-white mb-6">Seller Settings</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-4 border-b border-white/10">
                <div>
                  <p className="text-white font-medium">Customer Messaging</p>
                  <p className="text-white/50 text-sm">
                    Let buyers start new conversations from your listings and profile
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customerMessagingEnabled}
                    onChange={(e) => setCustomerMessagingEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white/50 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5f8fff]"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-4 border-b border-white/10">
                <div>
                  <p className="text-white font-medium">Vacation Mode</p>
                  <p className="text-white/50 text-sm">
                    Keep listings visible while pausing checkout and new buyer messages
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vacationModeEnabled}
                    onChange={(e) => setVacationModeEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white/50 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5f8fff]"></div>
                </label>
              </div>

              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-white font-medium">Offers</p>
                  <p className="text-white/50 text-sm">
                    Let buyers interact with offer actions tied to your listings
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={offersEnabled}
                    onChange={(e) => setOffersEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white/50 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#5f8fff]"></div>
                </label>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'api-keys' && isApprovedSeller && (
          <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-8 mb-6">
            <div className="flex items-start gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-[#5f8fff]/15 border border-[#5f8fff]/25 flex items-center justify-center flex-shrink-0">
                <KeyRound size={22} className="text-[#7ca6ff]" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">API Keys</h2>
                <p className="text-white/50 text-sm mt-1">
                  Generate seller-scoped API keys for inventory integrations. Keys are shown once, and Relay only stores a hashed version.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 mb-6">
              <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
                <label className="flex-1">
                  <span className="block text-white/70 text-xs lg:text-sm font-medium mb-2">Key Name</span>
                  <input
                    type="text"
                    value={apiKeyName}
                    onChange={(e) => setApiKeyName(e.target.value)}
                    className="w-full px-4 py-3 bg-white/[0.04] border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-[#5f8fff]/50 transition-colors"
                    placeholder="KNET primary sync"
                    maxLength={80}
                  />
                </label>
                <button
                  onClick={handleGenerateApiKey}
                  disabled={apiKeySubmitting}
                  className="px-6 py-3 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {apiKeySubmitting ? 'Generating...' : 'Generate API Key'}
                </button>
              </div>
              <p className="text-white/40 text-xs mt-3">
                Preview and staging keys begin with <span className="text-white/60">relay_sk_test_</span>. Production keys begin with <span className="text-white/60">relay_sk_live_</span>.
              </p>
            </div>

            {generatedApiKey && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 mb-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div>
                    <p className="text-amber-300 font-semibold">Copy This API Key Now</p>
                    <p className="text-amber-100/80 text-sm mt-1">
                      This secret will not be shown again after you leave or refresh this page.
                    </p>
                  </div>
                  <button
                    onClick={handleCopyApiKey}
                    className="px-4 py-2 rounded-lg bg-white/[0.08] text-white hover:bg-white/[0.12] border border-white/10 transition-colors inline-flex items-center gap-2"
                  >
                    <Copy size={16} />
                    Copy Key
                  </button>
                </div>
                <p className="text-amber-100/70 text-xs mt-4 mb-2">
                  {generatedApiKey.name} · {generatedApiKey.prefix}...
                </p>
                <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 overflow-x-auto">
                  <p className="text-white font-mono text-sm break-all">{generatedApiKey.value}</p>
                </div>
              </div>
            )}

            {apiKeyError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 mb-4">
                <p className="text-sm text-red-300">{apiKeyError}</p>
              </div>
            )}

            {apiKeySuccess && (
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 mb-4">
                <p className="text-sm text-green-300">{apiKeySuccess}</p>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-white font-medium">Existing API Keys</h3>
              {apiKeysLoading ? (
                <p className="text-white/40 text-sm">Loading API keys...</p>
              ) : apiKeys.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5">
                  <p className="text-white/60 text-sm">No API keys created yet.</p>
                </div>
              ) : (
                apiKeys.map((apiKey) => {
                  const isRevoked = !!apiKey.revoked_at

                  return (
                    <div
                      key={apiKey.id}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <p className="text-white font-medium">{apiKey.name}</p>
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                              isRevoked
                                ? 'bg-red-500/15 text-red-300 border-red-500/25'
                                : 'bg-green-500/15 text-green-300 border-green-500/25'
                            }`}
                          >
                            {isRevoked ? 'Revoked' : 'Active'}
                          </span>
                        </div>
                        <p className="text-white/65 text-sm font-mono">{apiKey.key_prefix}...</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/40">
                          <span>Created {new Date(apiKey.created_at).toLocaleString()}</span>
                          <span>
                            Last used {apiKey.last_used_at ? new Date(apiKey.last_used_at).toLocaleString() : 'Never'}
                          </span>
                          {isRevoked && (
                            <span>Revoked {new Date(apiKey.revoked_at as string).toLocaleString()}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <button
                          onClick={() => handleRevokeApiKey(apiKey.id)}
                          disabled={isRevoked || revokingKeyId === apiKey.id}
                          className="px-4 py-2 bg-red-500/15 text-red-300 hover:bg-red-500/25 font-medium rounded-lg transition-colors border border-red-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {revokingKeyId === apiKey.id ? 'Revoking...' : isRevoked ? 'Revoked' : 'Revoke'}
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Connected Accounts — only show for sellers or users with an active seller application */}
        {activeSection === 'accounts' && (currentUser?.role === 'seller' || currentUser?.role === 'admin' || (sellerApplicationStatus && sellerApplicationStatus !== 'none')) && (
          <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-8 mb-6">
            <h2 className="text-xl font-semibold text-white mb-6">Connected Accounts</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#635BFF] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.918 3.757 7.076c0 4.72 2.891 6.442 6.029 7.744 2.098.868 2.913 1.571 2.913 2.607 0 1.028-.874 1.634-2.28 1.634-2.04 0-5.152-1.035-7.036-2.282l-.895 5.535C4.566 23.272 7.528 24 10.656 24c2.584 0 4.704-.706 6.184-1.957 1.592-1.34 2.403-3.244 2.403-5.503 0-4.784-2.95-6.473-5.267-7.39z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">Stripe</p>
                    {stripeAccountId && (
                      <div className="mt-2 space-y-1 text-xs text-white/45">
                        <p>Connected account: <span className="text-white/70">{stripeAccountId}</span></p>
                        <p>Transfers: <span className="text-white/70">{stripeTransfersCapabilityStatus.replaceAll('_', ' ')}</span></p>
                        <p>Payouts enabled: <span className="text-white/70">{stripePayoutsEnabled === null ? 'Unknown' : stripePayoutsEnabled ? 'Yes' : 'No'}</span></p>
                        <p>Charges enabled: <span className="text-white/70">{stripeChargesEnabled === null ? 'Unknown' : stripeChargesEnabled ? 'Yes' : 'No'}</span></p>
                        <p>Can receive Relay withdrawals: <span className="text-white/70">{stripeCanReceiveTransfers ? 'Yes' : 'Not yet'}</span></p>
                      </div>
                    )}
                    <p className="text-white/50 text-sm">
                      {stripeConnected ? `Connected · ${stripeVerificationStatus.replaceAll('_', ' ')}` : 'Not connected'}
                    </p>
                  </div>
                </div>
                {!stripeConnected ? (
                  <button
                    onClick={async () => {
                      setStripeLoading(true)
                      try {
                        const response = await fetch('/api/stripe/connect', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ returnTo: 'settings' }),
                        })
                        const data = await response.json()
                        if (!response.ok) throw new Error(data.error || 'Failed to connect Stripe')
                        if (data.url) {
                          window.location.href = data.url
                        }
                      } catch (err: any) {
                        alert(err.message || 'Failed to connect Stripe account')
                      } finally {
                        setStripeLoading(false)
                      }
                    }}
                    disabled={stripeLoading}
                    className="px-4 py-2 rounded-lg font-medium transition-colors bg-[#5f8fff] text-white hover:bg-[#7ca6ff] disabled:opacity-50"
                  >
                    {stripeLoading ? 'Connecting...' : 'Connect'}
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const response = await fetch('/api/stripe/dashboard', { method: 'POST' })
                          const data = await response.json()
                          if (!response.ok) throw new Error(data.error || 'Failed to open Stripe dashboard')
                          if (data.url) {
                            window.open(data.url, '_blank', 'noopener,noreferrer')
                          }
                        } catch (err: any) {
                          alert(err.message || 'Failed to open Stripe dashboard')
                        }
                      }}
                      className="px-4 py-2 rounded-lg font-medium transition-colors bg-white/[0.05] text-white hover:bg-white/[0.08] border border-white/10"
                    >
                      Manage in Stripe
                    </button>
                    <span className="px-4 py-2 rounded-lg font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                      Connected
                    </span>
                  </div>
                )}
              </div>
              {stripeAccountId && (
                <p className="text-white/45 text-sm">
                  Relay uses this Express account only as your withdrawal destination. Funds stay in Relay&apos;s platform balance until you request a withdrawal.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        {activeSection === 'danger' && (<>
        {/* Desktop danger zone */}
        <div className="hidden lg:block bg-red-500/10 backdrop-blur-xl rounded-[1.5rem] border border-red-500/30 p-8">
          <h2 className="text-xl font-semibold text-red-300 mb-4">Danger Zone</h2>
          <p className="text-white/60 text-sm mb-6">
            Deleting your account is permanent and cannot be undone. All your data will be
            deleted.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full sm:w-auto px-6 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 font-medium rounded-lg transition-colors border border-red-500/30"
          >
            Delete Account
          </button>
        </div>
        {/* Mobile danger zone - minimal */}
        <div className="lg:hidden pt-8 pb-12 text-center">
          <p className="text-white/40 text-xs mb-3">This action is permanent and cannot be undone.</p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-400/70 text-sm font-medium active:text-red-400"
          >
            Delete Account
          </button>
        </div>
        </>)}

        {/* Save Changes */}
        {(activeSection === 'profile' || activeSection === 'seller') && (
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleSaveChanges}
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => {
              setFullName(currentUser?.display_name || '')
              setAvatar(currentUser?.avatar_url || '')
              setAvatarFile(null)
              setCustomerMessagingEnabled(!!currentUser?.customer_messaging_enabled)
              setVacationModeEnabled(!!currentUser?.vacation_mode_enabled)
              setOffersEnabled(!!currentUser?.offers_enabled)
            }}
            className="w-full sm:w-auto px-6 py-2 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] font-medium rounded-lg transition-colors border border-white/10"
          >
            Cancel
          </button>
        </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1219] border border-white/10 rounded-[1.5rem] p-8 max-w-md w-full">
            <h3 className="text-2xl font-bold text-white mb-2">Delete Account?</h3>
            <p className="text-white/60 mb-6">
              This action cannot be undone. Your account and all associated data will be
              permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] font-medium rounded-lg transition-colors border border-white/10"
              >
                Cancel
              </button>              <button
                onClick={handleDeleteAccount}
                className="flex-1 px-4 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 font-medium rounded-lg transition-colors border border-red-500/30"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
