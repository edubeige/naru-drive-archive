import { useEffect, useMemo, useState } from 'react'
import {
  reservationsRepository,
  type ClassName,
  type ItemRecord,
  type LoanRecord,
} from '../lib/reservationStore'

const CLASS_OPTIONS: ClassName[] = ['3-1', '3-2', '3-3', '3-4', '3-5']
const PERIOD_OPTIONS = [1, 2, 3, 4, 5, 6]

type OpenLoanFilter = 'today' | 'week' | 'all'

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getTodayKey(): string {
  return toDateKey(new Date())
}

function startOfWeek(date: Date): Date {
  const value = new Date(date)
  const day = value.getDay()
  value.setDate(value.getDate() - day)
  value.setHours(0, 0, 0, 0)
  return value
}

function endOfWeek(date: Date): Date {
  const value = startOfWeek(date)
  value.setDate(value.getDate() + 6)
  value.setHours(23, 59, 59, 999)
  return value
}

function formatLoanDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return dateKey
  }

  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date)
}

function sortLoans(list: LoanRecord[]): LoanRecord[] {
  return [...list].sort((a, b) => {
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

function mergeItems(current: ItemRecord[], nextItemName: string): ItemRecord[] {
  const normalized = nextItemName.trim()
  if (!normalized) {
    return current
  }

  const exists = current.some((item) => item.itemName === normalized)
  if (exists) {
    return current
  }

  return [
    {
      itemName: normalized,
      totalQty: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...current,
  ]
}

export default function ReservationDashboard() {
  const [className, setClassName] = useState<ClassName>('3-1')
  const [itemName, setItemName] = useState('')
  const [date, setDate] = useState(getTodayKey())
  const [periodStart, setPeriodStart] = useState(1)
  const [periodEnd, setPeriodEnd] = useState(1)

  const [items, setItems] = useState<ItemRecord[]>([])
  const [topItems, setTopItems] = useState<string[]>([])
  const [openLoans, setOpenLoans] = useState<LoanRecord[]>([])
  const [filter, setFilter] = useState<OpenLoanFilter>('today')

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const itemCandidates = useMemo(() => {
    const names = new Set<string>()
    items.forEach((item) => names.add(item.itemName))
    topItems.forEach((name) => names.add(name))
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [items, topItems])

  const filteredOpenLoans = useMemo(() => {
    const today = getTodayKey()
    const todayDate = new Date(`${today}T00:00:00`)
    const weekStart = startOfWeek(todayDate)
    const weekEnd = endOfWeek(todayDate)

    if (filter === 'all') {
      return openLoans
    }

    if (filter === 'today') {
      return openLoans.filter((loan) => loan.date === today)
    }

    return openLoans.filter((loan) => {
      const target = new Date(`${loan.date}T00:00:00`)
      return target >= weekStart && target <= weekEnd
    })
  }, [filter, openLoans])

  const refreshInitData = async () => {
    setLoading(true)
    try {
      const snapshot = await reservationsRepository.getInitData()
      setItems(snapshot.items)
      setTopItems(snapshot.topItems)
      setOpenLoans(sortLoans(snapshot.openLoans.filter((loan) => loan.status === 'reserved')))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '예약 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshInitData()
  }, [])

  const resetReservationForm = () => {
    setItemName('')
    setDate(getTodayKey())
    setPeriodStart(1)
    setPeriodEnd(1)
  }

  const handleCreateLoan = async () => {
    const trimmedItem = itemName.trim()
    if (!trimmedItem || !date) {
      return
    }

    if (periodStart > periodEnd) {
      setError('시작 교시는 끝 교시보다 클 수 없습니다.')
      return
    }

    const tempId = `temp_loan_${Date.now()}`
    const optimisticLoan: LoanRecord = {
      id: tempId,
      className,
      itemName: trimmedItem,
      date,
      periodStart,
      periodEnd,
      status: 'reserved',
      returnedAt: '',
      createdAt: new Date().toISOString(),
    }

    setOpenLoans((prev) => sortLoans([...prev, optimisticLoan]))
    setItems((prev) => mergeItems(prev, trimmedItem))
    setSaving(true)

    try {
      const created = await reservationsRepository.createLoan({
        className,
        itemName: trimmedItem,
        date,
        periodStart,
        periodEnd,
      })

      setOpenLoans((prev) => sortLoans(prev.map((loan) => (loan.id === tempId ? created : loan))))
      setTopItems((prev) => {
        const next = [trimmedItem, ...prev.filter((name) => name !== trimmedItem)]
        return next.slice(0, 10)
      })
      setError(null)
      resetReservationForm()
    } catch (e) {
      setOpenLoans((prev) => prev.filter((loan) => loan.id !== tempId))
      setError(e instanceof Error ? e.message : '예약 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleReturnLoan = async (id: string) => {
    const previous = openLoans
    setOpenLoans((prev) => prev.filter((loan) => loan.id !== id))
    setSaving(true)

    try {
      await reservationsRepository.returnLoan(id)
      setError(null)
    } catch (e) {
      setOpenLoans(previous)
      setError(e instanceof Error ? e.message : '반납 처리에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="reservation-dashboard" aria-label="물품 예약">
      <header className="home-header">
        <p className="home-kicker">예약</p>
        <h2>물품 예약</h2>
        <p>학급별 물품 예약과 미반납 상태를 빠르게 관리합니다.</p>
      </header>

      {error && <div className="state-box error">{error}</div>}

      <article className="home-card reservation-card">
        <div className="home-card-head">
          <h3>예약하기</h3>
          <button type="button" className="action-button" onClick={() => void refreshInitData()} disabled={loading || saving}>
            새로고침
          </button>
        </div>

        <div className="reservation-form-grid">
          <label>
            학급
            <select value={className} onChange={(event) => setClassName(event.target.value as ClassName)}>
              {CLASS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            날짜
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>

          <label>
            시작 교시
            <select value={periodStart} onChange={(event) => setPeriodStart(Number(event.target.value))}>
              {PERIOD_OPTIONS.map((period) => (
                <option key={period} value={period}>
                  {period}교시
                </option>
              ))}
            </select>
          </label>

          <label>
            끝 교시
            <select value={periodEnd} onChange={(event) => setPeriodEnd(Number(event.target.value))}>
              {PERIOD_OPTIONS.map((period) => (
                <option key={period} value={period}>
                  {period}교시
                </option>
              ))}
            </select>
          </label>

          <label className="span-full">
            물품명
            <input
              list="reservation-items"
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              placeholder="예: 주사위"
            />
            <datalist id="reservation-items">
              {itemCandidates.map((candidate) => (
                <option key={candidate} value={candidate} />
              ))}
            </datalist>
          </label>
        </div>

        <div className="top-item-chips" aria-label="최근 사용 물품">
          {topItems.slice(0, 10).map((name) => (
            <button key={name} type="button" className="summary-chip chip-button" onClick={() => setItemName(name)}>
              {name}
            </button>
          ))}
          {!topItems.length && <p className="empty-text">최근 사용 물품이 아직 없습니다.</p>}
        </div>

        <div className="reservation-submit-row">
          <button type="button" className="action-button primary" onClick={() => void handleCreateLoan()} disabled={saving || loading}>
            예약 저장
          </button>
        </div>
      </article>

      <article className="home-card reservation-card">
        <div className="home-card-head">
          <h3>반납 체크</h3>
          <div className="loan-filter-tabs" role="tablist" aria-label="미반납 필터">
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'today'}
              className={`summary-chip chip-button ${filter === 'today' ? 'active' : ''}`}
              onClick={() => setFilter('today')}
            >
              오늘
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'week'}
              className={`summary-chip chip-button ${filter === 'week' ? 'active' : ''}`}
              onClick={() => setFilter('week')}
            >
              이번주
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === 'all'}
              className={`summary-chip chip-button ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              전체
            </button>
          </div>
        </div>

        {loading && <p className="empty-text">불러오는 중...</p>}
        {!loading && !filteredOpenLoans.length && <p className="empty-text">미반납 항목이 없습니다.</p>}

        {!!filteredOpenLoans.length && (
          <ul className="loan-open-list">
            {filteredOpenLoans.map((loan) => (
              <li key={loan.id}>
                <div>
                  <p className="loan-title">{loan.itemName}</p>
                  <p className="loan-meta">
                    {loan.className} · {formatLoanDate(loan.date)} · {loan.periodStart}~{loan.periodEnd}교시
                  </p>
                </div>
                <button
                  type="button"
                  className="action-button info"
                  onClick={() => void handleReturnLoan(loan.id)}
                  disabled={saving}
                >
                  반납 완료
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  )
}
