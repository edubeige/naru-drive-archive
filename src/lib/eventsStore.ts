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
  getAll(): EventsSnapshot
  addMajorEvent(title: string): MajorEventItem
  removeMajorEvent(id: string): void
  addScheduleEvent(date: string, title: string): ScheduleEventItem
  removeScheduleEvent(id: string): void
}

const STORAGE_KEY = 'naru_drive_archive_events_v1'

interface PersistedData {
  majorEvents: MajorEventItem[]
  scheduleEvents: ScheduleEventItem[]
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function getEmptyData(): PersistedData {
  return {
    majorEvents: [],
    scheduleEvents: [],
  }
}

function safeParse(raw: string | null): PersistedData {
  if (!raw) {
    return getEmptyData()
  }

  try {
    const parsed = JSON.parse(raw) as PersistedData
    return {
      majorEvents: Array.isArray(parsed.majorEvents) ? parsed.majorEvents : [],
      scheduleEvents: Array.isArray(parsed.scheduleEvents) ? parsed.scheduleEvents : [],
    }
  } catch {
    return getEmptyData()
  }
}

export class LocalStorageEventsRepository implements EventsRepository {
  private read(): PersistedData {
    if (typeof localStorage === 'undefined') {
      return getEmptyData()
    }

    return safeParse(localStorage.getItem(STORAGE_KEY))
  }

  private write(data: PersistedData): void {
    if (typeof localStorage === 'undefined') {
      return
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  }

  getAll(): EventsSnapshot {
    const data = this.read()

    return {
      majorEvents: [...data.majorEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      scheduleEvents: [...data.scheduleEvents].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko-KR')),
    }
  }

  addMajorEvent(title: string): MajorEventItem {
    const trimmed = title.trim()
    if (!trimmed) {
      throw new Error('Major event title is required')
    }

    const data = this.read()
    const created: MajorEventItem = {
      id: generateId('major'),
      title: trimmed,
      createdAt: new Date().toISOString(),
    }

    data.majorEvents.push(created)
    this.write(data)
    return created
  }

  removeMajorEvent(id: string): void {
    const data = this.read()
    data.majorEvents = data.majorEvents.filter((item) => item.id !== id)
    this.write(data)
  }

  addScheduleEvent(date: string, title: string): ScheduleEventItem {
    const trimmedTitle = title.trim()
    const trimmedDate = date.trim()

    if (!trimmedDate || !trimmedTitle) {
      throw new Error('Schedule event date and title are required')
    }

    const data = this.read()
    const created: ScheduleEventItem = {
      id: generateId('schedule'),
      title: trimmedTitle,
      date: trimmedDate,
      createdAt: new Date().toISOString(),
    }

    data.scheduleEvents.push(created)
    this.write(data)
    return created
  }

  removeScheduleEvent(id: string): void {
    const data = this.read()
    data.scheduleEvents = data.scheduleEvents.filter((item) => item.id !== id)
    this.write(data)
  }
}

export const eventsRepository: EventsRepository = new LocalStorageEventsRepository()
