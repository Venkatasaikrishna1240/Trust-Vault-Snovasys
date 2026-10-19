import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthValue } from '../features/auth/AuthContext'
import { ToastProvider } from '../components/ui/Toast'
import type { Profile, Role } from '../types'

export function authValue(over: Partial<AuthValue> = {}, role: Role = 'viewer'): AuthValue {
  const profile: Profile = { id: 'u1', email: 'me@example.com', display_name: 'Me', role }
  return {
    session: { access_token: 't', user: { id: 'u1' } } as unknown as AuthValue['session'],
    profile, loading: false,
    signIn: async () => {}, signUp: async () => ({ needsConfirmation: false }), signOut: async () => {},
    ...over,
  }
}

export function Providers({ children, auth = authValue(), route = '/' }: { children: ReactNode; auth?: AuthValue; route?: string }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider><AuthContext.Provider value={auth}>{children}</AuthContext.Provider></ToastProvider>
    </MemoryRouter>
  )
}
