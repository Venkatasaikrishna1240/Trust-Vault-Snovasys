import { createClient } from '@supabase/supabase-js'

// Public values only (URL + anon key). A service-role key must never be used here.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'http://localhost:54321'
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing-anon-key'
export const isConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
})
