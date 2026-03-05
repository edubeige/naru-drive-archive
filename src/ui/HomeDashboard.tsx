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

function sortScheduleEvents(items: ScheduleEventItem[]): ScheduleEventItem[] {
  return [...items].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    return byDate !== 0 ? byDate : a.title.localeCompare(b.title)
  })
}

function formatDateLabel(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`)
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date)
}

export default function HomeDashboard() {
  const [majorEvents, setMajorEvents] = useState<MajorEventItem[]>([])
  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEventItem[]>([])
  const [majorInput, setMajorInput] = useState('')
  const [scheduleTitleInput, setScheduleTitleInput] = useState('')
  const [scheduleDateInput, setScheduleDateInput] = useState('')

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [popupAddTitle, setPopupAddTitle] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [isEditingEvent, setIsEditingEvent] = useState(false)

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    return sortScheduleEvents(scheduleEvents.filter((event) => event.date.startsWith(prefix)))
  }, [calendarMonth, scheduleEvents])

  const selectedDateEvents = useMemo(() => {
    if (!selectedDateKey) {
      return []
    }
    return sortScheduleEvents(eventsByDate.get(selectedDateKey) ?? [])
  }, [eventsByDate, selectedDateKey])

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) {
      return null
    }
    return scheduleEvents.find((event) => event.id === selectedEventId) ?? null
  }, [scheduleEvents, selectedEventId])

  const refreshEvents = async () => {
    try {
      const snapshot = await eventsRepository.getAll()
      setMajorEvents(snapshot.majorEvents)
      setScheduleEvents(sortScheduleEvents(snapshot.scheduleEvents))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '일정을 불러오지 못했습니다.')
    }
  }

  useEffect(() => {
    void refreshEvents()
  }, [])

  const addMajorEvent = async () => {
    const title = majorInput.trim()
    if (!title) {
      return
    }

    const tempId = `temp_major_${Date.now()}`
    const optimisticEvent: MajorEventItem = { id: tempId, title, createdAt: new Date().toISOString() }

    setMajorEvents((prev) => [optimisticEvent, ...prev])
    setMajorInput('')
    setBusy(true)

    try {
      const created = await eventsRepository.addMajorEvent(title)
      setMajorEvents((prev) => prev.map((event) => (event.id === tempId ? created : event)))
      setError(null)
    } catch (e) {
      setMajorEvents((prev) => prev.filter((event) => event.id !== tempId))
      setError(e instanceof Error ? e.message : '행사 추가에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const addScheduleEvent = async (date: string, title: string) => {
    const trimmedDate = date.trim()
    const trimmedTitle = title.trim()
    if (!trimmedDate || !trimmedTitle) {
      return
    }

    const tempId = `temp_schedule_${Date.now()}`
    const optimisticEvent: ScheduleEventItem = {
      id: tempId,
      date: trimmedDate,
      title: trimmedTitle,
      createdAt: new Date().toISOString(),
    }

    setScheduleEvents((prev) => sortScheduleEvents([...prev, optimisticEvent]))
    setBusy(true)

    try {
      const created = await eventsRepository.addScheduleEvent(trimmedDate, trimmedTitle)
      setScheduleEvents((prev) => sortScheduleEvents(prev.map((event) => (event.id === tempId ? created : event))))
      setError(null)
    } catch (e) {
      setScheduleEvents((prev) => prev.filter((event) => event.id !== tempId))
      setError(e instanceof Error ? e.message : '일정 추가에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const handleTopAddSchedule = async () => {
    const date = scheduleDateInput.trim()
    const title = scheduleTitleInput.trim()
    await addScheduleEvent(date, title)
    setScheduleDateInput('')
    setScheduleTitleInput('')
  }

  const handlePopupAddSchedule = async () => {
    if (!selectedDateKey) {
      return
    }
    const title = popupAddTitle.trim()
    await addScheduleEvent(selectedDateKey, title)
    setPopupAddTitle('')
  }

  const removeMajorEvent = async (id: string) => {
    const previous = majorEvents
    setMajorEvents((prev) => prev.filter((event) => event.id !== id))
    setBusy(true)

    try {
      await eventsRepository.removeMajorEvent(id)
      setError(null)
    } catch (e) {
      setMajorEvents(previous)
      setError(e instanceof Error ? e.message : '행사 삭제에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const removeScheduleEvent = async (id: string) => {
    const previous = scheduleEvents
    setScheduleEvents((prev) => prev.filter((event) => event.id !== id))
    setBusy(true)

    try {
      await eventsRepository.removeScheduleEvent(id)
      setSelectedEventId((prev) => (prev === id ? null : prev))
      setError(null)
    } catch (e) {
      setScheduleEvents(previous)
      setError(e instanceof Error ? e.message : '일정 삭제에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const startEditEvent = (event: ScheduleEventItem) => {
    setSelectedEventId(event.id)
    setSelectedDateKey(event.date)
    setEditTitle(event.title)
    setIsEditingEvent(true)
  }

  const cancelEditEvent = () => {
    setIsEditingEvent(false)
    setEditTitle('')
  }

  const saveEditEvent = async () => {
    if (!selectedEvent) {
      return
    }

    const nextTitle = editTitle.trim()
    if (!nextTitle) {
      return
    }

    const previous = scheduleEvents
    const optimistic = { ...selectedEvent, title: nextTitle }

    setScheduleEvents((prev) => sortScheduleEvents(prev.map((item) => (item.id === selectedEvent.id ? optimistic : item))))
    setBusy(true)

    try {
      const updated = await eventsRepository.updateScheduleEvent(selectedEvent.id, selectedEvent.date, nextTitle)
      setScheduleEvents((prev) => sortScheduleEvents(prev.map((item) => (item.id === selectedEvent.id ? updated : item))))
      setIsEditingEvent(false)
      setError(null)
    } catch (e) {
      setScheduleEvents(previous)
      setError(e instanceof Error ? e.message : '일정 수정에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const moveMonth = (offset: number) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1))
  }

  const goCurrentMonth = () => {
    const now = new Date()
    setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  const openDatePopup = (dateKey: string) => {
    setSelectedDateKey(dateKey)
    setSelectedEventId(null)
    setPopupAddTitle('')
    setIsEditingEvent(false)
    setEditTitle('')
  }

  const closePopups = () => {
    setSelectedDateKey(null)
    setSelectedEventId(null)
    setPopupAddTitle('')
    setIsEditingEvent(false)
    setEditTitle('')
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
          <button type="button" className="action-button primary" onClick={() => void addMajorEvent()} disabled={busy}>
            추가
          </button>
        </div>

        {!majorEvents.length && <p className="empty-text">등록된 주요행사가 없습니다.</p>}
        {!!majorEvents.length && (
          <ul className="major-events-list">
            {majorEvents.map((event) => (
              <li key={event.id}>
                <span>{event.title}</span>
                <button type="button" onClick={() => void removeMajorEvent(event.id)} aria-label={`${event.title} 삭제`} disabled={busy}>
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
          <button type="button" className="action-button primary" onClick={() => void handleTopAddSchedule()} disabled={busy}>
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
              <button
                key={key}
                type="button"
                className={`day-cell ${isCurrentMonth ? '' : 'dimmed'} ${isToday ? 'today' : ''}`}
                onClick={() => openDatePopup(key)}
                aria-label={`${key} 일정 보기`}
              >
                <div className="day-top">{date.getDate()}</div>
                <div className="day-events">
                  {events.slice(0, 3).map((event) => (
                    <p key={event.id} title={event.title}>{event.title}</p>
                  ))}
                  {events.length > 3 && <p>+{events.length - 3}개</p>}
                </div>
              </button>
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
        <p>현재 일정은 `VITE_EVENTS_API_URL`로 지정한 Apps Script API에 저장됩니다.</p>
      </article>

      {selectedDateKey && (
        <div className="calendar-overlay" onClick={closePopups}>
          <section className="calendar-modal" role="dialog" aria-label="날짜 일정" onClick={(event) => event.stopPropagation()}>
            <header className="calendar-modal-head">
              <div>
                <h3>{formatDateLabel(selectedDateKey)} 일정</h3>
                <p>{selectedDateKey}</p>
              </div>
              <button type="button" className="close-button" onClick={closePopups} aria-label="닫기">✕</button>
            </header>

            <div className="calendar-modal-body">
              {!selectedDateEvents.length && <p className="empty-text">등록된 일정이 없습니다.</p>}
              {!!selectedDateEvents.length && (
                <ul className="popup-event-list">
                  {selectedDateEvents.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        className="popup-event-item"
                        onClick={() => {
                          setSelectedEventId(event.id)
                          setIsEditingEvent(false)
                          setEditTitle('')
                        }}
                      >
                        {event.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="popup-add-form">
                <input
                  value={popupAddTitle}
                  onChange={(event) => setPopupAddTitle(event.target.value)}
                  placeholder="이 날짜에 추가할 일정"
                  aria-label="선택 날짜 일정 추가"
                />
                <button type="button" className="action-button primary" onClick={() => void handlePopupAddSchedule()} disabled={busy}>
                  추가
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {selectedEvent && (
        <div className="calendar-overlay" onClick={() => { setSelectedEventId(null); setIsEditingEvent(false) }}>
          <section className="calendar-modal detail" role="dialog" aria-label="일정 상세" onClick={(event) => event.stopPropagation()}>
            <header className="calendar-modal-head">
              <div>
                <h3>일정 상세</h3>
                <p>{formatDateLabel(selectedEvent.date)}</p>
              </div>
              <button
                type="button"
                className="close-button"
                onClick={() => { setSelectedEventId(null); setIsEditingEvent(false) }}
                aria-label="닫기"
              >
                ✕
              </button>
            </header>

            <div className="calendar-modal-body">
              {!isEditingEvent && <p className="event-full-title">{selectedEvent.title}</p>}

              {isEditingEvent && (
                <div className="popup-add-form single">
                  <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label="일정 제목 수정" />
                </div>
              )}

              <div className="popup-actions">
                {!isEditingEvent && (
                  <button type="button" className="action-button" onClick={() => startEditEvent(selectedEvent)} disabled={busy}>
                    수정
                  </button>
                )}
                {isEditingEvent && (
                  <>
                    <button type="button" className="action-button primary" onClick={() => void saveEditEvent()} disabled={busy}>
                      저장
                    </button>
                    <button type="button" className="action-button" onClick={cancelEditEvent} disabled={busy}>
                      취소
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="action-button danger"
                  onClick={() => void removeScheduleEvent(selectedEvent.id)}
                  disabled={busy}
                >
                  삭제
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
