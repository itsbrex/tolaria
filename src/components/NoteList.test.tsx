import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { NoteList } from './NoteList'
import type { VaultEntry, SidebarSelection } from '../types'

const allSelection: SidebarSelection = { kind: 'filter', filter: 'all' }

const mockEntries: VaultEntry[] = [
  {
    path: '/Users/luca/Laputa/project/26q1-laputa-app.md',
    filename: '26q1-laputa-app.md',
    title: 'Build Laputa App',
    isA: 'Project',
    aliases: [],
    belongsTo: [],
    relatedTo: ['[[topic/software-development]]'],
    status: 'Active',
    owner: 'Luca',
    cadence: null,
    modifiedAt: 1700000000,
    fileSize: 1024,
  },
  {
    path: '/Users/luca/Laputa/note/facebook-ads-strategy.md',
    filename: 'facebook-ads-strategy.md',
    title: 'Facebook Ads Strategy',
    isA: 'Note',
    aliases: [],
    belongsTo: ['[[project/26q1-laputa-app]]'],
    relatedTo: ['[[topic/growth]]'],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: 1700000000,
    fileSize: 847,
  },
  {
    path: '/Users/luca/Laputa/person/matteo-cellini.md',
    filename: 'matteo-cellini.md',
    title: 'Matteo Cellini',
    isA: 'Person',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: 1700000000,
    fileSize: 320,
  },
  {
    path: '/Users/luca/Laputa/event/2026-02-14-kickoff.md',
    filename: '2026-02-14-kickoff.md',
    title: 'Kickoff Meeting',
    isA: 'Event',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: 1700000000,
    fileSize: 512,
  },
  {
    path: '/Users/luca/Laputa/topic/software-development.md',
    filename: 'software-development.md',
    title: 'Software Development',
    isA: 'Topic',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    owner: null,
    cadence: null,
    modifiedAt: 1700000000,
    fileSize: 256,
  },
]

describe('NoteList', () => {
  it('shows empty state when no entries', () => {
    render(<NoteList entries={[]} selection={allSelection} />)
    expect(screen.getByText('No notes found')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders all entries with All Notes filter', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} />)
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
    expect(screen.getByText('Facebook Ads Strategy')).toBeInTheDocument()
    expect(screen.getByText('Matteo Cellini')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('filters by People', () => {
    render(<NoteList entries={mockEntries} selection={{ kind: 'filter', filter: 'people' }} />)
    expect(screen.getByText('Matteo Cellini')).toBeInTheDocument()
    expect(screen.queryByText('Build Laputa App')).not.toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('filters by Events', () => {
    render(<NoteList entries={mockEntries} selection={{ kind: 'filter', filter: 'events' }} />)
    expect(screen.getByText('Kickoff Meeting')).toBeInTheDocument()
    expect(screen.queryByText('Build Laputa App')).not.toBeInTheDocument()
  })

  it('filters by section group type', () => {
    render(<NoteList entries={mockEntries} selection={{ kind: 'sectionGroup', type: 'Project' }} />)
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
    expect(screen.queryByText('Matteo Cellini')).not.toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('shows entity pinned at top with children', () => {
    render(
      <NoteList entries={mockEntries} selection={{ kind: 'entity', entry: mockEntries[0] }} />
    )
    // Pinned entity + child (Facebook Ads Strategy belongsTo this project)
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
    expect(screen.getByText('Facebook Ads Strategy')).toBeInTheDocument()
    expect(screen.queryByText('Matteo Cellini')).not.toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('filters by topic (relatedTo references)', () => {
    render(
      <NoteList entries={mockEntries} selection={{ kind: 'topic', entry: mockEntries[4] }} />
    )
    // Build Laputa App has relatedTo: [[topic/software-development]]
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
    expect(screen.queryByText('Facebook Ads Strategy')).not.toBeInTheDocument()
  })

  it('renders a search bar', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} />)
    expect(screen.getByPlaceholderText('Search notes...')).toBeInTheDocument()
  })

  it('filters by search query (case-insensitive substring)', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} />)
    const input = screen.getByPlaceholderText('Search notes...')
    fireEvent.change(input, { target: { value: 'facebook' } })
    expect(screen.getByText('Facebook Ads Strategy')).toBeInTheDocument()
    expect(screen.queryByText('Build Laputa App')).not.toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('sorts entries by last modified descending', () => {
    const entriesWithDifferentDates: VaultEntry[] = [
      { ...mockEntries[0], modifiedAt: 1000, title: 'Oldest' },
      { ...mockEntries[1], modifiedAt: 3000, title: 'Newest', path: '/p2' },
      { ...mockEntries[2], modifiedAt: 2000, title: 'Middle', path: '/p3' },
    ]
    render(<NoteList entries={entriesWithDifferentDates} selection={allSelection} />)
    const titles = screen.getAllByClassName
      ? [] // fallback
      : screen.getAllByText(/Oldest|Newest|Middle/)
    const titleTexts = titles.map((el) => el.textContent)
    expect(titleTexts).toEqual(['Newest', 'Middle', 'Oldest'])
  })

  it('renders type filter pills', () => {
    const { container } = render(<NoteList entries={mockEntries} selection={allSelection} />)
    const pills = container.querySelectorAll('.note-list__pill')
    const labels = Array.from(pills).map((p) => p.textContent)
    expect(labels).toContain('All')
    expect(labels).toContain('Projects')
    expect(labels).toContain('Notes')
    expect(labels).toContain('Events')
    expect(labels).toContain('People')
  })

  it('filters by type pill', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} />)
    fireEvent.click(screen.getByText('Projects'))
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
    expect(screen.queryByText('Matteo Cellini')).not.toBeInTheDocument()
    expect(screen.queryByText('Facebook Ads Strategy')).not.toBeInTheDocument()
  })

  it('clicking All pill resets type filter', () => {
    render(<NoteList entries={mockEntries} selection={allSelection} />)
    fireEvent.click(screen.getByText('People'))
    expect(screen.queryByText('Build Laputa App')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('All'))
    expect(screen.getByText('Build Laputa App')).toBeInTheDocument()
  })
})
