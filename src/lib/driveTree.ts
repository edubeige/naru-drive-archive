export interface DriveItemRaw {
  name: string
  type: 'folder' | 'file'
  url: string
  path: string
  lastUpdated: string
}

export interface FileItem {
  id: string
  name: string
  ext: string
  url: string
  fullPath: string
  folderPath: string
  lastUpdated: string
}

export interface FolderNode {
  id: string
  name: string
  fullPath: string
  parentPath: string | null
  url?: string
  lastUpdated?: string
  childrenFolders: FolderNode[]
  files: FileItem[]
}

export interface DriveTree {
  rootPath: string
  rootNode: FolderNode
  nodesByPath: Map<string, FolderNode>
  subjects: FolderNode[]
}

const PATH_DELIMITER = ' > '
const SORT_LOCALE = 'ko-KR'

function splitPath(path: string): string[] {
  return path
    .split(PATH_DELIMITER)
    .map((part) => part.trim())
    .filter(Boolean)
}

function joinPath(parentPath: string, name: string): string {
  return parentPath ? `${parentPath}${PATH_DELIMITER}${name}` : name
}

function extractExt(fileName: string): string {
  const matched = /\.([a-zA-Z0-9]+)$/.exec(fileName)
  return matched ? matched[1].toLowerCase() : ''
}

function compareByDisplay(a: { name: string; lastUpdated?: string }, b: { name: string; lastUpdated?: string }): number {
  const byName = a.name.localeCompare(b.name, SORT_LOCALE, { numeric: true, sensitivity: 'base' })

  if (byName !== 0) {
    return byName
  }

  const aTime = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0
  const bTime = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0
  return bTime - aTime
}

function ensureNode(
  nodesByPath: Map<string, FolderNode>,
  fullPath: string,
  name: string,
  parentPath: string | null,
): FolderNode {
  const existing = nodesByPath.get(fullPath)
  if (existing) {
    return existing
  }

  const node: FolderNode = {
    id: fullPath,
    name,
    fullPath,
    parentPath,
    childrenFolders: [],
    files: [],
  }

  nodesByPath.set(fullPath, node)

  if (parentPath) {
    const parent = nodesByPath.get(parentPath)
    if (parent && !parent.childrenFolders.some((child) => child.fullPath === fullPath)) {
      parent.childrenFolders.push(node)
    }
  }

  return node
}

function ensurePathChain(nodesByPath: Map<string, FolderNode>, rawPath: string): FolderNode {
  const segments = splitPath(rawPath)

  if (segments.length === 0) {
    throw new Error('Invalid path: empty')
  }

  let currentPath = ''
  let parentPath: string | null = null
  let currentNode: FolderNode | null = null

  segments.forEach((segment) => {
    currentPath = currentPath ? `${currentPath}${PATH_DELIMITER}${segment}` : segment
    currentNode = ensureNode(nodesByPath, currentPath, segment, parentPath)
    parentPath = currentPath
  })

  if (!currentNode) {
    throw new Error('Invalid path: unable to resolve node')
  }

  return currentNode
}

function sortTree(node: FolderNode): void {
  node.childrenFolders.sort((a, b) => compareByDisplay(a, b))
  node.files.sort((a, b) => compareByDisplay(a, b))

  node.childrenFolders.forEach((child) => sortTree(child))
}

export function buildDriveTree(items: DriveItemRaw[]): DriveTree {
  if (!items.length) {
    throw new Error('No data')
  }

  const nodesByPath = new Map<string, FolderNode>()

  items.forEach((item) => {
    ensurePathChain(nodesByPath, item.path)

    if (item.type === 'folder') {
      const fullPath = joinPath(item.path, item.name)
      const folder = ensureNode(nodesByPath, fullPath, item.name, item.path)
      folder.url = item.url
      folder.lastUpdated = item.lastUpdated
      return
    }

    const parent = ensurePathChain(nodesByPath, item.path)
    const filePath = joinPath(item.path, item.name)

    if (parent.files.some((file) => file.fullPath === filePath)) {
      return
    }

    parent.files.push({
      id: item.url || filePath,
      name: item.name,
      ext: extractExt(item.name),
      url: item.url,
      fullPath: filePath,
      folderPath: item.path,
      lastUpdated: item.lastUpdated,
    })
  })

  const rootSegment = splitPath(items[0].path)[0]
  const rootNode = nodesByPath.get(rootSegment)

  if (!rootNode) {
    throw new Error('Root node not found')
  }

  sortTree(rootNode)

  return {
    rootPath: rootNode.fullPath,
    rootNode,
    nodesByPath,
    subjects: [...rootNode.childrenFolders],
  }
}

export type FileIconKey = 'presentation' | 'pdf' | 'hwp' | 'doc' | 'sheet' | 'video' | 'archive' | 'file'

export function getFileIconKey(fileNameOrExt: string): FileIconKey {
  const normalized = fileNameOrExt.toLowerCase()
  const ext = normalized.includes('.') ? extractExt(normalized) : normalized

  if (['ppt', 'pptx', 'key'].includes(ext)) {
    return 'presentation'
  }

  if (ext === 'pdf') {
    return 'pdf'
  }

  if (['hwp', 'hwpx'].includes(ext)) {
    return 'hwp'
  }

  if (['doc', 'docx'].includes(ext)) {
    return 'doc'
  }

  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return 'sheet'
  }

  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return 'video'
  }

  if (['zip', 'rar', '7z'].includes(ext)) {
    return 'archive'
  }

  return 'file'
}

export function getFileTypeLabel(iconKey: FileIconKey): string {
  switch (iconKey) {
    case 'presentation':
      return 'PPT'
    case 'pdf':
      return 'PDF'
    case 'hwp':
      return 'HWP'
    case 'doc':
      return 'DOC'
    case 'sheet':
      return 'SHEET'
    case 'video':
      return 'VIDEO'
    case 'archive':
      return 'ZIP'
    default:
      return 'FILE'
  }
}
