'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import useAuth from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, currentUser, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await signIn(email, password);

      // Small delay to let state update propagate
      await new Promise((r) => setTimeout(r, 100));

      // Re-read from Supabase directly for redirect decision
      const supabase = (await import('@/lib/supabase')).createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const { data: profile } = session ? await supabase
        .from('profiles')
        .select('role, seller_application_status')
        .eq('id', session.user.id)
        .single() : { data: null };

      const role = profile?.role;
      const sellerStatus = profile?.seller_application_status;

      // Check localStorage for intended role (from signup as seller)
      const intendedRole = typeof window !== 'undefined' ? localStorage.getItem('relay_intended_role') : null;

      // Redirect based on role and onboarding status
      if (intendedRole === 'seller' && (!sellerStatus || sellerStatus === 'none')) {
        // New seller signup - needs onboarding
        if (typeof window !== 'undefined') localStorage.removeItem('relay_intended_role');
        router.push('/onboarding');
      } else if (role === 'admin') {
        router.push('/dashboard');
      } else if (role === 'seller' && sellerStatus === 'approved') {
        // Only approved sellers go to dashboard
        router.push('/dashboard');
      } else {
        // Buyers, pending sellers, rejected sellers all go to marketplace
        router.push('/marketplace');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    }
  };

  return (
    <div className="relay-page flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center flex flex-col items-center">
          <Image
            src="/branding/logo-darkmode.png"
            alt="Relay"
            width={120}
            height={44}
            className="object-contain"
            priority
          />
          <p className="mt-3 text-sm text-white/60">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="relay-card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relay-input"
                required
                disabled={isLoading}
              />
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-white/80 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="relay-input"
                required
                disabled={isLoading}
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="relay-button-primary w-full mt-6"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Sign Up Link */}
          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-sm text-white/60">
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="text-white hover:text-white/80 font-medium transition-colors">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
