import { useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke, addMockEntry, updateMockContent } from '../mock-tauri'
import type { VaultEntry } from '../types'
import type { FrontmatterValue } from '../components/Inspector'
import { useTabManagement } from './useTabManagement'
import { updateMockFrontmatter, deleteMockFrontmatterProperty } from './mockFrontmatterHelpers'

interface NewEntryParams {
  path: string
  slug: string
  title: string
  type: string
  status: string | null
}

interface RenameResult {
  new_path: string
  updated_files: number
}

export interface NoteActionsConfig {
  addEntry: (entry: VaultEntry, content: string) => void
  updateContent: (path: string, content: string) => void
  entries: VaultEntry[]
  setToastMessage: (msg: string | null) => void
  updateEntry: (path: string, patch: Partial<VaultEntry>) => void
}

async function performRename(
  path: string,
  newTitle: string,
  vaultPath: string,
): Promise<RenameResult> {
  if (isTauri()) {
    return invoke<RenameResult>('rename_note', { vaultPath, oldPath: path, newTitle })
  }
  return mockInvoke<RenameResult>('rename_note', { vault_path: vaultPath, old_path: path, new_title: newTitle })
}

function buildRenamedEntry(entry: VaultEntry, newTitle: string, newPath: string): VaultEntry {
  const slug = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return { ...entry, path: newPath, filename: `${slug}.md`, title: newTitle }
}

async function loadNoteContent(path: string): Promise<string> {
  return isTauri()
    ? invoke<string>('get_note_content', { path })
    : mockInvoke<string>('get_note_content', { path })
}

