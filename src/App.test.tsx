import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const data = [
  {
    name: '02. 수학',
    type: 'folder',
    url: 'https://drive.google.com/subject2',
    path: '2026 3학년',
    lastUpdated: '2026-03-04T05:33:20.203Z',
  },
  {
    name: '01. 국어',
    type: 'folder',
    url: 'https://drive.google.com/subject1',
    path: '2026 3학년',
    lastUpdated: '2026-03-04T05:33:16.091Z',
  },
  {
    name: '1학기',
    type: 'folder',
    url: 'https://drive.google.com/semester1',
    path: '2026 3학년 > 01. 국어',
    lastUpdated: '2026-03-04T05:35:22.725Z',
  },
  {
    name: '01. 생생하게 표현해요',
    type: 'folder',
    url: 'https://drive.google.com/unit1',
    path: '2026 3학년 > 01. 국어 > 1학기',
    lastUpdated: '2026-03-04T05:35:32.602Z',
  },
  {
    name: '01차시',
    type: 'folder',
    url: 'https://drive.google.com/lesson1',
    path: '2026 3학년 > 01. 국어 > 1학기 > 01. 생생하게 표현해요',
    lastUpdated: '2026-03-04T06:00:07.389Z',
  },
  {
    name: '국어수업.pptx',
    type: 'file',
    url: 'https://docs.google.com/presentation/d/1',
    path: '2026 3학년 > 01. 국어 > 1학기 > 01. 생생하게 표현해요 > 01차시',
    lastUpdated: '2026-03-04T06:01:32.000Z',
  },
  {
    name: '03. 도형',
    type: 'folder',
    url: 'https://drive.google.com/unit2',
    path: '2026 3학년 > 02. 수학',
    lastUpdated: '2026-03-04T06:35:32.602Z',
  },
  {
    name: '02차시',
    type: 'folder',
    url: 'https://drive.google.com/lesson2',
    path: '2026 3학년 > 02. 수학 > 03. 도형',
    lastUpdated: '2026-03-04T07:00:07.389Z',
  },
  {
    name: '수학활동지.pdf',
    type: 'file',
    url: 'https://drive.google.com/file/d/2/view',
    path: '2026 3학년 > 02. 수학 > 03. 도형 > 02차시',
    lastUpdated: '2026-03-04T07:01:32.000Z',
  },
] as const

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          json: async () => data,
        }) as Response,
      ),
    )
  })

  it('loads subjects and renders breadcrumb + cards', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '01. 국어' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '02. 수학' })).toBeInTheDocument()
    })

    expect(screen.getByText(/현재 위치/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /국어수업.pptx/ })).toBeInTheDocument()
  })

  it('switches subject and shows matching files only', async () => {
    const user = userEvent.setup()
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '02. 수학' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '02. 수학' }))

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /수학활동지.pdf/ })).toBeInTheDocument()
    })

    expect(screen.queryByRole('link', { name: /국어수업.pptx/ })).not.toBeInTheDocument()
  })

  it('renders card links with safe target attributes', async () => {
    render(<App />)

    const fileLink = await screen.findByRole('link', { name: /국어수업.pptx/ })

    expect(fileLink).toHaveAttribute('target', '_blank')
    expect(fileLink).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(fileLink).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })
})
