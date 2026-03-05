export type ClassName = '3-1' | '3-2' | '3-3' | '3-4' | '3-5'

export type LoanStatus = 'reserved' | 'returned'

export interface ItemRecord {
  itemName: string
  totalQty: number
  createdAt: string
  updatedAt: string
}

export interface LoanRecord {
  id: string
  className: ClassName
  itemName: string
  date: string
  periodStart: number
  periodEnd: number
  status: LoanStatus
  returnedAt: string
  createdAt: string
}

export interface ReservationInitData {
  items: ItemRecord[]
  topItems: string[]
  openLoans: LoanRecord[]
}

export interface ReservationsRepository {
  getInitData(): Promise<ReservationInitData>
  createLoan(input: {
    className: ClassName
    itemName: string
    date: string
    periodStart: number
    periodEnd: number
  }): Promise<LoanRecord>
  returnLoan(id: string): Promise<LoanRecord>
  getOpenLoans(): Promise<LoanRecord[]>
}

const RESERVATION_API_URL = import.meta.env.VITE_RESERVATION_API_URL as string | undefined
const CLASS_NAMES: ClassName[] = ['3-1', '3-2', '3-3', '3-4', '3-5']

interface ApiPayload {
  action: 'getInitData' | 'createLoan' | 'returnLoan' | 'getOpenLoans'
  id?: string
  className?: string
  itemName?: string
  date?: string
  periodStart?: string
  periodEnd?: string
}

interface ApiResponse {
  success: boolean
  data?: unknown
  message?: string
}

function ensureApiUrl(): string {
  if (!RESERVATION_API_URL) {
    throw new Error('VITE_RESERVATION_API_URL is not configured')
  }

  return RESERVATION_API_URL.replace(
    /https:\/\/script\.google\.com\/a\/macros\/[^/]+\/s\//,
    'https://script.google.com/macros/s/',
  )
}

function toDateKey(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  const year = parsed.getFullYear()
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function normalizeClassName(value: unknown): ClassName {
  const text = String(value ?? '').trim()
  if (CLASS_NAMES.includes(text as ClassName)) {
    return text as ClassName
  }
  return '3-1'
}

function normalizeItem(item: unknown): ItemRecord | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const raw = item as Partial<ItemRecord> & { itemName?: unknown; totalQty?: unknown }
  const itemName = String(raw.itemName ?? '').trim()
  if (!itemName) {
    return null
  }

  return {
    itemName,
    totalQty: toNumber(raw.totalQty) || 1,
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  }
}

function normalizeLoan(item: unknown): LoanRecord | null {
  if (!item || typeof item !== 'object') {
    return null
  }

  const raw = item as Partial<LoanRecord> & {
    className?: unknown
    itemName?: unknown
    date?: unknown
    periodStart?: unknown
    periodEnd?: unknown
    status?: unknown
  }

  const id = String(raw.id ?? '').trim()
  const itemName = String(raw.itemName ?? '').trim()
  const date = toDateKey(raw.date)

  if (!id || !itemName || !date) {
    return null
  }

  return {
    id,
    className: normalizeClassName(raw.className),
    itemName,
    date,
    periodStart: toNumber(raw.periodStart),
    periodEnd: toNumber(raw.periodEnd),
    status: raw.status === 'returned' ? 'returned' : 'reserved',
    returnedAt: String(raw.returnedAt ?? ''),
    createdAt: String(raw.createdAt ?? ''),
  }
}

function normalizeInitData(data: unknown): ReservationInitData {
  if (!data || typeof data !== 'object') {
    return { items: [], topItems: [], openLoans: [] }
  }

  const raw = data as {
    items?: unknown[]
    topItems?: unknown[]
    openLoans?: unknown[]
  }

  const items = Array.isArray(raw.items) ? raw.items.map(normalizeItem).filter((i): i is ItemRecord => Boolean(i)) : []
  const topItems = Array.isArray(raw.topItems)
    ? raw.topItems
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .slice(0, 10)
    : []
  const openLoans = Array.isArray(raw.openLoans)
    ? raw.openLoans.map(normalizeLoan).filter((i): i is LoanRecord => Boolean(i))
    : []

  return { items, topItems, openLoans }
}

function sortOpenLoans(loans: LoanRecord[]): LoanRecord[] {
  return [...loans].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) {
      return byDate
    }
    const byStart = a.periodStart - b.periodStart
    if (byStart !== 0) {
      return byStart
    }
    return a.itemName.localeCompare(b.itemName)
  })
}

async function callApi(payload: ApiPayload): Promise<ApiResponse> {
  const url = ensureApiUrl()
  const form = new URLSearchParams()

  form.set('action', payload.action)
  if (payload.id) form.set('id', payload.id)
  if (payload.className) form.set('className', payload.className)
  if (payload.itemName) form.set('itemName', payload.itemName)
  if (payload.date) form.set('date', payload.date)
  if (payload.periodStart) form.set('periodStart', payload.periodStart)
  if (payload.periodEnd) form.set('periodEnd', payload.periodEnd)

  const response = await fetch(url, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    throw new Error(`Reservation API HTTP ${response.status}`)
  }

  const json = (await response.json()) as ApiResponse
  if (!json.success) {
    throw new Error(json.message || 'Reservation API failed')
  }
  return json
}

class AppsScriptReservationsRepository implements ReservationsRepository {
  async getInitData(): Promise<ReservationInitData> {
    const res = await callApi({ action: 'getInitData' })
    const data = normalizeInitData(res.data)
    return {
      items: data.items,
      topItems: data.topItems,
      openLoans: sortOpenLoans(data.openLoans),
    }
  }

  async createLoan(input: {
    className: ClassName
    itemName: string
    date: string
    periodStart: number
    periodEnd: number
  }): Promise<LoanRecord> {
    const className = normalizeClassName(input.className)
    const itemName = input.itemName.trim()
    const date = toDateKey(input.date)
    const periodStart = toNumber(input.periodStart)
    const periodEnd = toNumber(input.periodEnd)

    if (!itemName || !date) {
      throw new Error('물품명과 날짜는 필수입니다.')
    }
    if (periodStart < 1 || periodStart > 6 || periodEnd < 1 || periodEnd > 6 || periodStart > periodEnd) {
      throw new Error('교시는 1~6 범위에서 시작~끝 순서로 입력해 주세요.')
    }

    const res = await callApi({
      action: 'createLoan',
      className,
      itemName,
      date,
      periodStart: String(periodStart),
      periodEnd: String(periodEnd),
    })

    const normalized = normalizeLoan(res.data)
    if (!normalized) {
      throw new Error('잘못된 예약 응답입니다.')
    }
    return normalized
  }

  async returnLoan(id: string): Promise<LoanRecord> {
    const targetId = id.trim()
    if (!targetId) {
      throw new Error('예약 ID가 필요합니다.')
    }

    const res = await callApi({ action: 'returnLoan', id: targetId })
    const normalized = normalizeLoan(res.data)
    if (!normalized) {
      throw new Error('잘못된 반납 응답입니다.')
    }
    return normalized
  }

  async getOpenLoans(): Promise<LoanRecord[]> {
    const res = await callApi({ action: 'getOpenLoans' })
    const list = Array.isArray(res.data)
      ? res.data.map(normalizeLoan).filter((item): item is LoanRecord => Boolean(item))
      : []
    return sortOpenLoans(list)
  }
}

export const reservationsRepository: ReservationsRepository = new AppsScriptReservationsRepository()
