import { useEffect, useMemo, useState } from 'react'
import { eventsRepository, type MajorEventItem, type ScheduleEventItem } from '../lib/eventsStore'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function buildMonthGrid(viewDate: Date): Date[] {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const startDate = new Date(year, month, 1 - startOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)
    return date
  })
}

function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function HomeDashboard() {
  const [majorEvents, setMajorEvents] = useState<MajorEventItem[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEventItem[]>([])
  const [majorInput, setMajorInput] = useState('')
  const [scheduleTitleInput, setScheduleTitleInput] = useState('')
  const [scheduleDateInput, setScheduleDateInput] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [error, setError] = useState<string | null>(null)

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ScheduleEventItem[]>()
    scheduleEvents.forEach((event) => {
      const current = map.get(event.date) ?? []
      current.push(event)
      map.set(event.date, current)
    })

    return map
  }, [scheduleEvents])

  const monthCells = useMemo(() => buildMonthGrid(calendarMonth), [calendarMonth])

  const monthlySchedules = useMemo(() => {
    const year = calendarMonth.getFullYear()
    const month = `${calendarMonth.getMonth() + 1}`.padStart(2, '0')
    const prefix = `${year}-${month}-`
    return scheduleEvents.filter((event) => event.date.startsWith(prefix))
  }, [calendarMonth, scheduleEvents])

  const refreshEvents = async () => {
    try {
      const snapshot = await eventsRepository.getAll()
      setMajorEvents(snapshot.majorEvents)
      setScheduleEvents(snapshot.scheduleEvents)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '일정을 불러오지 못했습니다.')
    }
  }

  useEffect(() => {
    void refreshEvents()
  }, [])

  const addMajorEvent = async () => {
    if (!majorInput.trim()) {
      return
    }

    try {
      await eventsRepository.addMajorEvent(majorInput)
      setMajorInput('')
      await refreshEvents()
    } catch (e) {
      setError(e instanceof Error ? e.message : '행사 추가에 실패했습니다.')
    }
  }

  const addScheduleEvent = async () => {
    if (!scheduleDateInput.trim() || !scheduleTitleInput.trim()) {
      return
    }

    try {
      await eventsRepository.addScheduleEvent(scheduleDateInput, scheduleTitleInput)
      setScheduleDateInput('')
      setScheduleTitleInput('')
      await refreshEvents()
    } catch (e) {
      setError(e instanceof Error ? e.message : '일정 추가에 실패했습니다.')
    }
  }

  const removeMajorEvent = async (id: string) => {
    try {
      await eventsRepository.removeMajorEvent(id)
      await refreshEvents()
    } catch (e) {
      setError(e instanceof Error ? e.message : '행사 삭제에 실패했습니다.')
    }
  }

  const moveMonth = (offset: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1))
  }

  const goCurrentMonth = () => {
    const now = new Date()
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  return (
    <section className="home-dashboard" aria-label="홈 대시보드">
      <header className="home-header">
        <p className="home-kicker">홈</p>
        <h2>학년 메인 페이지</h2>
        <p>학년 주요행사와 캘린더 일정을 한곳에서 관리합니다.</p>
      </header>

      {error && <div className="state-box error">{error}</div>}

      <article className="home-card">
        <div className="home-card-head">
          <h3>학년 주요행사</h3>
        </div>
        <div className="inline-form">
          <input
            value={majorInput}
            onChange={(event) => setMajorInput(event.target.value)}
            placeholder="행사명 입력 (예: 학부모 상담주간)"
            aria-label="학년 주요행사 입력"
          />
          <button type="button" className="action-button primary" onClick={() => void addMajorEvent()}>
            추가
          </button>
        </div>

        {!majorEvents.length && <p className="empty-text">등록된 주요행사가 없습니다.</p>}
        {!!majorEvents.length && (
          <ul className="major-events-list">
            {majorEvents.map((event) => (
              <li key={event.id}>
                <span>{event.title}</span>
                <button type="button" onClick={() => void removeMajorEvent(event.id)} aria-label={`${event.title} 삭제`}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="home-card">
        <div className="home-card-head">
          <h3>일정 캘린더</h3>
          <button type="button" className="action-button" onClick={goCurrentMonth}>오늘</button>
        </div>

        <div className="inline-form two-col">
          <input
            type="date"
            value={scheduleDateInput}
            onChange={(event) => setScheduleDateInput(event.target.value)}
            aria-label="일정 날짜"
          />
          <input
            value={scheduleTitleInput}
            onChange={(event) => setScheduleTitleInput(event.target.value)}
            placeholder="행사명"
            aria-label="일정 행사명"
          />
          <button type="button" className="action-button primary" onClick={() => void addScheduleEvent()}>
            일정 추가
          </button>
        </div>

        <div className="calendar-nav">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="이전 달">◀</button>
          <strong>
            {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
          </strong>
          <button type="button" onClick={() => moveMonth(1)} aria-label="다음 달">▶</button>
        </div>

        <div className="calendar-grid">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="weekday-cell">{label}</div>
          ))}

          {monthCells.map((date) => {
            const key = toDateKey(date)
            const events = eventsByDate.get(key) ?? []
            const isCurrentMonth = date.getMonth() === calendarMonth.getMonth()
            const isToday = key === toDateKey(new Date())

            return (
              <div key={key} className={`day-cell ${isCurrentMonth ? '' : 'dimmed'} ${isToday ? 'today' : ''}`}>
                <div className="day-top">{date.getDate()}</div>
                <div className="day-events">
                  {events.slice(0, 3).map((event) => (
                    <p key={event.id} title={event.title}>{event.title}</p>
                  ))}
                  {events.length > 3 && <p>+{events.length - 3}개</p>}
                </div>
              </div>
            )
          })}
        </div>

        {!!monthlySchedules.length && (
          <div className="monthly-inline">
            <strong>{calendarMonth.getMonth() + 1}월 일정</strong>
            <span>{monthlySchedules.length}건</span>
          </div>
        )}
      </article>

      <article className="backend-note">
        <h4>서버 저장 안내</h4>
        <p>
          현재 일정은 `VITE_EVENTS_API_URL`로 지정한 Apps Script API에 저장됩니다.
          6명이 함께 사용 가능한 공유 저장 구조입니다.
        </p>
      </article>
    </section>
  )
}
