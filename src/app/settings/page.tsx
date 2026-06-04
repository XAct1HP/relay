"use client"

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { Clock, CheckCircle, XCircle, Upload } from 'lucide-react'

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
  const [stripeLoading, setStripeLoading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [instagramUrl, setInstagramUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [sellerApplicationStatus, setSellerApplicationStatus] = useState<string | null>(null)
  const [customerMessagingEnabled, setCustomerMessagingEnabled] = useState(false)
  const [vacationModeEnabled, setVacationModeEnabled] = useState(false)
  const [offersEnabled, setOffersEnabled] = useState(false)

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
          setStripeConnected(true)
        }
      }

      setEmail(currentUser!.email || '')
      setLoading(false)
    }

    loadProfile()
  }, [currentUser?.id])

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

  if (loading) {
    return (
      <div className="text-center text-white/40 py-12">Loading...</div>
    )
  }

  const isApprovedSeller = sellerApplicationStatus === 'approved' && currentUser?.role === 'seller'

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="space-y-2 mb-8">
        <p className="relay-eyebrow text-relay-accent">ACCOUNT</p>
        <h1 className="relay-title">Settings</h1>
      </div>

      {/* Content */}
      <div>
        {/* Profile Information */}
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">Profile Information</h2>

          <div className="space-y-6">
            {/* Avatar */}
            <div>
              <label className="block text-white/70 text-sm font-medium mb-3">Avatar</label>
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
              <label className="block text-white/70 text-sm font-medium mb-2">
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
              <label className="block text-white/70 text-sm font-medium mb-2">Email</label>
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
              <label className="block text-white/70 text-sm font-medium mb-2">
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

        {/* Password */}
        <div className="bg-white/[0.04] backdrop-blur-xl rounded-[1.5rem] border border-white/10 p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">Password</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-white/70 text-sm font-medium mb-2">
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
              <label className="block text-white/70 text-sm font-medium mb-2">
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
              <label className="block text-white/70 text-sm font-medium mb-2">
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

        {/* Notifications */}
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

        {isApprovedSeller && (
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

        {/* Connected Accounts — only show for sellers or users with an active seller application */}
        {(currentUser?.role === 'seller' || currentUser?.role === 'admin' || (sellerApplicationStatus && sellerApplicationStatus !== 'none')) && (
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
                    <p className="text-white/50 text-sm">
                      {stripeConnected ? 'Connected' : 'Not connected'}
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
                  <span className="px-4 py-2 rounded-lg font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                    Connected
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="bg-red-500/10 backdrop-blur-xl rounded-[1.5rem] border border-red-500/30 p-8">
          <h2 className="text-xl font-semibold text-red-300 mb-4">Danger Zone</h2>
          <p className="text-white/60 text-sm mb-6">
            Deleting your account is permanent and cannot be undone. All your data will be
            deleted.
          </p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-6 py-2 bg-red-500/20 text-red-300 hover:bg-red-500/30 font-medium rounded-lg transition-colors border border-red-500/30"
          >
            Delete Account
          </button>
        </div>

        {/* Save Changes */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleSaveChanges}
            disabled={saving}
            className="px-6 py-2 bg-[#5f8fff] hover:bg-[#7ca6ff] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="px-6 py-2 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] font-medium rounded-lg transition-colors border border-white/10"
          >
            Cancel
          </button>
        </div>
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
