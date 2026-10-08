// Device notifications for Smart Reminders (PWA).
// - Asks for notification permission once (called from App boot, i.e. right
//   after install / first open), so phones & desktops can show reminders.
// - Sends a local notification per urgent reminder, de-duplicated per day.

const ASKED_KEY = 'efesms_notify_asked'
const SENT_KEY = 'efesms_notify_sent'

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function ensureNotificationPermission(): Promise<NotificationPermission | null> {
  if (!notificationsSupported()) return null
  try {
    if (Notification.permission === 'granted') return 'granted'
    if (Notification.permission === 'denied') return 'denied'
    const result = await Notification.requestPermission()
    try { localStorage.setItem(ASKED_KEY, new Date().toISOString()) } catch { /* ignore */ }
    return result
  } catch {
    return null
  }
}

function sentToday(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SENT_KEY) || '{}') } catch { return {} }
}

function markSent(key: string) {
  try {
    const m = sentToday()
    m[key] = new Date().toISOString().slice(0, 10)
    localStorage.setItem(SENT_KEY, JSON.stringify(m))
  } catch { /* ignore */ }
}

export function notifyReminder(title: string, body: string, tag: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false
  const today = new Date().toISOString().slice(0, 10)
  const m = sentToday()
  if (m[tag] === today) return false // already buzzed about this one today
  try {
    const n = new Notification(title, { body, tag } as NotificationOptions)
    n.onclick = () => {
      try { window.focus() } catch { /* ignore */ }
      n.close()
    }
    markSent(tag)
    return true
  } catch {
    return false
  }
}

export function notifyUrgentReminders(reminders: { category: string; severity: string; message: string; entityId?: number | null }[]) {
  let sent = 0
  for (const r of reminders) {
    if (r.severity !== 'Critical' && r.severity !== 'High') continue
    const tag = `efesms-${r.category}-${r.entityId ?? 0}-${r.message.slice(0, 40)}`
    if (notifyReminder(`EFESMS · ${r.category} (${r.severity})`, r.message, tag)) sent += 1
  }
  return sent
}
