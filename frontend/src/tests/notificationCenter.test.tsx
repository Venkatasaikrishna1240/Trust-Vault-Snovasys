import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from './helpers'
import { NotificationServiceError } from '../services/notifications'

const mocks = vi.hoisted(() => ({
  listMyNotifications: vi.fn(),
  markNotificationsRead: vi.fn(),
  unsubscribe: vi.fn(),
  onInsert: null as null | (() => void),
}))

vi.mock('../services/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/notifications')>()
  return {
    ...actual,
    listMyNotifications: mocks.listMyNotifications,
    markNotificationsRead: mocks.markNotificationsRead,
    subscribeToMyNotifications: (_userId: string, callback: () => void) => {
      mocks.onInsert = callback
      return mocks.unsubscribe
    },
  }
})

import NotificationCenter from '../components/NotificationCenter'

const shared = {
  id: 'notice-1',
  recipient_id: 'u1',
  document_id: 'document-1',
  actor_name: 'Owner A',
  document_title: 'Quarterly report.pdf',
  notification_type: 'document_shared' as const,
  created_at: '2026-10-20T10:00:00.000Z',
  read_at: null,
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    mocks.listMyNotifications.mockReset()
    mocks.markNotificationsRead.mockReset().mockResolvedValue(1)
    mocks.unsubscribe.mockReset()
    mocks.onInsert = null
  })

  it('shows stored notifications and marks an opened document notice read', async () => {
    mocks.listMyNotifications.mockResolvedValue({ notifications: [shared], unreadCount: 1 })
    render(
      <Providers>
        <NotificationCenter userId="u1" />
      </Providers>,
    )

    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    fireEvent.click(bell)
    const notice = await screen.findByRole('button', {
      name: /Owner A shared “Quarterly report\.pdf” with you/,
    })
    fireEvent.click(notice)

    await waitFor(() => expect(mocks.markNotificationsRead).toHaveBeenCalledWith(['notice-1']))
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument()
  })

  it('shows a toast only for a newly received notice, not for existing notices', async () => {
    const received = { ...shared, id: 'notice-2', notification_type: 'document_updated' as const }
    mocks.listMyNotifications
      .mockResolvedValueOnce({ notifications: [shared], unreadCount: 1 })
      .mockResolvedValueOnce({ notifications: [received, shared], unreadCount: 2 })
    render(
      <Providers>
        <NotificationCenter userId="u1" />
      </Providers>,
    )

    await screen.findByRole('button', { name: 'Notifications, 1 unread' })
    expect(screen.queryByText(/Owner A shared “Quarterly report\.pdf” with you/)).not.toBeInTheDocument()

    mocks.onInsert?.()
    expect(await screen.findByRole('status')).toHaveTextContent('Owner A updated “Quarterly report.pdf”.')
    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeInTheDocument()
  })

  it('explains when the notification database migration is missing', async () => {
    mocks.listMyNotifications.mockRejectedValue(
      new NotificationServiceError('relation missing', 'PGRST205'),
    )
    render(
      <Providers>
        <NotificationCenter userId="u1" />
      </Providers>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Notifications are not set up on this server yet. Please contact your administrator.',
    )
  })
})
