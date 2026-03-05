import { describe, expect, it } from 'vitest'
import { buildDriveTree, getFileIconKey } from './driveTree'

const sample = [
  {
    name: '01. 국어',
    type: 'folder',
    url: 'https://drive.google.com/subject',
    path: '2026 3학년',
    lastUpdated: '2026-03-04T05:33:16.091Z',
  },
  {
    name: '1학기',
    type: 'folder',
    url: 'https://drive.google.com/semester',
    path: '2026 3학년 > 01. 국어',
    lastUpdated: '2026-03-04T05:35:22.725Z',
  },
  {
    name: '01. 생생하게 표현해요',
    type: 'folder',
    url: 'https://drive.google.com/unit',
    path: '2026 3학년 > 01. 국어 > 1학기',
    lastUpdated: '2026-03-04T05:35:32.602Z',
  },
  {
    name: '01차시',
    type: 'folder',
    url: 'https://drive.google.com/lesson',
    path: '2026 3학년 > 01. 국어 > 1학기 > 01. 생생하게 표현해요',
    lastUpdated: '2026-03-04T06:00:07.389Z',
  },
  {
    name: '수업PPT.pptx',
    type: 'file',
    url: 'https://docs.google.com/presentation/d/1',
    path: '2026 3학년 > 01. 국어 > 1학기 > 01. 생생하게 표현해요 > 01차시',
    lastUpdated: '2026-03-04T06:01:32.000Z',
  },
] as const

describe('buildDriveTree', () => {
  it('builds subject > semester > unit > lesson hierarchy', () => {
    const tree = buildDriveTree([...sample])

    expect(tree.rootNode.name).toBe('2026 3학년')
    expect(tree.subjects).toHaveLength(1)
    expect(tree.subjects[0].name).toBe('01. 국어')

    const lessonPath = '2026 3학년 > 01. 국어 > 1학기 > 01. 생생하게 표현해요 > 01차시'
    const lessonNode = tree.nodesByPath.get(lessonPath)

    expect(lessonNode).toBeTruthy()
    expect(lessonNode?.files).toHaveLength(1)
    expect(lessonNode?.files[0].name).toBe('수업PPT.pptx')
  })
})

describe('getFileIconKey', () => {
  it('maps known file extensions', () => {
    expect(getFileIconKey('pptx')).toBe('presentation')
    expect(getFileIconKey('교안.pdf')).toBe('pdf')
    expect(getFileIconKey('hwp')).toBe('hwp')
    expect(getFileIconKey('docx')).toBe('doc')
    expect(getFileIconKey('xlsx')).toBe('sheet')
    expect(getFileIconKey('mp4')).toBe('video')
    expect(getFileIconKey('zip')).toBe('archive')
  })

  it('returns default file for unknown extension', () => {
    expect(getFileIconKey('txt')).toBe('file')
  })
})
