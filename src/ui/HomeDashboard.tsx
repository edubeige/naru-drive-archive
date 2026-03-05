import { useMemo, useState } from 'react'
import { eventsRepository, type MajorEventItem, type ScheduleEventItem } from '../lib/eventsStore'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

function formatScheduleDate(date: string): string {
  if (!date) {
    return '-'
  }

  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(parsed)
}

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
  const [majorEvents, setMajorEvents] = useState<MajorEventItem[]>(() => eventsRepository.getAll().majorEvents)
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEventItem[]>(() => eventsRepository.getAll().scheduleEvents)
  const [majorInput, setMajorInput] = useState('')
  const [scheduleTitleInput, setScheduleTitleInput] = useState('')
  const [scheduleDateInput, setScheduleDateInput] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

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

  const refreshEvents = () => {
    const snapshot = eventsRepository.getAll()
    setMajorEvents(snapshot.majorEvents)
    setScheduleEvents(snapshot.scheduleEvents)
  }

  const addMajorEvent = () => {
    if (!majorInput.trim()) {
      return
    }

    eventsRepository.addMajorEvent(majorInput)
    setMajorInput('')
    refreshEvents()
  }

  const addScheduleEvent = () => {
    if (!scheduleDateInput.trim() || !scheduleTitleInput.trim()) {
      return
    }

    eventsRepository.addScheduleEvent(scheduleDateInput, scheduleTitleInput)
    setScheduleDateInput('')
    setScheduleTitleInput('')
    refreshEvents()
  }

  const removeMajorEvent = (id: string) => {
    eventsRepository.removeMajorEvent(id)
    refreshEvents()
  }

  const removeScheduleEvent = (id: string) => {
    eventsRepository.removeScheduleEvent(id)
    refreshEvents()
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
          <button type="button" className="action-button primary" onClick={addMajorEvent}>
            추가
          </button>
        </div>

        {!majorEvents.length && <p className="empty-text">등록된 주요행사가 없습니다.</p>}
        {!!majorEvents.length && (
          <ul className="major-events-list">
            {majorEvents.map((event) => (
              <li key={event.id}>
                <span>{event.title}</span>
                <button type="button" onClick={() => removeMajorEvent(event.id)} aria-label={`${event.title} 삭제`}>
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
          <button type="button" className="action-button primary" onClick={addScheduleEvent}>
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
                  {events.slice(0, 2).map((event) => (
                    <p key={event.id} title={event.title}>{event.title}</p>
                  ))}
                  {events.length > 2 && <p>+{events.length - 2}개</p>}
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

      <article className="home-card">
        <div className="home-card-head">
          <h3>전체 일정</h3>
          <span>{scheduleEvents.length}건</span>
        </div>

        {!scheduleEvents.length && <p className="empty-text">등록된 일정이 없습니다.</p>}
        {!!scheduleEvents.length && (
          <ul className="schedule-list">
            {scheduleEvents.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.title}</strong>
                  <p>{formatScheduleDate(event.date)}</p>
                </div>
                <button type="button" onClick={() => removeScheduleEvent(event.id)} aria-label={`${event.title} 삭제`}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="backend-note">
        <h4>서버 저장 백엔드 제안</h4>
        <p>
          현재는 `localStorage` 임시 구현입니다. 다음 단계로는
          `Google Apps Script + Google Sheets` 구성이 가장 빠르고, 교사 계정 환경에 잘 맞습니다.
        </p>
        <p>
          대안으로 `Supabase`도 가능하지만 인증/권한 설계가 추가됩니다. 원하시면 다음 턴에 앱스 스크립트 API 스펙부터 바로 만들어드리겠습니다.
        </p>
      </article>
    </section>
  )
}
