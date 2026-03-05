import { useEffect, useMemo, useState } from 'react'
import './styles.css'
import {
  buildDriveTree,
  getFileIconKey,
  getFileTypeLabel,
  type DriveItemRaw,
  type DriveTree,
  type FileIconKey,
  type FolderNode,
} from './lib/driveTree'

interface SelectionState {
  subjectPath: string | null
  semesterPath: string | null
  unitPath: string | null
  lessonPath: string | null
}

const FALLBACK_API_URL =
  'https://script.google.com/macros/s/AKfycbzONOmQfiiuOEn7_jeOChPkzS-_qAsuFfMDreUs3o43OLOF6e8GezyDny8yqtL_TUBR6Q/exec'

const SEMESTER_NAMES = ['1학기', '2학기']

const FILE_ICON_MAP: Record<FileIconKey, string> = {
  presentation: '📊',
  pdf: '📕',
  hwp: '📘',
  doc: '📝',
  sheet: '📗',
  video: '🎬',
  archive: '🗜️',
  file: '📄',
}

function hasSemesterChildren(subject: FolderNode): boolean {
  return subject.childrenFolders.some((child) => SEMESTER_NAMES.includes(child.name))
}

function getSemesterNodes(subject: FolderNode): FolderNode[] {
  return SEMESTER_NAMES.map((semesterName) => subject.childrenFolders.find((child) => child.name === semesterName)).filter(
    (node): node is FolderNode => Boolean(node),
  )
}

function createSelectionForSubject(subject: FolderNode | undefined): SelectionState {
  if (!subject) {
    return {
      subjectPath: null,
      semesterPath: null,
      unitPath: null,
      lessonPath: null,
    }
  }

  const semesterNodes = getSemesterNodes(subject)
  const semesterPath = semesterNodes[0]?.fullPath ?? null
  const baseNode = semesterPath
    ? semesterNodes[0]
    : subject

  const unitNode = baseNode?.childrenFolders[0]
  const lessonNode = unitNode?.childrenFolders[0]

  return {
    subjectPath: subject.fullPath,
    semesterPath,
    unitPath: unitNode?.fullPath ?? null,
    lessonPath: lessonNode?.fullPath ?? null,
  }
}

function getBreadcrumb(selection: SelectionState, tree: DriveTree | null): string {
  if (!tree || !selection.subjectPath) {
    return '선택된 경로가 없습니다.'
  }

  const labels = [selection.subjectPath, selection.semesterPath, selection.unitPath, selection.lessonPath]
    .filter((path): path is string => Boolean(path))
    .map((path) => tree.nodesByPath.get(path)?.name)
    .filter((name): name is string => Boolean(name))

  return labels.length ? labels.join(' > ') : '선택된 경로가 없습니다.'
}

