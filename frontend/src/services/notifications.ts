import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type NotificationType = 'document_shared' | 'document_updated'

export interface UserNotification {
  id: string
  recipient_id: string
  document_id: string
  actor_name: string
  document_title: string
  notification_type: NotificationType
  created_at: string
  read_at: string | null
}

export interface NotificationList {
  notifications: UserNotification[]
  unreadCount: number
}

export class NotificationServiceError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
    this.name = 'NotificationServiceError'
  }

  get migrationRequired(): boolean {
    return this.code === 'PGRST205' || this.code === '42P01' || this.code === 'PGRST202'
  }
}

export async function listMyNotifications(): Promise<NotificationList> {
  const [items, count] = await Promise.all([
    supabase
      .from('user_notifications')
      .select('id,recipient_id,document_id,actor_name,document_title,notification_type,created_at,read_at')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),
  ])
  if (items.error) throw new NotificationServiceError(items.error.message || 'Could not load notifications.', items.error.code)
  if (count.error) throw new NotificationServiceError(count.error.message || 'Could not count unread notifications.', count.error.code)
  return {
    notifications: (items.data ?? []) as UserNotification[],
    unreadCount: count.count ?? 0,
  }
}

export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_ids: ids ?? null,
  })
  if (error) throw new NotificationServiceError(error.message || 'Could not update notifications.', error.code)
  return typeof data === 'number' ? data : 0
}

export function subscribeToMyNotifications(userId: string, onInsert: () => void): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`user-notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'user_notifications',
        filter: `recipient_id=eq.${userId}`,
      },
      onInsert,
    )
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}
