import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { getMyProfile } from '../../services/data'
import type { Profile } from '../../types'
import { signInErrorMessage, signUpErrorMessage } from './authErrors'

export interface AuthValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const currentUserId = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    let receivedAuthEvent = false
    const applySession = (nextSession: Session | null) => {
      const nextUserId = nextSession?.user.id ?? null
      if (nextUserId !== currentUserId.current) {
        currentUserId.current = nextUserId
        if (nextUserId) setLoading(true)
        setProfile(null)
        setSession(nextSession)
        if (!nextUserId) setLoading(false)
        return
      }
      setSession(nextSession)
      if (!nextUserId) setLoading(false)
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!active || receivedAuthEvent) return
      applySession(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      receivedAuthEvent = true
      applySession(nextSession)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    getMyProfile(userId)
      .then((p) => { if (active) setProfile(p) })
      .catch(() => { if (active) setProfile(null) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(signInErrorMessage(error))
  }, [])

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } })
    if (error) throw new Error(signUpErrorMessage(error))
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])

  const value = useMemo(() => ({ session, profile, loading, signIn, signUp, signOut }),
    [session, profile, loading, signIn, signUp, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
