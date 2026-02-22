import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
// Virtuoso removed — flat list rendering used instead
import type { VaultEntry, SidebarSelection, ModifiedFile } from '../types'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import {
  MagnifyingGlass, Plus, Wrench, Flask, Target, ArrowsClockwise,
  Users, CalendarBlank, Tag, FileText, CaretDown, CaretRight, StackSimple,
  ArrowsDownUp, Check, Warning,
} from '@phosphor-icons/react'
import type { ComponentType, SVGAttributes } from 'react'
import { getTypeColor, getTypeLightColor } from '../utils/typeColors'
import { resolveIcon } from './TypeCustomizePopover'

const TYPE_ICON_MAP: Record<string, ComponentType<SVGAttributes<SVGSVGElement>>> = {
  Project: Wrench,
  Experiment: Flask,
  Responsibility: Target,
  Procedure: ArrowsClockwise,
  Person: Users,
  Event: CalendarBlank,
  Topic: Tag,
  Type: StackSimple,
}

function getTypeIcon(isA: string | null, customIcon?: string | null): ComponentType<SVGAttributes<SVGSVGElement>> {
  if (customIcon) return resolveIcon(customIcon)
  return (isA && TYPE_ICON_MAP[isA]) || FileText
}

interface NoteListProps {
  entries: VaultEntry[]
  selection: SidebarSelection
  selectedNote: VaultEntry | null
  allContent: Record<string, string>
  modifiedFiles?: ModifiedFile[]
  onSelectNote: (entry: VaultEntry) => void
  onCreateNote: () => void
}

interface RelationshipGroup {
  label: string
  entries: VaultEntry[]
}

function relativeDate(ts: number | null): string {
  if (!ts) return ''
  const now = Math.floor(Date.now() / 1000)
  const diff = now - ts
  if (diff < 0) {
    const date = new Date(ts * 1000)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  const date = new Date(ts * 1000)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getDisplayDate(entry: VaultEntry): number | null {
  return entry.modifiedAt ?? entry.createdAt
}

function refsMatch(refs: string[], entry: VaultEntry): boolean {
  const stem = entry.path.replace(/^.*\/Laputa\//, '').replace(/\.md$/, '')
  const fileStem = entry.filename.replace(/\.md$/, '')
  return refs.some((ref) => {
    const raw = ref.replace(/^\[\[/, '').replace(/\]\]$/, '')
    const inner = raw.split('|')[0]
    return inner === stem || inner.split('/').pop() === fileStem
  })
}

function resolveRefs(refs: string[], entries: VaultEntry[]): VaultEntry[] {
  return refs
    .map((ref) => {
      // Strip [[ ]] and remove alias (|display text) if present
      const raw = ref.replace(/^\[\[/, '').replace(/\]\]$/, '')
      const inner = raw.split('|')[0]
      return entries.find((e) => {
        const stem = e.path.replace(/^.*\/Laputa\//, '').replace(/\.md$/, '')
        if (stem === inner) return true
        const fileStem = e.filename.replace(/\.md$/, '')
        if (fileStem === inner.split('/').pop()) return true
        return false
      })
    })
    .filter((e): e is VaultEntry => e !== undefined)
}

export function sortByModified(a: VaultEntry, b: VaultEntry): number {
  return (getDisplayDate(b) ?? 0) - (getDisplayDate(a) ?? 0)
}

export type SortOption = 'modified' | 'created' | 'title' | 'status'

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'modified', label: 'Modified' },
  { value: 'created', label: 'Created' },
  { value: 'title', label: 'Title' },
  { value: 'status', label: 'Status' },
]

const STATUS_ORDER: Record<string, number> = {
  Active: 0,
  Paused: 1,
  Done: 2,
  Finished: 3,
}

export function getSortComparator(option: SortOption): (a: VaultEntry, b: VaultEntry) => number {
  switch (option) {
    case 'modified':
      return sortByModified
    case 'created':
      return (a, b) => (b.createdAt ?? b.modifiedAt ?? 0) - (a.createdAt ?? a.modifiedAt ?? 0)
    case 'title':
      return (a, b) => a.title.localeCompare(b.title)
    case 'status':
      return (a, b) => {
        const sa = STATUS_ORDER[a.status ?? ''] ?? 999
        const sb = STATUS_ORDER[b.status ?? ''] ?? 999
        if (sa !== sb) return sa - sb
        return sortByModified(a, b)
      }
  }
}

const SORT_STORAGE_KEY = 'laputa-sort-preferences'

function loadSortPreferences(): Record<string, SortOption> {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveSortPreferences(prefs: Record<string, SortOption>) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(prefs))
  } catch { /* ignore */ }
}