function formatDate(isoDate: string): string {
  if (!isoDate) {
    return '-'
  }

  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function App() {
  const [tree, setTree] = useState<DriveTree | null>(null)
  const [selection, setSelection] = useState<SelectionState>({
    subjectPath: null,
    semesterPath: null,
    unitPath: null,
    lessonPath: null,
  })
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const apiUrl = import.meta.env.VITE_API_URL || FALLBACK_API_URL

  const selectedSubject = useMemo(() => {
    if (!tree || !selection.subjectPath) {
      return null
    }

    return tree.nodesByPath.get(selection.subjectPath) ?? null
  }, [tree, selection.subjectPath])

  const availableSemesters = useMemo(() => {
    if (!selectedSubject || !hasSemesterChildren(selectedSubject)) {
      return []
    }

    return getSemesterNodes(selectedSubject)
  }, [selectedSubject])

  const activeBaseNode = useMemo(() => {
    if (!tree || !selection.subjectPath) {
      return null
    }

    const path = selection.semesterPath || selection.subjectPath
    return tree.nodesByPath.get(path) ?? null
  }, [tree, selection.semesterPath, selection.subjectPath])

  const selectedFolderPath = selection.lessonPath || selection.unitPath || selection.semesterPath || selection.subjectPath

  const selectedFolderNode = useMemo(() => {
    if (!tree || !selectedFolderPath) {
      return null
    }

    return tree.nodesByPath.get(selectedFolderPath) ?? null
  }, [tree, selectedFolderPath])

  const files = selectedFolderNode?.files ?? []

  const fetchData = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(apiUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const json = (await response.json()) as DriveItemRaw[]

      if (!Array.isArray(json) || !json.length) {
        setTree(null)
        setSelection({
          subjectPath: null,
          semesterPath: null,
          unitPath: null,
          lessonPath: null,
        })
        return
      }

      const nextTree = buildDriveTree(json)
      setTree(nextTree)

      const nextSelection = createSelectionForSubject(nextTree.subjects[0])
      setSelection(nextSelection)

      const nextExpanded = new Set<string>()
      if (nextSelection.unitPath) {
        nextExpanded.add(nextSelection.unitPath)
      }

      setExpandedPaths(nextExpanded)
    } catch {
      setError('자료를 불러오지 못했습니다. 네트워크 상태 또는 API URL을 확인해 주세요.')
      setTree(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
  }, [])

  const handleSubjectClick = (subjectPath: string) => {
    if (!tree) {
      return
    }

    const subject = tree.nodesByPath.get(subjectPath)
    if (!subject) {
      return
    }

    const nextSelection = createSelectionForSubject(subject)
    setSelection(nextSelection)

    const nextExpanded = new Set<string>()
    if (nextSelection.unitPath) {
      nextExpanded.add(nextSelection.unitPath)
    }
    setExpandedPaths(nextExpanded)
    setIsSidebarOpen(false)
  }

  const handleSemesterClick = (semesterPath: string) => {
    if (!tree) {
      return
    }

    const semesterNode = tree.nodesByPath.get(semesterPath)
    if (!semesterNode) {
      return
    }

    const firstUnit = semesterNode.childrenFolders[0]
    const firstLesson = firstUnit?.childrenFolders[0]

    setSelection((prev) => ({
      subjectPath: prev.subjectPath,
      semesterPath,
      unitPath: firstUnit?.fullPath ?? null,
      lessonPath: firstLesson?.fullPath ?? null,
    }))

    const nextExpanded = new Set<string>()
    if (firstUnit) {
      nextExpanded.add(firstUnit.fullPath)
    }
    setExpandedPaths(nextExpanded)
  }

  const handleUnitClick = (unitPath: string) => {
    if (!tree) {
      return
    }

    const unitNode = tree.nodesByPath.get(unitPath)
    if (!unitNode) {
      return
    }

    const firstLesson = unitNode.childrenFolders[0]

    setSelection((prev) => ({
      ...prev,
      unitPath,
      lessonPath: firstLesson?.fullPath ?? null,
    }))

    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(unitPath)) {
        next.delete(unitPath)
      } else {
        next.add(unitPath)
      }
      return next
    })
  }

  const handleLessonClick = (lessonPath: string) => {
    setSelection((prev) => ({
      ...prev,
      lessonPath,
    }))
    setIsSidebarOpen(false)
  }

  const breadcrumb = getBreadcrumb(selection, tree)

  return (
    <div className="app-shell">
      <header className="gnb">
        <div className="gnb-left">
          <button
            type="button"
            className="menu-button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            aria-label="사이드바 열기"
          >
            ☰
          </button>
          <div>
            <p className="site-kicker">Google Drive Archive</p>
            <h1>2026 나루초 3학년 연구실</h1>
          </div>
        </div>
        <div className="semester-tabs" role="tablist" aria-label="학기 선택">
          {SEMESTER_NAMES.map((semesterName) => {
            const semesterNode = availableSemesters.find((node) => node.name === semesterName)
            const disabled = !semesterNode
            const active = semesterNode?.fullPath === selection.semesterPath

            return (
              <button
                key={semesterName}
                type="button"
                role="tab"
                disabled={disabled}
                aria-selected={active}
                className={`semester-tab ${active ? 'active' : ''}`}
                onClick={() => semesterNode && handleSemesterClick(semesterNode.fullPath)}
              >
                {semesterName}
              </button>
            )
          })}
        </div>
      </header>

      <div className="layout">
        <aside className={`lnb ${isSidebarOpen ? 'open' : ''}`}>
          <section>
            <h2>과목</h2>
            <ul className="subject-list">
              {(tree?.subjects ?? []).map((subject) => (
                <li key={subject.fullPath}>
                  <button
                    type="button"
                    className={`subject-button ${selection.subjectPath === subject.fullPath ? 'active' : ''}`}
                    onClick={() => handleSubjectClick(subject.fullPath)}
                  >
                    {subject.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>단원 / 차시</h2>
            {!activeBaseNode && <p className="placeholder">과목을 선택하면 단원 목록이 나타납니다.</p>}
            {activeBaseNode && !activeBaseNode.childrenFolders.length && (
              <p className="placeholder">하위 폴더가 없습니다.</p>
            )}
            {activeBaseNode && !!activeBaseNode.childrenFolders.length && (
              <ul className="unit-list">
                {activeBaseNode.childrenFolders.map((unit) => {
                  const isExpanded = expandedPaths.has(unit.fullPath)
                  const isUnitActive = selection.unitPath === unit.fullPath

                  return (
                    <li key={unit.fullPath}>
                      <button
                        type="button"
                        className={`unit-button ${isUnitActive ? 'active' : ''}`}
                        onClick={() => handleUnitClick(unit.fullPath)}
                      >
                        <span>{unit.name}</span>
                        {unit.childrenFolders.length > 0 && <span>{isExpanded ? '▾' : '▸'}</span>}
                      </button>

                      {isExpanded && unit.childrenFolders.length > 0 && (
                        <ul className="lesson-list">
                          {unit.childrenFolders.map((lesson) => (
                            <li key={lesson.fullPath}>
                              <button
                                type="button"
                                className={`lesson-button ${selection.lessonPath === lesson.fullPath ? 'active' : ''}`}
                                onClick={() => handleLessonClick(lesson.fullPath)}
                              >
                                {lesson.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </aside>

        <main className="content">
          <div className="content-header">
            <p className="breadcrumb-label">현재 위치</p>
            <h2>{breadcrumb}</h2>
          </div>

          {isLoading && <div className="state-box">자료를 불러오는 중입니다...</div>}

          {!isLoading && error && (
            <div className="state-box error">
              <p>{error}</p>
              <button type="button" className="retry-button" onClick={() => void fetchData()}>
                다시 시도
              </button>
            </div>
          )}

          {!isLoading && !error && !tree && <div className="state-box">표시할 자료가 없습니다.</div>}

          {!isLoading && !error && tree && !files.length && (
            <div className="state-box">선택한 폴더에 파일이 없습니다.</div>
          )}

          {!isLoading && !error && !!files.length && (
            <section className="card-grid" aria-label="자료 목록">
              {files.map((file) => {
                const iconKey = getFileIconKey(file.ext || file.name)
                return (
                  <a
                    key={file.id}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="file-card"
                    title={file.name}
                  >
                    <div className="file-card-top">
                      <span className="file-icon" aria-hidden="true">
                        {FILE_ICON_MAP[iconKey]}
                      </span>
                      <span className={`file-badge ${iconKey}`}>{getFileTypeLabel(iconKey)}</span>
                    </div>
                    <p className="file-name">{file.name}</p>
                    <p className="file-date">수정일: {formatDate(file.lastUpdated)}</p>
                  </a>
                )
              })}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
