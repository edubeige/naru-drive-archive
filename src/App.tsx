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
import ReservationDashboard from './ui/ReservationDashboard'

interface SelectionState {
  subjectPath: string | null
  semesterPath: string | null
  unitPath: string | null
  lessonPath: string | null
}

type AppTab = 'home' | 'materials' | 'reservation'

const FALLBACK_API_URL =
  'https://script.google.com/macros/s/AKfycbzONOmQfiiuOEn7_jeOChPkzS-_qAsuFfMDreUs3o43OLOF6e8GezyDny8yqtL_TUBR6Q/exec'

const SEMESTER_NAMES = ['1�б�', '2�б�']
const MATERIALS_CACHE_KEY = 'naru_materials_cache_v1'
const MATERIALS_CACHE_TTL_MS = 1000 * 60 * 10
const MATERIALS_UPLOAD_MAX_MB = 20
const MATERIALS_UPLOAD_MAX_BYTES = MATERIALS_UPLOAD_MAX_MB * 1024 * 1024
const MATERIALS_UPLOAD_ALLOWED_EXT = [
  'pdf',
  'ppt',
  'pptx',
  'hwp',
  'hwpx',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'zip',
  'jpg',
  'jpeg',
  'png',
  'gif',
]

const FILE_ICON_MAP: Record<FileIconKey, string> = {
  presentation: '??',
  pdf: '??',
  hwp: '??',
  doc: '??',
  sheet: '??',
  video: '??',
  archive: '???',
  file: '??',
}

interface MaterialsCachePayload {
  savedAt: number
  items: DriveItemRaw[]
}

