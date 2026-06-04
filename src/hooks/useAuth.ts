'use client';

import { create } from 'zustand';
import { User } from '@/types';
import { createClient } from '@/lib/supabase';
import { buildFallbackUsername } from '@/lib/test-mode';

interface AuthState {
  currentUser: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role?: 'buyer' | 'seller') => Promise<void>;
  signOut: () => Promise<void>;
  fetchUser: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

async function ensureProfileExists(supabase: ReturnType<typeof createClient>, sessionUser: any) {
  const { data: existingProfile, error: existingError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sessionUser.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existingProfile) return existingProfile as User;

  const fullName =
    sessionUser.user_metadata?.full_name ||
    sessionUser.user_metadata?.name ||
    sessionUser.email?.split('@')[0] ||
    'Relay User';

  let insertError: any = null;
  for (let i = 0; i < 3; i++) {
    const { error } = await supabase.from('profiles').insert({
      id: sessionUser.id,
      email: sessionUser.email,
      full_name: fullName,
      username: buildFallbackUsername(sessionUser.email),
      role: 'buyer' as const,
      customer_messaging_enabled: false,
      vacation_mode_enabled: false,
      offers_enabled: false,
    });

    if (!error) {
      insertError = null;
      break;
    }

    insertError = error;
    if (
      String(error.message || '').toLowerCase().includes('duplicate') ||
      String(error.message || '').toLowerCase().includes('unique')
    ) {
      const { data: racedProfile, error: racedProfileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', sessionUser.id)
        .maybeSingle();

      if (racedProfileError) throw racedProfileError;
      if (racedProfile) return racedProfile as User;
    }

    if (!String(error.message || '').toLowerCase().includes('username')) {
      break;
    }
  }

  if (insertError) throw insertError;

  const { data: repairedProfile, error: repairedError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', sessionUser.id)
    .single();

  if (repairedError) throw repairedError;

  return repairedProfile as User;
}

/**
 * Zustand store for authentication state
 */
const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  isLoading: false,

  signIn: async (email: string, password: string) => {
    set({ isLoading: true });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Fetch user profile after login
      await useAuthStore.getState().fetchUser();

      // Check if there's an intended role from signup - redirect to onboarding if seller
      // Role will stay as buyer until admin approves the application
      if (typeof window !== 'undefined') {
        const intendedRole = localStorage.getItem('relay_intended_role');
        if (intendedRole === 'seller') {
          localStorage.removeItem('relay_intended_role');
          // Don't change role - just flag that they need onboarding
        }
      }
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email: string, password: string, fullName: string, role: 'buyer' | 'seller' = 'buyer') => {
    set({ isLoading: true });
    try {
      const supabase = createClient();
      // Always create with buyer role - seller role is granted after admin approval
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: 'buyer',
          },
        },
      });

      if (error) throw error;

      // Supabase can return an obfuscated "success" response for an email that
      // already exists in Auth. In that case no new Auth user is created.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error(
          'An account with this email already exists. Sign in instead. If you do not know the password, reset it in Supabase Auth or delete the existing Auth user in staging and sign up again.'
        );
      }

      // Store intended role for onboarding redirect (seller needs to go through application)
      if (role === 'seller' && typeof window !== 'undefined') {
        localStorage.setItem('relay_intended_role', 'seller');
      }

      // Fetch user profile after signup
      await useAuthStore.getState().fetchUser();
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      set({ currentUser: null });

      // Redirect to landing page after sign out
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Sign out error:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  fetchUser: async () => {
    set({ isLoading: true });
    try {
      const supabase = createClient();

      // Get the current session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session) {
        set({ currentUser: null });
        return;
      }

      const profile = await ensureProfileExists(supabase, session.user);
      set({ currentUser: profile });
    } catch (error) {
      console.error('Fetch user error:', error);
      set({ currentUser: null });
    } finally {
      set({ isLoading: false });
    }
  },

  updateProfile: async (updates: Partial<User>) => {
    set({ isLoading: true });
    try {
      const supabase = createClient();
      const currentUser = useAuthStore.getState().currentUser;

      if (!currentUser) throw new Error('No user logged in');

      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', currentUser!.id)
        .select()
        .single();

      if (error) throw error;

      set({ currentUser: data as User });
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
}));

/**
 * Custom React hook for authentication
 * Returns state and methods from zustand store
 */
export function useAuth() {
  const { currentUser, isLoading, signIn, signUp, signOut, fetchUser, updateProfile } =
    useAuthStore();

  return {
    currentUser,
    isLoading,
    signIn,
    signUp,
    signOut,
    fetchUser,
    updateProfile,
  };
}

export default useAuth;
