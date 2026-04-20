import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Create a Supabase client for server-side operations
 * Used in API routes, server components, and server-side functions
 * DO NOT import this file from client components — use supabase.ts instead
 */
export async function createServerClientInstance() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Silently fail if cookies can't be set in server component context
          }
        },
      },
    }
  );
}