function findBacklinks(entity: VaultEntry, allEntries: VaultEntry[], allContent: Record<string, string>): VaultEntry[] {
  const stem = entity.filename.replace(/\.md$/, '')
  const pathStem = entity.path.replace(/^.*\/Laputa\//, '').replace(/\.md$/, '')
  const targets = [entity.title, ...entity.aliases]

  return allEntries.filter((e) => {
    if (e.path === entity.path) return false
    const content = allContent[e.path]
    if (!content) return false
    for (const t of targets) {
      if (content.includes(`[[${t}]]`)) return true
    }
    if (content.includes(`[[${stem}]]`)) return true
    if (content.includes(`[[${pathStem}]]`)) return true
    if (content.includes(`[[${pathStem}|`)) return true
    return false
  })
}

function addGroup(
  groups: RelationshipGroup[],
  label: string,
  entries: VaultEntry[],
  seen: Set<string>,
) {
  const unseen = entries.filter((e) => !seen.has(e.path))
  if (unseen.length > 0) {
    groups.push({ label, entries: unseen })
    unseen.forEach((e) => seen.add(e.path))
  }
}

export function buildRelationshipGroups(
  entity: VaultEntry,
  allEntries: VaultEntry[],
  allContent: Record<string, string>,
): RelationshipGroup[] {
  const groups: RelationshipGroup[] = []
  const seen = new Set<string>([entity.path])
  const rels = entity.relationships ?? {}

  // 0. "Instances" — for type documents, show all entries of this type
  if (entity.isA === 'Type') {
    const instances = allEntries
      .filter((e) => e.isA === entity.title && !seen.has(e.path))
      .sort(sortByModified)
    addGroup(groups, 'Instances', instances, seen)
  }

  // 1. "Has" — from the entity's own relationships map
  const hasRefs = rels['Has'] ?? []
  if (hasRefs.length > 0) {
    addGroup(groups, 'Has', resolveRefs(hasRefs, allEntries).sort(sortByModified), seen)
  }

  // 2. Children — entries whose belongsTo points to this entity (reverse lookup, excluding events)
  const children = allEntries
    .filter((e) => !seen.has(e.path) && e.isA !== 'Event' && refsMatch(e.belongsTo, entity))
    .sort(sortByModified)
  addGroup(groups, 'Children', children, seen)

  // 3. Events — entities of type Event that reference this entity via belongsTo/relatedTo
  const events = allEntries
    .filter(
      (e) =>
        !seen.has(e.path) &&
        e.isA === 'Event' &&
        (refsMatch(e.belongsTo, entity) || refsMatch(e.relatedTo, entity))
    )
    .sort(sortByModified)
  addGroup(groups, 'Events', events, seen)

  // 4. "Topics" — from the entity's own relationships map
  const topicRefs = rels['Topics'] ?? []
  if (topicRefs.length > 0) {
    addGroup(groups, 'Topics', resolveRefs(topicRefs, allEntries).sort(sortByModified), seen)
  }

  // 5. All other generic relationship fields (alphabetically)
  const handledKeys = new Set(['Has', 'Topics'])
  const otherKeys = Object.keys(rels)
    .filter((k) => !handledKeys.has(k) && k.toLowerCase() !== 'type')
    .sort((a, b) => a.localeCompare(b))
  for (const key of otherKeys) {
    const refs = rels[key]
    if (refs && refs.length > 0) {
      addGroup(groups, key, resolveRefs(refs, allEntries).sort(sortByModified), seen)
    }
  }

  // 6. Referenced By — entries that reference this entity via relatedTo (reverse lookup)
  const referencedBy = allEntries
    .filter((e) => !seen.has(e.path) && e.isA !== 'Event' && refsMatch(e.relatedTo, entity))
    .sort(sortByModified)
  addGroup(groups, 'Referenced By', referencedBy, seen)

  // 7. Backlinks — always last
  const backlinks = findBacklinks(entity, allEntries, allContent)
    .filter((e) => !seen.has(e.path))
    .sort(sortByModified)
  addGroup(groups, 'Backlinks', backlinks, seen)

  return groups
}

export function filterEntries(entries: VaultEntry[], selection: SidebarSelection, _modifiedFiles?: ModifiedFile[]): VaultEntry[] {
  switch (selection.kind) {
    case 'filter':
      switch (selection.filter) {
        case 'all':
          return entries.filter((e) => !e.archived && !e.trashed)
        case 'favorites':
          return []
        case 'archived':
          return entries.filter((e) => e.archived && !e.trashed)
        case 'trash':
          return entries.filter((e) => e.trashed)
      }
      break
    case 'sectionGroup':
      return entries.filter((e) => e.isA === selection.type && !e.archived && !e.trashed)
    case 'entity':
      return []
    case 'topic': {
      const topic = selection.entry
      return entries.filter((e) => refsMatch(e.relatedTo, topic) && !e.archived && !e.trashed)
    }
  }
}

function SortDropdown({
  groupLabel,
  current,
  onChange,
}: {
  groupLabel: string
  current: SortOption
  onChange: (groupLabel: string, option: SortOption) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative" style={{ zIndex: open ? 10 : 0 }}>
      <button
        className={cn(
          "flex items-center gap-0.5 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent",
          open && "bg-accent text-foreground"
        )}
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        title={`Sort by ${current}`}
        data-testid={`sort-button-${groupLabel}`}
      >
        <ArrowsDownUp size={12} />
        <span className="text-[10px] font-medium">{SORT_OPTIONS.find((o) => o.value === current)?.label}</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-md border border-border bg-popover shadow-md"
          style={{ width: 130, padding: 4 }}
          data-testid={`sort-menu-${groupLabel}`}
        >
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-2 text-[12px] text-popover-foreground hover:bg-accent",
                opt.value === current && "bg-accent font-medium"
              )}
              style={{ height: 28, border: 'none', cursor: 'pointer', background: opt.value === current ? 'var(--accent)' : 'transparent' }}
              onClick={(e) => {
                e.stopPropagation()
                onChange(groupLabel, opt.value)
                setOpen(false)
              }}
              data-testid={`sort-option-${opt.value}`}
            >
              {opt.value === current
                ? <Check size={12} />
                : <span style={{ width: 12, height: 12, display: 'inline-block' }} />
              }
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NoteListInner({ entries, selection, selectedNote, allContent, modifiedFiles, onSelectNote, onCreateNote }: NoteListProps) {
  const [search, setSearch] = useState('')
  const [searchVisible, setSearchVisible] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [sortPrefs, setSortPrefs] = useState<Record<string, SortOption>>(loadSortPreferences)

  const isEntityView = selection.kind === 'entity'
  const isSectionGroup = selection.kind === 'sectionGroup'
  const isTrashView = selection.kind === 'filter' && selection.filter === 'trash'

  const handleSortChange = useCallback((groupLabel: string, option: SortOption) => {
    setSortPrefs((prev) => {
      const next = { ...prev, [groupLabel]: option }
      saveSortPreferences(next)
      return next
    })
  }, [])

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  // Build type entry map for custom icon/color lookup
  const typeEntryMap = useMemo(() => {
    const map: Record<string, VaultEntry> = {}
    for (const e of entries) {
      if (e.isA === 'Type') map[e.title] = e
    }
    return map
  }, [entries])

  // Find the type document for this section group (e.g., type/project.md for "Project")
  const typeDocument = useMemo(() => {
    if (!isSectionGroup) return null
    const typeName = (selection as { kind: 'sectionGroup'; type: string }).type
    return entries.find((e) => e.isA === 'Type' && e.title === typeName) ?? null
  }, [isSectionGroup, selection, entries])

  const entityGroups = useMemo(
    () => isEntityView ? buildRelationshipGroups(selection.entry, entries, allContent) : [],
    [isEntityView, selection, entries, allContent]
  )

  const filtered = useMemo(
    () => isEntityView ? [] : filterEntries(entries, selection, modifiedFiles),
    [entries, selection, modifiedFiles, isEntityView]
  )

  const listSort = sortPrefs['__list__'] ?? 'modified'

  const sorted = useMemo(
    () => isEntityView ? [] : [...filtered].sort(getSortComparator(listSort)),
    [filtered, isEntityView, listSort]
  )

  const query = search.trim().toLowerCase()

  const searched = useMemo(
    () => query ? sorted.filter((e) => e.title.toLowerCase().includes(query)) : sorted,
    [sorted, query]
  )

  const searchedGroups = useMemo(
    () => query
      ? entityGroups
          .map((g) => ({
            ...g,
            entries: g.entries.filter((e) => e.title.toLowerCase().includes(query)),
          }))
          .filter((g) => g.entries.length > 0)
      : entityGroups,
    [entityGroups, query]
  )


  const expiredTrashCount = useMemo(() => {
    if (!isTrashView) return 0
    const now = Date.now() / 1000
    return searched.filter((e) => e.trashedAt && (now - e.trashedAt) >= 86400 * 30).length
  }, [isTrashView, searched])

  const renderItem = useCallback((entry: VaultEntry, isPinned = false) => {
    const isSelected = selectedNote?.path === entry.path && !isPinned
    const te = typeEntryMap[entry.isA ?? '']
    const typeColor = getTypeColor(entry.isA ?? 'Note', te?.color)
    const typeLightColor = getTypeLightColor(entry.isA ?? 'Note', te?.color)
    const TypeIcon = getTypeIcon(entry.isA, te?.icon)
    return (
      <div
        key={entry.path}
        className={cn(
          "relative cursor-pointer border-b border-[var(--border)] transition-colors",
          isPinned && "border-l-[3px] border-l-[var(--accent-green)] bg-muted",
          isSelected && "border-l-[3px]",
          !isPinned && !isSelected && "hover:bg-muted"
        )}
        style={{
          padding: isPinned || isSelected ? '14px 16px 14px 13px' : '14px 16px',
          ...(isSelected && {
            borderLeftColor: typeColor,
            backgroundColor: typeLightColor,
          }),
        }}
        onClick={() => onSelectNote(entry)}
      >
        <TypeIcon
          width={14}
          height={14}
          className="absolute right-3 top-2.5"
          style={{ color: typeColor }}
          data-testid="type-icon"
        />
        <div className="pr-5">
          <div className={cn(
            "truncate text-[13px] text-foreground",
            isSelected ? "font-semibold" : "font-medium"
          )}>
            {entry.title}
            {entry.archived && (
              <span
                className="ml-1.5 inline-block align-middle text-muted-foreground"
                style={{ fontSize: 9, fontWeight: 500, background: 'var(--muted)', borderRadius: 4, padding: '1px 4px', verticalAlign: 'middle' }}
              >
                ARCHIVED
              </span>
            )}
            {entry.trashed && (
              <span
                className="ml-1.5 inline-block align-middle"
                style={{ fontSize: 9, fontWeight: 500, background: 'var(--destructive-light, #ef44441a)', color: 'var(--destructive)', borderRadius: 4, padding: '1px 4px', verticalAlign: 'middle' }}
              >
                TRASHED
              </span>
            )}
          </div>
        </div>
        <div className="mt-0.5 text-[12px] leading-[1.5] text-muted-foreground" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {entry.snippet}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground" style={entry.trashed && entry.trashedAt && (Date.now() / 1000 - entry.trashedAt) >= 86400 * 30 ? { color: 'var(--destructive)', fontWeight: 500 } : undefined}>
          {entry.trashed && entry.trashedAt
            ? `Trashed ${relativeDate(entry.trashedAt)}${(Date.now() / 1000 - entry.trashedAt) >= 86400 * 30 ? ' — will be permanently deleted' : ''}`
            : relativeDate(getDisplayDate(entry))}
        </div>
      </div>
    )
  }, [selectedNote?.path, onSelectNote, typeEntryMap])

  const renderPinnedView = useCallback((entity: VaultEntry, groups: RelationshipGroup[]) => {
    const ete = typeEntryMap[entity.isA ?? '']
    const entityTypeColor = getTypeColor(entity.isA ?? '', ete?.color)
    const entityLightColor = getTypeLightColor(entity.isA ?? '', ete?.color)
    const EntityIcon = getTypeIcon(entity.isA, ete?.icon)
    return (
      <div className="h-full overflow-y-auto">
        {/* Prominent card */}
        <div
          className="relative cursor-pointer border-b border-[var(--border)]"
          style={{ backgroundColor: entityLightColor, padding: '14px 16px' }}
          onClick={() => onSelectNote(entity)}
        >
          <EntityIcon
            width={16}
            height={16}
            className="absolute right-3 top-3.5"
            style={{ color: entityTypeColor }}
            data-testid="type-icon"
          />
          <div className="pr-6 text-[14px] font-bold" style={{ color: entityTypeColor }}>
            {entity.title}
          </div>
          <div className="mt-1 text-[12px] leading-[1.5] opacity-80" style={{ color: entityTypeColor, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {entity.snippet}
          </div>
          <div className="mt-1 text-[11px] opacity-60" style={{ color: entityTypeColor }}>
            {relativeDate(getDisplayDate(entity))}
          </div>
        </div>

        {/* Relationship groups */}
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            {query ? 'No matching items' : 'No related items'}
          </div>
        ) : (
          groups.map((group) => {
            const isGroupCollapsed = collapsedGroups.has(group.label)
            const groupSort = sortPrefs[group.label] ?? 'modified'
            const sortedEntries = [...group.entries].sort(getSortComparator(groupSort))
            return (
              <div key={group.label}>
                <div
                  className="flex w-full items-center justify-between bg-muted"
                  style={{ height: 32, padding: '0 16px' }}
                >
                  <button
                    className="flex flex-1 items-center gap-1.5 border-none bg-transparent cursor-pointer p-0"
                    onClick={() => toggleGroup(group.label)}
                  >
                    <span className="font-mono-label text-muted-foreground">
                      {group.label}
                    </span>
                    <span className="font-mono-label text-muted-foreground" style={{ fontWeight: 400 }}>{group.entries.length}</span>
                  </button>
                  <span className="flex items-center gap-1.5">
                    <SortDropdown
                      groupLabel={group.label}
                      current={groupSort}
                      onChange={handleSortChange}
                    />
                    <button
                      className="flex items-center border-none bg-transparent cursor-pointer p-0 text-muted-foreground"
                      onClick={() => toggleGroup(group.label)}
                    >
                      {isGroupCollapsed
                        ? <CaretRight size={12} />
                        : <CaretDown size={12} />
                      }
                    </button>
                  </span>
                </div>
                {!isGroupCollapsed && sortedEntries.map((groupEntry) => renderItem(groupEntry))}
              </div>
            )
          })
        )}
      </div>
    )
  }, [onSelectNote, query, collapsedGroups, toggleGroup, renderItem, typeEntryMap, sortPrefs, handleSortChange])

  return (
    <div className="flex flex-col overflow-hidden border-r border-border bg-card text-foreground" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex h-[45px] shrink-0 items-center justify-between border-b border-border px-4" data-tauri-drag-region style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <h3 className="m-0 min-w-0 flex-1 truncate text-[14px] font-semibold">
          {isEntityView
            ? selection.entry.title
            : typeDocument
              ? typeDocument.title
              : selection.kind === 'filter' && (selection as { filter: string }).filter === 'archived'
                ? 'Archive'
                : selection.kind === 'filter' && (selection as { filter: string }).filter === 'trash'
                  ? 'Trash'
                  : 'Notes'}
        </h3>
        <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {!isEntityView && (
            <SortDropdown
              groupLabel="__list__"
              current={listSort}
              onChange={handleSortChange}
            />
          )}
          <button
            className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => { setSearchVisible(!searchVisible); if (searchVisible) setSearch('') }}
            title="Search notes"
          >
            <MagnifyingGlass size={16} />
          </button>
          <button
            className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => onCreateNote()}
            title="Create new note"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Search (toggle on icon click) */}
      {searchVisible && (
        <div className="border-b border-border px-3 py-2">
          <Input
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-[13px]"
            autoFocus
          />
        </div>
      )}

      {/* Items */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {isEntityView ? (() => {
          const entity = selection.entry
          return renderPinnedView(entity, searchedGroups)
        })() : (
          <div className="h-full overflow-y-auto">
            {/* Type document pinned card (for sectionGroup view) */}
            {typeDocument && (() => {
              const tde = typeEntryMap[typeDocument.title] ?? typeDocument
              const tdColor = getTypeColor(typeDocument.isA ?? 'Type', tde?.color)
              const tdLightColor = getTypeLightColor(typeDocument.isA ?? 'Type', tde?.color)
              const TDIcon = getTypeIcon(typeDocument.isA, tde?.icon)
              return (
                <div
                  className="relative cursor-pointer border-b border-[var(--border)]"
                  style={{ backgroundColor: tdLightColor, padding: '14px 16px' }}
                  onClick={() => onSelectNote(typeDocument)}
                >
                  <TDIcon
                    width={16}
                    height={16}
                    className="absolute right-3 top-3.5"
                    style={{ color: tdColor }}
                    data-testid="type-icon"
                  />
                  <div className="pr-6 text-[14px] font-bold" style={{ color: tdColor }}>
                    {typeDocument.title}
                  </div>
                  <div className="mt-1 text-[12px] leading-[1.5] opacity-80" style={{ color: tdColor, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {typeDocument.snippet}
                  </div>
                </div>
              )
            })()}
            {/* 30-day warning banner for trash view */}
            {isTrashView && expiredTrashCount > 0 && (
              <div
                className="flex items-start gap-2 border-b border-[var(--border)]"
                style={{ padding: '10px 12px', background: 'color-mix(in srgb, var(--destructive) 6%, transparent)' }}
              >
                <Warning size={16} className="shrink-0" style={{ color: 'var(--destructive)', marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--destructive)' }}>
                    Notes in trash for 30+ days will be permanently deleted
                  </div>
                  <div className="text-muted-foreground" style={{ fontSize: 11 }}>
                    {expiredTrashCount} {expiredTrashCount === 1 ? 'note is' : 'notes are'} past the 30-day retention period
                  </div>
                </div>
              </div>
            )}
            {searched.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                {isTrashView ? 'Trash is empty' : 'No notes found'}
              </div>
            ) : (
              searched.map((entry) => renderItem(entry))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export const NoteList = memo(NoteListInner)
