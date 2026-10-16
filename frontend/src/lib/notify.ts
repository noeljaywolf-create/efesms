// Browser notifications are grouped into a daily digest to avoid one alert per record.
const ASKED_KEY = 'efesms_notify_asked'
const SENT_KEY = 'efesms_notify_sent'

export type ReminderNotice = {
  category: string
  severity: string
  message: string
  daysUntilDue?: number
  entityId?: number | null
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | null> {
  if (!notificationsSupported()) return null
  try {
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    const result = await Notification.requestPermission()
    try { localStorage.setItem(ASKED_KEY, new Date().toISOString()) } catch { /* storage may be disabled */ }
    return result
  } catch {
    return null
  }
}

function sentToday(key: string) {
  try {
    const sent = JSON.parse(localStorage.getItem(SENT_KEY) || '{}') as Record<string, string>
    return sent[key] === new Date().toISOString().slice(0, 10)
  } catch { return false }
}

function markSent(key: string) {
  try {
    const sent = JSON.parse(localStorage.getItem(SENT_KEY) || '{}') as Record<string, string>
    sent[key] = new Date().toISOString().slice(0, 10)
    localStorage.setItem(SENT_KEY, JSON.stringify(sent))
  } catch { /* notification still works when storage is unavailable */ }
}

export async function notifyUrgentReminders(reminders: ReminderNotice[]) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  const urgent = reminders.filter((r) => r.severity === 'Critical' || r.severity === 'High' || (r.daysUntilDue ?? 0) < 0)
  if (!urgent.length) return false

  const key = `efesms-reminder-digest-${new Date().toISOString().slice(0, 10)}`
  if (sentToday(key)) return false
  const overdue = urgent.filter((r) => (r.daysUntilDue ?? 0) < 0).length
  const critical = urgent.filter((r) => r.severity === 'Critical').length
  const categories = [...new Set(urgent.map((r) => r.category))].slice(0, 3).join(', ')
  const body = `${urgent.length} urgent reminder${urgent.length === 1 ? '' : 's'}${overdue ? ` · ${overdue} overdue` : ''}${critical ? ` · ${critical} critical` : ''}${categories ? ` · ${categories}` : ''}`
  const options: NotificationOptions = {
    body,
    tag: key,
    icon: '/pwa-192x192.svg',
    badge: '/pwa-192x192.svg',
    data: { url: '/reminders' },
  }

  try {
    // Persistent service-worker notifications work better for installed PWAs.
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification('EFESMS · Smart reminders', options)
    } else {
      const notification = new Notification('EFESMS · Smart reminders', options)
      notification.onclick = () => { window.focus(); notification.close() }
    }
    markSent(key)
    return true
  } catch {
    return false
  }
}
