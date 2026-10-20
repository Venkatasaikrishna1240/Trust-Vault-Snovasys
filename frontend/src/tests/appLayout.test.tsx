import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AppLayout from '../layouts/AppLayout'
import { Providers } from './helpers'

vi.mock('../components/NotificationCenter', () => ({
  default: () => <button type="button" aria-label="Notifications">Notifications</button>,
}))

describe('AppLayout responsive shell', () => {
  it('stacks the mobile header above the main content until the desktop sidebar breakpoint', () => {
    render(
      <Providers>
        <AppLayout />
      </Providers>,
    )

    const main = screen.getByRole('main')
    const shell = main.closest('.min-h-screen')

    expect(shell).toHaveClass('flex-col', 'lg:flex-row')
    expect(screen.getByRole('banner').parentElement).toBe(shell)
    expect(main.parentElement?.parentElement).toBe(shell)
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument()
  })
})
