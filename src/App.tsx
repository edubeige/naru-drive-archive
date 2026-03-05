import { useEffect, useMemo, useState } from 'react'
import './styles.css'
import {
  buildDriveTree,
  getFileIconKey,
  getFileTypeLabel,
  type DriveItemRaw,
  type DriveTree,
  type FileIconKey,
  type FileItem,
  type FolderNode,
} from './lib/driveTree'
import HomeDashboard from './ui/HomeDashboard'

interface SelectionState {
  subjectPath: string | null
  semesterPath: string | null
  unitPath: string | null
  lessonPath: string | null
}

type AppTab = 'home' | 'materials'

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
  const baseNode = semesterPath ? semesterNodes[0] : subject

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

function extractDriveFileId(url: string): string | null {
  const byPath = /\/d\/([a-zA-Z0-9_-]+)/.exec(url)
  if (byPath?.[1]) {
    return byPath[1]
  }

  try {
    const parsed = new URL(url)
    const id = parsed.searchParams.get('id')
    return id || null
  } catch {
    return null
  }
}

function getDownloadUrl(file: FileItem): string {
  const id = extractDriveFileId(file.url)
  if (!id) {
    return file.url
  }

  return `https://drive.google.com/uc?export=download&id=${id}`
}

function getPreviewUrl(file: FileItem): string | null {
  const iconKey = getFileIconKey(file.ext || file.name)
  const previewable = ['presentation', 'pdf', 'doc', 'sheet', 'video'].includes(iconKey)

  if (!previewable) {
    return null
  }

  const id = extractDriveFileId(file.url)
  if (!id) {
    return file.url
  }

  return `https://drive.google.com/file/d/${id}/preview`
}

