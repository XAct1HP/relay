import { createBrowserClient } from '@supabase/ssr';

/**
 * Create a Supabase client for client-side operations
 * Used in React components, hooks, and browser-side code
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export default createClient;
