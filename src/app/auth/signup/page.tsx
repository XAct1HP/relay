'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useAuth from '@/hooks/useAuth';
import { ShoppingBag, Store } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const { signUp, isLoading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'buyer' | 'seller' | null>(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (!role) {
      setError('Please select a role');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      await signUp(email, password, fullName, role);

      if (role === 'seller') {
        router.push('/onboarding');
      } else {
        router.push('/marketplace');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
    }
  };

  return (
    <div className="relay-page flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Relay</h1>
          <p className="mt-2 text-sm text-white/60">Create your account</p>
        </div>

        {/* Card */}
        <div className="relay-card p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name Input */}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-white/80 mb-2">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="relay-input"
                required
                disabled={isLoading}
              />
            </div>

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

            {/* Confirm Password Input */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/80 mb-2">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="relay-input"
                required
                disabled={isLoading}
              />
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-sm font-medium text-white/80 mb-3">
                What would you like to do?
              </label>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setRole('buyer')}
                  disabled={isLoading}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    role === 'buyer'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                  }`}
                >
                  <ShoppingBag size={20} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">I&apos;m a Buyer</p>
                    <p className="text-xs text-white/60">Browse and buy sneakers</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('seller')}
                  disabled={isLoading}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    role === 'seller'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
                  }`}
                >
                  <Store size={20} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">I want to Sell</p>
                    <p className="text-xs text-white/60">List and sell your inventory</p>
                  </div>
                </button>
              </div>

              {role === 'seller' && (
                <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-xs text-amber-400">
                    Seller accounts require an application review before you can start listing.
                  </p>
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Sign Up Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="relay-button-primary w-full mt-6"
            >
              {isLoading ? 'Creating account...' : 'Sign Up'}
            </button>
          </form>

          {/* Sign In Link */}
          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-sm text-white/60">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-white hover:text-white/80 font-medium transition-colors">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
