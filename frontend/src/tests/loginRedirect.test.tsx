import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../features/auth/AuthContext'
import LoginPage from '../pages/LoginPage'
import { authValue } from './helpers'

describe('login redirect', () => {
  it('opens the dashboard after login even when login was reached from a shared document', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/documents/shared-id' } }]}>
        <AuthContext.Provider value={authValue()}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<p>Dashboard</p>} />
            <Route path="/documents/:id" element={<p>Shared document</p>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.queryByText('Shared document')).not.toBeInTheDocument()
  })
})
