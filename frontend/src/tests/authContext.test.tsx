import { act, render, screen, waitFor } from '@testing-library/react'
import type { Session } from '@supabase/supabase-js'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '../types'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChange: vi.fn(),
  authListener: vi.fn(),
  getMyProfile: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      signOut: mocks.signOut,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}))

vi.mock('../services/data', () => ({ getMyProfile: mocks.getMyProfile }))

import { AuthProvider, useAuth } from '../features/auth/AuthContext'
import { RequireAuth } from '../features/auth/guards'

const makeSession = (id: string): Session => ({
  access_token: `${id}-token`,
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: `${id}-refresh`,
  user: {
    id,
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  },
})

function PrivatePage() {
  const { profile } = useAuth()
  return <p>{profile?.display_name} private data</p>
}

function SessionProbe({ snapshots }: { snapshots: { sessionId: string | null; profileId: string | null; loading: boolean }[] }) {
  const { session, profile, loading } = useAuth()
  snapshots.push({ sessionId: session?.user.id ?? null, profileId: profile?.id ?? null, loading })
  return null
}

describe('auth context account switching', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.signOut.mockReset()
    mocks.onAuthStateChange.mockReset()
    mocks.authListener.mockReset()
    mocks.getMyProfile.mockReset()
    mocks.onAuthStateChange.mockImplementation((callback) => {
      mocks.authListener.mockImplementation(callback)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
  })

  it('hides the previous account while loading a directly replaced session', async () => {
    const sessionA = makeSession('owner-a')
    const sessionB = makeSession('owner-b')
    const profileA: Profile = { id: 'owner-a', email: 'a@example.test', display_name: 'Owner A', role: 'owner' }
    const profileB: Profile = { id: 'owner-b', email: 'b@example.test', display_name: 'Owner B', role: 'owner' }
    let resolveProfileB: (profile: Profile | null) => void = () => {}
    const profileBRequest = new Promise<Profile | null>((resolve) => { resolveProfileB = resolve })
    const snapshots: { sessionId: string | null; profileId: string | null; loading: boolean }[] = []

    mocks.getSession.mockResolvedValue({ data: { session: sessionA } })
    mocks.getMyProfile.mockImplementation((id: string) =>
      id === profileA.id ? Promise.resolve(profileA) : profileBRequest,
    )

    render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthProvider>
          <SessionProbe snapshots={snapshots} />
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/private" element={<PrivatePage />} />
            </Route>
            <Route path="/login" element={<p>Login page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Owner A private data')).toBeInTheDocument()

    act(() => mocks.authListener('SIGNED_IN', sessionB))

    expect(screen.getByText('Loading session')).toBeInTheDocument()
    expect(screen.queryByText('Owner A private data')).not.toBeInTheDocument()
    expect(snapshots.some(({ sessionId, profileId }) => sessionId === 'owner-b' && profileId === 'owner-a')).toBe(false)

    await act(async () => { resolveProfileB(profileB) })

    await waitFor(() => expect(screen.getByText('Owner B private data')).toBeInTheDocument())
    expect(screen.queryByText('Owner A private data')).not.toBeInTheDocument()
  })

  it('signs out when the server reports that the current account is inactive', async () => {
    const session = makeSession('departed-user')
    mocks.getSession.mockResolvedValue({ data: { session } })
    mocks.getMyProfile.mockResolvedValue({
      id: 'departed-user',
      email: 'departed@example.test',
      display_name: 'Departed User',
      role: 'viewer',
      is_active: false,
    })
    mocks.signOut.mockResolvedValue({ error: null })

    render(
      <MemoryRouter initialEntries={['/private']}>
        <AuthProvider>
          <SessionProbe snapshots={[]} />
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/private" element={<PrivatePage />} />
            </Route>
            <Route path="/login" element={<p>Login page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1))
  })
})
