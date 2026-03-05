export type ScheduleColor = 'blue' | 'yellow' | 'green'

export interface MajorEventItem {
  id: string
  title: string
  createdAt: string
}

export interface ScheduleEventItem {
  id: string
  title: string
  date: string // YYYY-MM-DD
  color: ScheduleColor
  createdAt: string
}

export interface EventsSnapshot {
  majorEvents: MajorEventItem[]
  scheduleEvents: ScheduleEventItem[]
}

export interface EventsRepository {
  getAll(): Promise<EventsSnapshot>
  addMajorEvent(title: string): Promise<MajorEventItem>
  updateMajorEvent(id: string, title: string): Promise<MajorEventItem>
  removeMajorEvent(id: string): Promise<void>
  addScheduleEvent(date: string, title: string, color: ScheduleColor): Promise<ScheduleEventItem>
  updateScheduleEvent(id: string, date: string, title: string, color: ScheduleColor): Promise<ScheduleEventItem>
  removeScheduleEvent(id: string): Promise<void>
}

const FALLBACK_EVENTS_API_URL = 'https://script.google.com/macros/s/AKfycbxQIRBA_Qsu_H1QTEIAOdgPT1K9f4fVwfj738ddToR6WwJGsnR6wDhwV9whVLROk1_X8g/exec'
const EVENTS_API_URL = (import.meta.env.VITE_EVENTS_API_URL as string | undefined) || FALLBACK_EVENTS_API_URL

interface ApiPayload {
  action:
    | 'getAll'
    | 'addMajorEvent'
    | 'updateMajorEvent'
    | 'removeMajorEvent'
    | 'addScheduleEvent'
    | 'updateScheduleEvent'
    | 'removeScheduleEvent'
  title?: string
  date?: string
  color?: ScheduleColor
  id?: string
}

interface ApiResponse {
  success: boolean
  data?: EventsSnapshot | MajorEventItem | ScheduleEventItem
  message?: string
}

function ensureApiUrl(): string {
  if (!EVENTS_API_URL) {
    throw new Error('VITE_EVENTS_API_URL is not configured')
  }

  return EVENTS_API_URL.replace(
    /https:\/\/script\.google\.com\/a\/macros\/[^/]+\/s\//,
    'https://script.google.com/macros/s/',
  )
}

function normalizeDateToKey(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed
    }

    const parsed = new Date(trimmed)
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear()
      const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
      const day = `${parsed.getDate()}`.padStart(2, '0')
      return `${year}-${month}-${day}`
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = `${value.getMonth() + 1}`.padStart(2, '0')
    const day = `${value.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  return ''
}

function normalizeScheduleColor(value: unknown): ScheduleColor {
  if (value === 'yellow' || value === 'green' || value === 'blue') {
    return value
  }
  return 'blue'
}

function normalizeScheduleEvent(item: unknown): ScheduleEventItem | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const raw = item as Partial<ScheduleEventItem> & { date?: unknown; color?: unknown }
  const date = normalizeDateToKey(raw.date)
  const id = String(raw.id ?? '').trim()
  const title = String(raw.title ?? '').trim()
  const color = normalizeScheduleColor(raw.color)
  const createdAt = String(raw.createdAt ?? '').trim()

  if (!id || !title || !date) {
    return null
  }

  return { id, title, date, color, createdAt }
}

async function callApi(payload: ApiPayload): Promise<ApiResponse> {
  const url = ensureApiUrl()
  const form = new URLSearchParams()

  form.set('action', payload.action)
  if (payload.title) form.set('title', payload.title)
  if (payload.date) form.set('date', payload.date)
  if (payload.color) form.set('color', payload.color)
  if (payload.id) form.set('id', payload.id)

  const response = await fetch(url, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Events API HTTP ${response.status}`)
  }

  const json = (await response.json()) as ApiResponse
  if (!json.success) {
    throw new Error(json.message || 'Events API failed')
  }

  return json
}

class AppsScriptEventsRepository implements EventsRepository {
  async getAll(): Promise<EventsSnapshot> {
    const res = await callApi({ action: 'getAll' })
    const data = res.data as EventsSnapshot | undefined

    const majorEvents = Array.isArray(data?.majorEvents) ? data.majorEvents : []
    const scheduleEvents = Array.isArray(data?.scheduleEvents)
      ? data.scheduleEvents.map(normalizeScheduleEvent).filter((item): item is ScheduleEventItem => item !== null)
      : []

    return {
      majorEvents,
      scheduleEvents,
    }
  }

  async addMajorEvent(title: string): Promise<MajorEventItem> {
    const trimmed = title.trim()
    if (!trimmed) {
      throw new Error('Major event title is required')
    }

    const res = await callApi({ action: 'addMajorEvent', title: trimmed })
    return res.data as MajorEventItem
  }

  async updateMajorEvent(id: string, title: string): Promise<MajorEventItem> {
    const trimmedId = id.trim()
    const trimmedTitle = title.trim()

    if (!trimmedId || !trimmedTitle) {
      throw new Error('Major event id and title are required')
    }

    try {
      const res = await callApi({ action: 'updateMajorEvent', id: trimmedId, title: trimmedTitle })
      return res.data as MajorEventItem
    } catch {
      await callApi({ action: 'removeMajorEvent', id: trimmedId })
      const res = await callApi({ action: 'addMajorEvent', title: trimmedTitle })
      return res.data as MajorEventItem
    }
  }

  async removeMajorEvent(id: string): Promise<void> {
    await callApi({ action: 'removeMajorEvent', id })
  }

  async addScheduleEvent(date: string, title: string, color: ScheduleColor): Promise<ScheduleEventItem> {
    const trimmedDate = date.trim()
    const trimmedTitle = title.trim()

    if (!trimmedDate || !trimmedTitle) {
      throw new Error('Schedule event date and title are required')
    }

    const res = await callApi({ action: 'addScheduleEvent', date: trimmedDate, title: trimmedTitle, color })
    const normalized = normalizeScheduleEvent(res.data)

    if (!normalized) {
      throw new Error('Invalid schedule event response')
    }

    return normalized
  }

  async updateScheduleEvent(id: string, date: string, title: string, color: ScheduleColor): Promise<ScheduleEventItem> {
    const trimmedId = id.trim()
    const trimmedDate = date.trim()
    const trimmedTitle = title.trim()

    if (!trimmedId || !trimmedDate || !trimmedTitle) {
      throw new Error('Schedule event id, date and title are required')
    }

    const res = await callApi({ action: 'updateScheduleEvent', id: trimmedId, date: trimmedDate, title: trimmedTitle, color })
    const normalized = normalizeScheduleEvent(res.data)

    if (!normalized) {
      throw new Error('Invalid schedule event response')
    }

    return normalized
  }

  async removeScheduleEvent(id: string): Promise<void> {
    await callApi({ action: 'removeScheduleEvent', id })
  }
}

export const eventsRepository: EventsRepository = new AppsScriptEventsRepository()