export function buildNewEntry({ path, slug, title, type, status }: NewEntryParams): VaultEntry {
  const now = Math.floor(Date.now() / 1000)
  return {
    path, filename: `${slug}.md`, title, isA: type,
    aliases: [], belongsTo: [], relatedTo: [],
    status, owner: null, cadence: null, archived: false, trashed: false, trashedAt: null,
    modifiedAt: now, createdAt: now, fileSize: 0,
    snippet: '', relationships: {}, icon: null, color: null, order: null,
  }
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

/** Generate a unique "Untitled <type>" name by checking existing entries. */
export function generateUntitledName(entries: VaultEntry[], type: string): string {
  const baseName = `Untitled ${type.toLowerCase()}`
  const existingTitles = new Set(entries.map(e => e.title))
  let title = baseName
  let counter = 2
  while (existingTitles.has(title)) {
    title = `${baseName} ${counter}`
    counter++
  }
  return title
}

export function entryMatchesTarget(e: VaultEntry, targetLower: string, targetAsWords: string): boolean {
  if (e.title.toLowerCase() === targetLower) return true
  if (e.aliases.some((a) => a.toLowerCase() === targetLower)) return true
  const pathStem = e.path.replace(/^.*\/Laputa\//, '').replace(/\.md$/, '')
  if (pathStem.toLowerCase() === targetLower) return true
  const fileStem = e.filename.replace(/\.md$/, '')
  if (fileStem.toLowerCase() === targetLower.split('/').pop()) return true
  return e.title.toLowerCase() === targetAsWords
}

async function invokeFrontmatter(command: string, args: Record<string, unknown>): Promise<string> {
  return invoke<string>(command, args)
}

function applyMockFrontmatterUpdate(path: string, key: string, value: FrontmatterValue): string {
  const content = updateMockFrontmatter(path, key, value)
  updateMockContent(path, content)
  return content
}

function applyMockFrontmatterDelete(path: string, key: string): string {
  const content = deleteMockFrontmatterProperty(path, key)
  updateMockContent(path, content)
  return content
}

const TYPE_FOLDER_MAP: Record<string, string> = {
  Note: 'note', Project: 'project', Experiment: 'experiment',
  Responsibility: 'responsibility', Procedure: 'procedure',
  Person: 'person', Event: 'event', Topic: 'topic',
}

const NO_STATUS_TYPES = new Set(['Topic', 'Person'])

const ENTRY_DELETE_MAP: Record<string, Partial<VaultEntry>> = {
  is_a: { isA: null }, status: { status: null }, color: { color: null },
  icon: { icon: null }, owner: { owner: null }, cadence: { cadence: null },
  aliases: { aliases: [] }, belongs_to: { belongsTo: [] }, related_to: { relatedTo: [] },
  archived: { archived: false }, trashed: { trashed: false }, order: { order: null },
}

/** Map a frontmatter key+value to the corresponding VaultEntry field(s). */
export function frontmatterToEntryPatch(
  op: 'update' | 'delete', key: string, value?: FrontmatterValue,
): Partial<VaultEntry> {
  const k = key.toLowerCase().replace(/\s+/g, '_')
  if (op === 'delete') return ENTRY_DELETE_MAP[k] ?? {}
  const str = value != null ? String(value) : null
  const arr = Array.isArray(value) ? value.map(String) : []
  const updates: Record<string, Partial<VaultEntry>> = {
    is_a: { isA: str }, status: { status: str }, color: { color: str },
    icon: { icon: str }, owner: { owner: str }, cadence: { cadence: str },
    aliases: { aliases: arr }, belongs_to: { belongsTo: arr }, related_to: { relatedTo: arr },
    archived: { archived: Boolean(value) }, trashed: { trashed: Boolean(value) },
    order: { order: typeof value === 'number' ? value : null },
  }
  return updates[k] ?? {}
}

function addEntryWithMock(entry: VaultEntry, content: string, addEntry: (e: VaultEntry, c: string) => void) {
  if (!isTauri()) addMockEntry(entry, content)
  addEntry(entry, content)
}

export function buildNoteContent(title: string, type: string, status: string | null): string {
  const lines = ['---', `title: ${title}`, `is_a: ${type}`]
  if (status) lines.push(`status: ${status}`)
  lines.push('---')
  return `${lines.join('\n')}\n\n# ${title}\n\n`
}

export function resolveNewNote(title: string, type: string): { entry: VaultEntry; content: string } {
  const folder = TYPE_FOLDER_MAP[type] || slugify(type)
  const slug = slugify(title)
  const status = NO_STATUS_TYPES.has(type) ? null : 'Active'
  const entry = buildNewEntry({ path: `/Users/luca/Laputa/${folder}/${slug}.md`, slug, title, type, status })
  return { entry, content: buildNoteContent(title, type, status) }
}

export function resolveNewType(typeName: string): { entry: VaultEntry; content: string } {
  const slug = slugify(typeName)
  const entry = buildNewEntry({ path: `/Users/luca/Laputa/type/${slug}.md`, slug, title: typeName, type: 'Type', status: null })
  return { entry, content: `---\nIs A: Type\n---\n\n# ${typeName}\n\n` }
}

function findWikilinkTarget(entries: VaultEntry[], target: string): VaultEntry | undefined {
  const targetLower = target.toLowerCase()
  const targetAsWords = target.split('/').pop()?.replace(/-/g, ' ').toLowerCase() ?? targetLower
  return entries.find((e) => entryMatchesTarget(e, targetLower, targetAsWords))
}

async function executeFrontmatterOp(op: 'update' | 'delete', path: string, key: string, value?: FrontmatterValue): Promise<string> {
  if (op === 'update') {
    return isTauri() ? invokeFrontmatter('update_frontmatter', { path, key, value }) : applyMockFrontmatterUpdate(path, key, value!)
  }
  return isTauri() ? invokeFrontmatter('delete_frontmatter_property', { path, key }) : applyMockFrontmatterDelete(path, key)
}

function renameToastMessage(updatedFiles: number): string {
  if (updatedFiles === 0) return 'Renamed'
  return `Renamed — updated ${updatedFiles} wiki link${updatedFiles > 1 ? 's' : ''}`
}

/** Reload content for open tabs whose wikilinks may have changed after a rename. */
async function reloadTabsAfterRename(
  tabPaths: string[],
  updateTabContent: (path: string, content: string) => void,
): Promise<void> {
  for (const tabPath of tabPaths) {
    try {
      updateTabContent(tabPath, await loadNoteContent(tabPath))
    } catch { /* skip tabs that fail to reload */ }
  }
}

export function useNoteActions(config: NoteActionsConfig) {
  const { addEntry, updateContent, entries, setToastMessage, updateEntry } = config
  const tabMgmt = useTabManagement()
  const { setTabs, handleSelectNote, activeTabPathRef, handleSwitchTab } = tabMgmt
  const tabsRef = useRef(tabMgmt.tabs)
  // eslint-disable-next-line react-hooks/refs
  tabsRef.current = tabMgmt.tabs

  const updateTabContent = useCallback((path: string, newContent: string) => {
    setTabs((prev) => prev.map((t) => t.entry.path === path ? { ...t, content: newContent } : t))
    updateContent(path, newContent)
  }, [setTabs, updateContent])

  const handleNavigateWikilink = useCallback((target: string) => {
    const found = findWikilinkTarget(entries, target)
    if (found) handleSelectNote(found)
    else console.warn(`Navigation target not found: ${target}`)
  }, [entries, handleSelectNote])

  const handleCreateNote = useCallback((title: string, type: string) => {
    const { entry, content } = resolveNewNote(title, type)
    addEntryWithMock(entry, content, addEntry)
    handleSelectNote(entry)
  }, [handleSelectNote, addEntry])

  const handleCreateType = useCallback((typeName: string) => {
    const { entry, content } = resolveNewType(typeName)
    addEntryWithMock(entry, content, addEntry)
    handleSelectNote(entry)
  }, [handleSelectNote, addEntry])

  const runFrontmatterOp = useCallback(async (op: 'update' | 'delete', path: string, key: string, value?: FrontmatterValue) => {
    try {
      updateTabContent(path, await executeFrontmatterOp(op, path, key, value))
      const patch = frontmatterToEntryPatch(op, key, value)
      if (Object.keys(patch).length > 0) updateEntry(path, patch)
      setToastMessage(op === 'update' ? 'Property updated' : 'Property deleted')
    } catch (err) {
      console.error(`Failed to ${op} frontmatter:`, err)
      setToastMessage(`Failed to ${op} property`)
    }
  }, [updateTabContent, updateEntry, setToastMessage])

  const handleRenameNote = useCallback(async (
    path: string,
    newTitle: string,
    vaultPath: string,
    onEntryRenamed: (oldPath: string, newEntry: Partial<VaultEntry> & { path: string }, newContent: string) => void,
  ) => {
    try {
      const result = await performRename(path, newTitle, vaultPath)
      const newContent = await loadNoteContent(result.new_path)
      const entry = entries.find((e) => e.path === path)
      const newEntry = buildRenamedEntry(entry ?? {} as VaultEntry, newTitle, result.new_path)

      const otherTabPaths = tabsRef.current
        .filter(t => t.entry.path !== path)
        .map(t => t.entry.path)

      setTabs((prev) => prev.map((t) => t.entry.path === path ? { entry: newEntry, content: newContent } : t))
      if (activeTabPathRef.current === path) handleSwitchTab(result.new_path)
      onEntryRenamed(path, newEntry, newContent)

      await reloadTabsAfterRename(otherTabPaths, updateTabContent)
      setToastMessage(renameToastMessage(result.updated_files))
    } catch (err) {
      console.error('Failed to rename note:', err)
      setToastMessage('Failed to rename note')
    }
  }, [entries, setTabs, activeTabPathRef, handleSwitchTab, updateTabContent, setToastMessage])

  return {
    ...tabMgmt,
    handleNavigateWikilink,
    handleCreateNote,
    handleCreateType,
    handleUpdateFrontmatter: useCallback((path: string, key: string, value: FrontmatterValue) => runFrontmatterOp('update', path, key, value), [runFrontmatterOp]),
    handleDeleteProperty: useCallback((path: string, key: string) => runFrontmatterOp('delete', path, key), [runFrontmatterOp]),
    handleAddProperty: useCallback((path: string, key: string, value: FrontmatterValue) => runFrontmatterOp('update', path, key, value), [runFrontmatterOp]),
    handleRenameNote,
  }
}
