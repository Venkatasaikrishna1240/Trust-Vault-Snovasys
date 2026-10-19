import { render, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth } from '../features/auth/guards'
import { authValue, Providers } from './helpers'

const tree = (
  <Routes>
    <Route path="/login" element={<p>login page</p>} />
    <Route element={<RequireAuth />}>
      <Route path="/secret" element={<p>secret page</p>} />
      <Route element={<RequireAdmin />}><Route path="/admin" element={<p>admin page</p>} /></Route>
    </Route>
  </Routes>
)

describe('auth guard', () => {
  it('redirects to /login when signed out', () => {
    render(<Providers route="/secret" auth={authValue({ session: null, profile: null })}>{tree}</Providers>)
    expect(screen.getByText('login page')).toBeInTheDocument()
    expect(screen.queryByText('secret page')).not.toBeInTheDocument()
  })
  it('renders protected content when signed in', () => {
    render(<Providers route="/secret">{tree}</Providers>)
    expect(screen.getByText('secret page')).toBeInTheDocument()
  })
  it('shows access denied for non-admins on admin routes', () => {
    render(<Providers route="/admin">{tree}</Providers>)
    expect(screen.getByText('Access denied')).toBeInTheDocument()
  })
  it('allows admins', () => {
    render(<Providers route="/admin" auth={authValue({}, 'admin')}>{tree}</Providers>)
    expect(screen.getByText('admin page')).toBeInTheDocument()
  })
})
