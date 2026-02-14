import { useState } from 'react'
import type { VaultEntry, SidebarSelection } from '../types'
import './NoteList.css'

interface NoteListProps {
  entries: VaultEntry[]
  selection: SidebarSelection
}

/** Check if a wikilink array (e.g. belongsTo) references a given entry by path stem */
function refsMatch(refs: string[], entry: VaultEntry): boolean {
  // Extract the path stem: /Users/luca/Laputa/project/26q1-laputa-app.md → project/26q1-laputa-app
  const stem = entry.path.replace(/^.*\/Laputa\//, '').replace(/\.md$/, '')
  return refs.some((ref) => {
    const inner = ref.replace(/^\[\[/, '').replace(/\]\]$/, '')
    return inner === stem
  })
}

function filterEntries(entries: VaultEntry[], selection: SidebarSelection): VaultEntry[] {
  switch (selection.kind) {
    case 'filter':
      switch (selection.filter) {
        case 'all':
          return entries
        case 'people':
          return entries.filter((e) => e.isA === 'Person')
        case 'events':
          return entries.filter((e) => e.isA === 'Event')
        case 'favorites':
          // TODO: Implement favorites (needs a "favorite" field in frontmatter)
          return []
        case 'trash':
          // TODO: Implement trash (needs deleted/archived status)
          return []
      }
      break
    case 'sectionGroup':
      return entries.filter((e) => e.isA === selection.type)
    case 'entity': {
      const pinned = selection.entry
      const children = entries.filter(
        (e) => e.path !== pinned.path && refsMatch(e.belongsTo, pinned)
      )
      return [pinned, ...children]
    }
    case 'topic': {
      const topic = selection.entry
      return entries.filter((e) => refsMatch(e.relatedTo, topic))
    }
  }
}

function sortByModified(a: VaultEntry, b: VaultEntry): number {
  return (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0)
}

const TYPE_PILLS = [
  { label: 'All', type: null },
  { label: 'Projects', type: 'Project' },
  { label: 'Notes', type: 'Note' },
  { label: 'Events', type: 'Event' },
  { label: 'People', type: 'Person' },
  { label: 'Experiments', type: 'Experiment' },
  { label: 'Procedures', type: 'Procedure' },
  { label: 'Responsibilities', type: 'Responsibility' },
] as const

export function NoteList({ entries, selection }: NoteListProps) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)

  const filtered = filterEntries(entries, selection)

  // Sort: for entity view, keep pinned first, sort children; otherwise sort all
  let sorted: VaultEntry[]
  if (selection.kind === 'entity' && filtered.length > 0) {
    const [pinned, ...children] = filtered
    sorted = [pinned, ...children.sort(sortByModified)]
  } else {
    sorted = [...filtered].sort(sortByModified)
  }

  // Search filter (title substring, case-insensitive)
  const query = search.trim().toLowerCase()
  const searched = query
    ? sorted.filter((e) => e.title.toLowerCase().includes(query))
    : sorted

  // Type filter pills
  const displayed = typeFilter
    ? searched.filter((e) => e.isA === typeFilter)
    : searched

  return (
    <div className="note-list">
      <div className="note-list__header">
        <h3>Notes</h3>
        <span className="note-list__count">{displayed.length}</span>
      </div>
      <div className="note-list__search">
        <input
          type="text"
          className="note-list__search-input"
          placeholder="Search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="note-list__pills">
        {TYPE_PILLS.map(({ label, type }) => (
          <button
            key={label}
            className={`note-list__pill${typeFilter === type ? ' note-list__pill--active' : ''}`}
            onClick={() => setTypeFilter(type)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="note-list__items">
        {displayed.length === 0 ? (
          <div className="note-list__empty">No notes found</div>
        ) : (
          displayed.map((entry, i) => (
            <div
              key={entry.path}
              className={`note-list__item${
                selection.kind === 'entity' && i === 0 ? ' note-list__item--pinned' : ''
              }`}
            >
              <div className="note-list__title">{entry.title}</div>
              <div className="note-list__meta">
                {entry.isA && <span className="note-list__type">{entry.isA}</span>}
                {entry.status && <span className="note-list__status">{entry.status}</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