function readMaterialsCache(): DriveItemRaw[] | null {
  try {
    const raw = localStorage.getItem(MATERIALS_CACHE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as MaterialsCachePayload
    if (!parsed?.items || !Array.isArray(parsed.items)) {
      return null
    }

    if (Date.now() - parsed.savedAt > MATERIALS_CACHE_TTL_MS) {
      return null
    }

    return parsed.items
  } catch {
    return null
  }
}

function writeMaterialsCache(items: DriveItemRaw[]): void {
  try {
    const payload: MaterialsCachePayload = {
      savedAt: Date.now(),
      items,
    }
    localStorage.setItem(MATERIALS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    // ignore localStorage errors
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : ''
      const base64 = raw.includes(',') ? raw.split(',')[1] : raw
      if (!base64) {
        reject(new Error('���� ���ڵ� ����'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('���� �б� ����'))
    reader.readAsDataURL(file)
  })
}

function getFileExtension(fileName: string): string {
  const matched = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return matched ? matched[1].toLowerCase() : ''
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
    return '���õ� ��ΰ� �����ϴ�.'
  }

  const labels = [selection.subjectPath, selection.semesterPath, selection.unitPath, selection.lessonPath]
    .filter((path): path is string => Boolean(path))
    .map((path) => tree.nodesByPath.get(path)?.name)
    .filter((name): name is string => Boolean(name))

  return labels.length ? labels.join(' > ') : '���õ� ��ΰ� �����ϴ�.'
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

function normalizeMaterialsResponse(payload: unknown): DriveItemRaw[] {
  const candidate = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)
      ? (payload as { data: unknown[] }).data
      : payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown[] }).items)
        ? (payload as { items: unknown[] }).items
        : []

  const normalized = candidate.filter((item): item is DriveItemRaw => {
    if (!item || typeof item !== 'object') {
      return false
    }

    const row = item as Record<string, unknown>
    return (
      typeof row.name === 'string' &&
      typeof row.type === 'string' &&
      typeof row.url === 'string' &&
      typeof row.path === 'string' &&
      (row.type === 'folder' || row.type === 'file')
    )
  })

  return normalized
}
function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('home')
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
  const [isLoading, setIsLoading] = useState(false)
  const [hasFetchedMaterials, setHasFetchedMaterials] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null)
  const [navQuery, setNavQuery] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)

  const apiUrl = import.meta.env.VITE_API_URL || FALLBACK_API_URL
  const materialsUploadEnabled = (import.meta.env.VITE_ENABLE_MATERIALS_UPLOAD ?? 'false') === 'true'
  const materialsUploadApiUrl = import.meta.env.VITE_MATERIALS_UPLOAD_API_URL || apiUrl

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

  const applyTreeFromItems = (items: DriveItemRaw[]) => {
    const nextTree = buildDriveTree(items)
    setTree(nextTree)

    const nextSelection = createSelectionForSubject(nextTree.subjects[0])
    setSelection(nextSelection)

    const nextExpandedUnits = new Set<string>()
    if (nextSelection.unitPath) {
      nextExpandedUnits.add(nextSelection.unitPath)
    }

    setExpandedUnits(nextExpandedUnits)
    setExpandedSubjects(new Set(nextSelection.subjectPath ? [nextSelection.subjectPath] : []))
  }

  const fetchData = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent) {
      setIsLoading(true)
      setError(null)
    }

    try {
      const response = await fetch(apiUrl)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const payload = (await response.json()) as unknown
      const items = normalizeMaterialsResponse(payload)
      if (!items.length) {
        throw new Error('INVALID_MATERIALS_PAYLOAD')
      }

      writeMaterialsCache(items)
      applyTreeFromItems(items)
      setError(null)
    } catch (error) {
      if (!silent) {
        const message = error instanceof Error && error.message === 'INVALID_MATERIALS_PAYLOAD'
          ? 'Invalid materials API response. Check VITE_API_URL points to the drive list webapp.'
          : 'Failed to load materials. Check network and VITE_API_URL.'
        setError(message)
        setTree(null)
      }
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    if (activeTab !== 'materials' || hasFetchedMaterials) {
      return
    }

    setHasFetchedMaterials(true)

    const cachedItems = readMaterialsCache()
    if (cachedItems?.length) {
      try {
        applyTreeFromItems(cachedItems)
        setError(null)
      } catch {
        // ignore broken cache
      }

      void fetchData({ silent: true })
      return
    }

    void fetchData()
  }, [activeTab, hasFetchedMaterials])

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


  const handleUploadFileChange = (file: File | null) => {
    if (!file) {
      setUploadFile(null)
      setUploadMessage(null)
      return
    }

    const ext = getFileExtension(file.name)
    if (!MATERIALS_UPLOAD_ALLOWED_EXT.includes(ext)) {
      setUploadFile(null)
      setUploadMessage(`Unsupported file type: ${ext || 'none'}`)
      return
    }

    if (file.size > MATERIALS_UPLOAD_MAX_BYTES) {
      setUploadFile(null)
      setUploadMessage(`File too large: max ${MATERIALS_UPLOAD_MAX_MB}MB`)
      return
    }

    setUploadFile(file)
    setUploadMessage(null)
  }

  const handleUploadToDrive = async () => {
    if (!materialsUploadEnabled) {
      return
    }

    if (!uploadFile || !selectedFolderPath) {
      setUploadMessage('���ε��� ���ϰ� ��� ������ ���� ������ �ּ���.')
      return
    }

    const ext = getFileExtension(uploadFile.name)
    if (!MATERIALS_UPLOAD_ALLOWED_EXT.includes(ext)) {
      setUploadMessage(`Unsupported file type: ${ext || 'none'}`)
      return
    }

    if (uploadFile.size > MATERIALS_UPLOAD_MAX_BYTES) {
      setUploadMessage(`File too large: max ${MATERIALS_UPLOAD_MAX_MB}MB`)
      return
    }

    setIsUploading(true)
    setUploadMessage(null)

    try {
      const base64 = await fileToBase64(uploadFile)
      const payload = new URLSearchParams({
        action: 'uploadFile',
        targetPath: selectedFolderPath,
        fileName: uploadFile.name,
        mimeType: uploadFile.type || 'application/octet-stream',
        fileBase64: base64,
      })

      const response = await fetch(materialsUploadApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: payload.toString(),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const result = (await response.json()) as {
        success?: boolean
        message?: string
        data?: { folderName?: string; targetPath?: string }
      }

      if (!result?.success) {
        throw new Error(result?.message || 'Upload API returned success=false')
      }

      await fetchData({ silent: true })
      setUploadFile(null)
      const location = result.data?.targetPath || result.data?.folderName
      setUploadMessage(location ? `Upload complete: ${location}` : 'Upload complete: file stored in Drive.')
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error'
      setUploadMessage(`Upload failed: ${detail}`)
    } finally {
      setIsUploading(false)
    }
  }
  const breadcrumb = getBreadcrumb(selection, tree)
  const previewUrl = previewFile ? getPreviewUrl(previewFile) : null

  return (
    <div className={`app-shell ${isSidebarOpen ? 'sidebar-open' : ''}`}>
      <header className="gnb">
        <div className="gnb-left">
          <button
            type="button"
            className="menu-button"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            aria-label="���̵�� ����"
          >
            ?
          </button>
          <div>
            <p className="site-kicker">Google Drive Archive</p>
            <h1>2026 ������ 3�г� ������</h1>
          </div>
        </div>

        {activeTab === 'materials' && (
          <div className="semester-tabs" role="tablist" aria-label="�б� ����">
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
        <button
          type="button"
          className={`lnb-backdrop ${isSidebarOpen ? 'show' : ''}`}
          aria-label="���̵�� �ݱ�"
          onClick={() => setIsSidebarOpen(false)}
        />
        <aside className={`lnb ${isSidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-tabs" role="tablist" aria-label="������ ��">
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
              Ȩ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'materials'}
              className={`sidebar-tab ${activeTab === 'materials' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('materials')
                setIsSidebarOpen(false)
              }}
            >
              ���� �ڷ�
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'reservation'}
              className={`sidebar-tab ${activeTab === 'reservation' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('reservation')
                setIsSidebarOpen(false)
              }}
            >
              ����
            </button>
          </div>

          {activeTab === 'materials' && (
            <section>
              <div className="nav-title-row">
                <h2>���� Ž��</h2>
                <div className="nav-fold-actions">
                  <button type="button" onClick={expandAllSubjects}>��ü ��ħ</button>
                  <button type="button" onClick={collapseAllSubjects}>��ü ����</button>
                </div>
              </div>
              <input
                className="nav-search"
                value={navQuery}
                onChange={(event) => setNavQuery(event.target.value)}
                placeholder="����, �ܿ�, ����, ���� �˻�"
                aria-label="Ž�� �˻�"
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
                          aria-label={`${subject.name} ����/��ġ��`}
                          onClick={() => toggleSubject(subject.fullPath)}
                        >
                          {isSubjectExpanded ? '?' : '?'}
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
                                            {unit.childrenFolders.length > 0 && <span>{isExpanded ? '?' : '?'}</span>}
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

              {!visibleSubjects.length && <p className="no-search-result">�˻� ����� �����ϴ�.</p>}
            </section>
          )}


          {activeTab === 'reservation' && (
            <section className="home-sidebar-note">
              <h2>���� �ȳ�</h2>
              <p>�б�(3-1~3-5)�� ��ǰ, ��¥, ����(1~6)�� ������ ����մϴ�.</p>
              <p>�ݳ� �Ϸ� ��ư���� �̹ݳ� ����� �ٷ� ������ �� �ֽ��ϴ�.</p>
            </section>
          )}
        </aside>

        <main className="content">
          {activeTab === 'materials' && (
            <>
              <div className="content-header">
                <p className="breadcrumb-label">���� ��ġ</p>
                <h2>{breadcrumb}</h2>
                <div className="materials-toolbar">
                  <div className="summary-chips">
                    <span className="summary-chip">���� {visibleFiles.length}��</span>
                    {selectedFolderNode?.url && (
                      <a className="summary-chip link" href={selectedFolderNode.url} target="_blank" rel="noopener noreferrer">
                        ���� ���� ����
                      </a>
                    )}
                  </div>

                  {materialsUploadEnabled && (
                    <div className="materials-upload">
                      <label className="upload-file-label">
                        <input
                          type="file"
                          accept=".pdf,.ppt,.pptx,.hwp,.hwpx,.doc,.docx,.xls,.xlsx,.zip,.jpg,.jpeg,.png,.gif"
                          onChange={(event) => handleUploadFileChange(event.target.files?.[0] ?? null)}
                          disabled={isUploading}
                        />
                      </label>
                      <button
                        type="button"
                        className="action-button primary"
                        disabled={isUploading || !uploadFile || !selectedFolderPath}
                        onClick={() => void handleUploadToDrive()}
                      >
                        {isUploading ? '���ε� ��...' : '����̺� ���ε�'}
                      </button>
                    </div>
                  )}
                </div>
                {materialsUploadEnabled && uploadMessage && <p className="upload-message">{uploadMessage}</p>}
              </div>

              {isLoading && <div className="state-box">�ڷḦ �ҷ����� ���Դϴ�...</div>}
              {!isLoading && error && (
                <div className="state-box error">
                  <p>{error}</p>
                  <button type="button" className="retry-button" onClick={() => void fetchData()}>
                    �ٽ� �õ�
                  </button>
                </div>
              )}
              {!isLoading && !error && !tree && <div className="state-box">ǥ���� �ڷᰡ �����ϴ�.</div>}
              {!isLoading && !error && tree && !visibleFiles.length && <div className="state-box">���ǿ� �´� ������ �����ϴ�.</div>}

              {!isLoading && !error && !!visibleFiles.length && (
                <section className="file-list" aria-label="�ڷ� ���">
                  {visibleFiles.map((file) => {
                    const iconKey = getFileIconKey(file.ext || file.name)
                    const rowPreviewUrl = getPreviewUrl(file)

                    return (
                      <article key={file.id} className="file-row">
                        <div className="file-info">
                          <span className="file-icon" aria-hidden="true">{FILE_ICON_MAP[iconKey]}</span>
                          <div>
                            <p className="file-name">{file.name}</p>
                            <p className="file-meta">������: {formatDate(file.lastUpdated)}</p>
                          </div>
                        </div>

                        <div className="file-actions">
                          <span className={`file-badge ${iconKey}`}>{getFileTypeLabel(iconKey)}</span>
                          <button
                            type="button"
                            className="action-button primary"
                            disabled={!rowPreviewUrl}
                            aria-label={`${file.name} �̸�����`}
                            onClick={() => setPreviewFile(file)}
                          >
                            �̸�����
                          </button>
                          <a className="action-button" href={getDownloadUrl(file)} target="_blank" rel="noopener noreferrer" aria-label={`${file.name} �ٿ�ε�`}>
                            �ٿ�ε�
                          </a>
                          <a className="action-button" href={file.url} target="_blank" rel="noopener noreferrer" aria-label={`${file.name} �� â`}>
                            �� â
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
          {activeTab === 'reservation' && <ReservationDashboard />}
        </main>
      </div>

      {previewFile && (
        <div className="preview-overlay" role="dialog" aria-modal="true" aria-label="���� �̸�����">
          <div className="preview-modal">
            <div className="preview-header">
              <h3>{previewFile.name}</h3>
              <button type="button" className="close-button" onClick={() => setPreviewFile(null)} aria-label="�̸����� �ݱ�">
                ?
              </button>
            </div>

            <div className="preview-body">
              {previewUrl ? (
                <iframe title={`${previewFile.name} �̸�����`} src={previewUrl} className="preview-frame" />
              ) : (
                <p>�� ���� ������ �̸����⸦ �������� �ʽ��ϴ�. �� â���� ���� �ּ���.</p>
              )}
            </div>

            <div className="preview-footer">
              <a className="action-button" href={getDownloadUrl(previewFile)} target="_blank" rel="noopener noreferrer">�ٿ�ε�</a>
              <a className="action-button" href={previewFile.url} target="_blank" rel="noopener noreferrer">�� ��</a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App














