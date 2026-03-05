export interface MajorEventItem {
  id: string
  title: string
  createdAt: string
}

export interface ScheduleEventItem {
  id: string
  title: string
  date: string // YYYY-MM-DD
  createdAt: string
}

export interface EventsSnapshot {
  majorEvents: MajorEventItem[]
  scheduleEvents: ScheduleEventItem[]
}

export interface EventsRepository {
  getAll(): Promise<EventsSnapshot>
  addMajorEvent(title: string): Promise<MajorEventItem>
  removeMajorEvent(id: string): Promise<void>
  addScheduleEvent(date: string, title: string): Promise<ScheduleEventItem>
  removeScheduleEvent(id: string): Promise<void>
}

const EVENTS_API_URL = import.meta.env.VITE_EVENTS_API_URL as string | undefined

interface ApiPayload {
  action:
    | 'getAll'
    | 'addMajorEvent'
    | 'removeMajorEvent'
    | 'addScheduleEvent'
    | 'removeScheduleEvent'
  title?: string
  date?: string
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
  return EVENTS_API_URL
}

async function callApi(payload: ApiPayload): Promise<ApiResponse> {
  const url = ensureApiUrl()

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

    return {
      majorEvents: Array.isArray(data?.majorEvents) ? data?.majorEvents : [],
      scheduleEvents: Array.isArray(data?.scheduleEvents) ? data?.scheduleEvents : [],
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

  async removeMajorEvent(id: string): Promise<void> {
    await callApi({ action: 'removeMajorEvent', id })
  }

  async addScheduleEvent(date: string, title: string): Promise<ScheduleEventItem> {
    const trimmedDate = date.trim()
    const trimmedTitle = title.trim()

    if (!trimmedDate || !trimmedTitle) {
      throw new Error('Schedule event date and title are required')
    }

    const res = await callApi({ action: 'addScheduleEvent', date: trimmedDate, title: trimmedTitle })
    return res.data as ScheduleEventItem
  }

  async removeScheduleEvent(id: string): Promise<void> {
    await callApi({ action: 'removeScheduleEvent', id })
  }
}

export const eventsRepository: EventsRepository = new AppsScriptEventsRepository()