function includesText(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

function folderMatches(node: FolderNode, query: string): boolean {
  if (!query) {
    return true
  }

  if (includesText(node.name, query)) {
    return true
  }

  return node.childrenFolders.some((child) => folderMatches(child, query))
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('materials')
  const [tree, setTree] = useState<DriveTree | null>(null)
  const [selection, setSelection] = useState<SelectionState>({
    subjectPath: null,
    semesterPath: null,
    unitPath: null,
    lessonPath: null,
  })
  const [expandedUnits, setExpandedUnits] = useState<Set<string>>(new Set())
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set())
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [navQuery, setNavQuery] = useState('')

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

  const selectedFolderPath = selection.lessonPath || selection.unitPath || selection.semesterPath || selection.subjectPath

  const selectedFolderNode = useMemo(() => {
    if (!tree || !selectedFolderPath) {
      return null
    }
    return tree.nodesByPath.get(selectedFolderPath) ?? null
  }, [tree, selectedFolderPath])

  const files = selectedFolderNode?.files ?? []

  const visibleFiles = useMemo(() => {
    const query = navQuery.trim()
    if (!query) {
      return files
    }
    return files.filter((file) => includesText(file.name, query))
  }, [files, navQuery])

  const visibleSubjects = useMemo(() => {
    const subjects = tree?.subjects ?? []
    const query = navQuery.trim()
    if (!query) {
      return subjects
    }
    return subjects.filter((subject) => folderMatches(subject, query))
  }, [tree, navQuery])

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
        setSelection({ subjectPath: null, semesterPath: null, unitPath: null, lessonPath: null })
        return
      }

      const nextTree = buildDriveTree(json)
      setTree(nextTree)

      const nextSelection = createSelectionForSubject(nextTree.subjects[0])
      setSelection(nextSelection)

      const nextExpandedUnits = new Set<string>()
      if (nextSelection.unitPath) {
        nextExpandedUnits.add(nextSelection.unitPath)
      }

      setExpandedUnits(nextExpandedUnits)
      setExpandedSubjects(new Set(nextTree.subjects.map((subject) => subject.fullPath)))
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

    const nextExpandedUnits = new Set<string>()
    if (nextSelection.unitPath) {
      nextExpandedUnits.add(nextSelection.unitPath)
    }

    setExpandedUnits(nextExpandedUnits)
    setExpandedSubjects((prev) => new Set(prev).add(subjectPath))
  }

  const toggleSubject = (subjectPath: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(subjectPath)) {
        next.delete(subjectPath)
      } else {
        next.add(subjectPath)
      }
      return next
    })
  }

  const expandAllSubjects = () => {
    setExpandedSubjects(new Set((tree?.subjects ?? []).map((subject) => subject.fullPath)))
  }

  const collapseAllSubjects = () => {
    setExpandedSubjects(new Set())
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

    const nextExpandedUnits = new Set<string>()
    if (firstUnit) {
      nextExpandedUnits.add(firstUnit.fullPath)
    }
    setExpandedUnits(nextExpandedUnits)
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
    setSelection((prev) => ({ ...prev, unitPath, lessonPath: firstLesson?.fullPath ?? null }))

    setExpandedUnits((prev) => {
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
    setSelection((prev) => ({ ...prev, lessonPath }))
    setIsSidebarOpen(false)
  }

  const breadcrumb = getBreadcrumb(selection, tree)
  const previewUrl = previewFile ? getPreviewUrl(previewFile) : null

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

        {activeTab === 'materials' && (
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
        )}
      </header>

      <div className="layout">
        <aside className={`lnb ${isSidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-tabs" role="tablist" aria-label="페이지 탭">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'home'}
              className={`sidebar-tab ${activeTab === 'home' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('home')
                setIsSidebarOpen(false)
              }}
            >
              홈
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'materials'}
              className={`sidebar-tab ${activeTab === 'materials' ? 'active' : ''}`}
              onClick={() => setActiveTab('materials')}
            >
              과목 자료
            </button>
          </div>

          {activeTab === 'materials' && (
            <section>
              <div className="nav-title-row">
                <h2>과목 탐색</h2>
                <div className="nav-fold-actions">
                  <button type="button" onClick={expandAllSubjects}>전체 펼침</button>
                  <button type="button" onClick={collapseAllSubjects}>전체 접기</button>
                </div>
              </div>
              <input
                className="nav-search"
                value={navQuery}
                onChange={(event) => setNavQuery(event.target.value)}
                placeholder="과목, 단원, 차시, 파일 검색"
                aria-label="탐색 검색"
              />

              <ul className="subject-list">
                {visibleSubjects.map((subject) => {
                  const isActiveSubject = selection.subjectPath === subject.fullPath
                  const isSubjectExpanded = expandedSubjects.has(subject.fullPath) || !!navQuery.trim()
                  const semesterNodes = getSemesterNodes(subject)
                  const baseNodes = semesterNodes.length ? semesterNodes : [subject]
                  const visibleBaseNodes = baseNodes.filter((baseNode) => folderMatches(baseNode, navQuery.trim()))

                  return (
                    <li key={subject.fullPath} className="subject-item">
                      <div className="subject-head">
                        <button
                          type="button"
                          className={`subject-button ${isActiveSubject ? 'active' : ''}`}
                          onClick={() => handleSubjectClick(subject.fullPath)}
                        >
                          <span>{subject.name}</span>
                        </button>
                        <button
                          type="button"
                          className="subject-toggle"
                          aria-label={`${subject.name} 접기/펼치기`}
                          onClick={() => toggleSubject(subject.fullPath)}
                        >
                          {isSubjectExpanded ? '▾' : '▸'}
                        </button>
                      </div>

                      {isSubjectExpanded && (
                        <ul className="semester-list">
                          {visibleBaseNodes.map((baseNode) => {
                            const isSemester = baseNode.fullPath !== subject.fullPath
                            const isActiveSemester = selection.semesterPath === baseNode.fullPath || (!selection.semesterPath && !isSemester)
                            const unitNodes = baseNode.childrenFolders.filter((unit) => folderMatches(unit, navQuery.trim()))

                            return (
                              <li key={baseNode.fullPath}>
                                {isSemester && (
                                  <button
                                    type="button"
                                    className={`semester-button ${isActiveSemester ? 'active' : ''}`}
                                    onClick={() => handleSemesterClick(baseNode.fullPath)}
                                  >
                                    {baseNode.name}
                                  </button>
                                )}

                                {!!unitNodes.length && (
                                  <ul className="unit-list">
                                    {unitNodes.map((unit) => {
                                      const isExpanded = expandedUnits.has(unit.fullPath) || !!navQuery.trim()
                                      const isUnitActive = selection.unitPath === unit.fullPath
                                      const lessons = unit.childrenFolders.filter((lesson) =>
                                        includesText(lesson.name, navQuery.trim()) || !navQuery.trim(),
                                      )

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
                                              {lessons.map((lesson) => (
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
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>

              {!visibleSubjects.length && <p className="no-search-result">검색 결과가 없습니다.</p>}
            </section>
          )}

          {activeTab === 'home' && (
            <section className="home-sidebar-note">
              <h2>홈 안내</h2>
              <p>학년 주요행사와 일정을 추가하면 이 기기에서 즉시 저장됩니다.</p>
              <p>백엔드 연결 시 전체 교사가 같은 일정을 공유할 수 있습니다.</p>
            </section>
          )}
        </aside>

        <main className="content">
          {activeTab === 'materials' && (
            <>
              <div className="content-header">
                <p className="breadcrumb-label">현재 위치</p>
                <h2>{breadcrumb}</h2>
                <div className="summary-chips">
                  <span className="summary-chip">파일 {visibleFiles.length}개</span>
                  {selectedFolderNode?.url && (
                    <a className="summary-chip link" href={selectedFolderNode.url} target="_blank" rel="noopener noreferrer">
                      원본 폴더 열기
                    </a>
                  )}
                </div>
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
              {!isLoading && !error && tree && !visibleFiles.length && <div className="state-box">조건에 맞는 파일이 없습니다.</div>}

              {!isLoading && !error && !!visibleFiles.length && (
                <section className="file-list" aria-label="자료 목록">
                  {visibleFiles.map((file) => {
                    const iconKey = getFileIconKey(file.ext || file.name)
                    const rowPreviewUrl = getPreviewUrl(file)

                    return (
                      <article key={file.id} className="file-row">
                        <div className="file-info">
                          <span className="file-icon" aria-hidden="true">{FILE_ICON_MAP[iconKey]}</span>
                          <div>
                            <p className="file-name">{file.name}</p>
                            <p className="file-meta">수정일: {formatDate(file.lastUpdated)}</p>
                          </div>
                        </div>

                        <div className="file-actions">
                          <span className={`file-badge ${iconKey}`}>{getFileTypeLabel(iconKey)}</span>
                          <button
                            type="button"
                            className="action-button primary"
                            disabled={!rowPreviewUrl}
                            aria-label={`${file.name} 미리보기`}
                            onClick={() => setPreviewFile(file)}
                          >
                            미리보기
                          </button>
                          <a className="action-button" href={getDownloadUrl(file)} target="_blank" rel="noopener noreferrer" aria-label={`${file.name} 다운로드`}>
                            다운로드
                          </a>
                          <a className="action-button" href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`${file.name} 새 창`}>
                            새 창
                          </a>
                        </div>
                      </article>
                    )
                  })}
                </section>
              )}
            </>
          )}

          {activeTab === 'home' && <HomeDashboard />}
        </main>
      </div>

      {previewFile && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="파일 미리보기">
          <div className="preview-modal">
            <div className="preview-header">
              <h3>{previewFile.name}</h3>
              <button type="button" className="close-button" onClick={() => setPreviewFile(null)} aria-label="미리보기 닫기">
                ✕
              </button>
            </div>

            <div className="preview-body">
              {previewUrl ? (
                <iframe title={`${previewFile.name} 미리보기`} src={previewUrl} className="preview-frame" />
              ) : (
                <p>이 파일 형식은 미리보기를 지원하지 않습니다. 새 창으로 열어 주세요.</p>
              )}
            </div>

            <div className="preview-footer">
              <a className="action-button" href={getDownloadUrl(previewFile)} target="_blank" rel="noopener noreferrer">다운로드</a>
              <a className="action-button" href={previewFile.url} target="_blank" rel="noopener noreferrer">새 탭</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
