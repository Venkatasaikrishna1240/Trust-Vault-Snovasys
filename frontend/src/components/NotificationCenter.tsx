import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useToast } from './ui/Toast'
import { formatDateTime } from '../lib/format'
import {
  listMyNotifications,
  markNotificationsRead,
  NotificationServiceError,
  subscribeToMyNotifications,
  type UserNotification,
} from '../services/notifications'

function unavailableMessage(error: unknown): string {
  if (error instanceof NotificationServiceError && error.migrationRequired) {
    return 'Notifications are not set up on this server yet. Please contact your administrator.'
  }
  return 'Notifications are temporarily unavailable. Please try again later.'
}

function messageFor(notification: UserNotification) {
  if (notification.notification_type === 'document_updated') {
    return `${notification.actor_name} updated “${notification.document_title}”.`
  }
  return `${notification.actor_name} shared “${notification.document_title}” with you.`
}

export default function NotificationCenter({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<UserNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [unavailableMessageText, setUnavailableMessageText] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const knownIds = useRef(new Set<string>())
  const initialized = useRef(false)

  const refresh = useCallback(async (announceNew: boolean) => {
    const result = await listMyNotifications()
    if (!initialized.current) {
      result.notifications.forEach(({ id }) => knownIds.current.add(id))
      initialized.current = true
    } else if (announceNew) {
      for (const notification of result.notifications) {
        if (knownIds.current.has(notification.id)) continue
        knownIds.current.add(notification.id)
        toast.success(messageFor(notification))
      }
    }
    result.notifications.forEach(({ id }) => knownIds.current.add(id))
    setNotifications(result.notifications)
    setUnreadCount(result.unreadCount)
    setUnavailableMessageText(null)
  }, [toast])

  useEffect(() => {
    let active = true
    let unsubscribe = () => {}
    let timer: number | undefined
    const load = (announceNew: boolean) => {
      void refresh(announceNew).catch((error: unknown) => {
        if (active) {
          setUnavailableMessageText(unavailableMessage(error))
          console.error('Notification refresh failed:', error)
        }
      })
    }
    void refresh(false)
      .catch((error: unknown) => {
        if (active) {
          setUnavailableMessageText(unavailableMessage(error))
          console.error('Notification refresh failed:', error)
        }
      })
      .finally(() => {
        if (!active) return
        unsubscribe = subscribeToMyNotifications(userId, () => load(true))
        timer = window.setInterval(() => load(true), 30_000)
      })
    return () => {
      active = false
      if (timer !== undefined) window.clearInterval(timer)
      unsubscribe()
    }
  }, [refresh, userId])

  const openNotification = async (notification: UserNotification) => {
    if (!notification.read_at) {
      try {
        const updated = await markNotificationsRead([notification.id])
        const readAt = new Date().toISOString()
        setNotifications((current) => current.map((item) =>
          item.id === notification.id ? { ...item, read_at: readAt } : item,
        ))
        if (updated > 0) setUnreadCount((count) => Math.max(0, count - 1))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not mark notification as read.')
      }
    }
    setOpen(false)
    navigate(`/documents/${notification.document_id}`)
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    try {
      await markNotificationsRead()
      const readAt = new Date().toISOString()
      setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })))
      setUnreadCount(0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not mark notifications as read.')
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-4 text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-12 z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
              <p className="text-xs text-slate-500">{unreadCount} unread</p>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0 || markingAll}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Mark all read
            </button>
          </header>

          {unavailableMessageText ? (
            <p role="alert" className="p-4 text-sm text-rose-700">
              {unavailableMessageText}
            </p>
          ) : notifications.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">You’re all caught up.</p>
          ) : (
            <ul className="max-h-[min(70vh,28rem)] overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id} className="border-b border-slate-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                      notification.read_at ? 'bg-white' : 'bg-blue-50/60'
                    }`}
                  >
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                      notification.read_at ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'
                    }`}>
                      <FileText className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">{messageFor(notification)}</span>
                      <span className="mt-1 block text-xs text-slate-500">{formatDateTime(notification.created_at)}</span>
                    </span>
                    {!notification.read_at && (
                      <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
