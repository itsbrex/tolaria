import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { VaultEntry } from '../types'

interface Tab {
  entry: VaultEntry
  content: string
}

const TAB_ORDER_KEY = 'laputa-tab-order'

function saveTabOrder(tabs: Tab[]) {
  try {
    localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(tabs.map(t => t.entry.path)))
  } catch { /* localStorage may be unavailable */ }
}

function loadTabOrder(): string[] {
  try {
    const stored = localStorage.getItem(TAB_ORDER_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function clearTabOrder() {
  try { localStorage.removeItem(TAB_ORDER_KEY) } catch { /* noop */ }
}

async function loadNoteContent(path: string): Promise<string> {
  return isTauri()
    ? invoke<string>('get_note_content', { path })
    : mockInvoke<string>('get_note_content', { path })
}

function addTabIfAbsent(prev: Tab[], entry: VaultEntry, content: string): Tab[] {
  if (prev.some((t) => t.entry.path === entry.path)) return prev
  return [...prev, { entry, content }]
}

function resolveNextActiveTab(prev: Tab[], closedPath: string): string | null {
  const next = prev.filter((t) => t.entry.path !== closedPath)
  if (next.length === 0) return null
  const closedIdx = prev.findIndex((t) => t.entry.path === closedPath)
  const newIdx = Math.min(closedIdx, next.length - 1)
  return next[newIdx].entry.path
}

function replaceTabEntry(prev: Tab[], targetPath: string, entry: VaultEntry, content: string): Tab[] {
  return prev.map((t) => t.entry.path === targetPath ? { entry, content } : t)
}

function reorderArray(tabs: Tab[], fromIndex: number, toIndex: number): Tab[] {
  const next = [...tabs]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

function restoreOrder(prev: Tab[], savedOrder: string[]): Tab[] {
  if (prev.length <= 1) return prev
  const pathToTab = new Map(prev.map(t => [t.entry.path, t]))
  const ordered: Tab[] = []
  for (const path of savedOrder) {
    const tab = pathToTab.get(path)
    if (tab) {
      ordered.push(tab)
      pathToTab.delete(path)
    }
  }
  for (const tab of pathToTab.values()) {
    ordered.push(tab)
  }
  return ordered
}

export type { Tab }

export function useTabManagement() {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const activeTabPathRef = useRef(activeTabPath)
  useEffect(() => { activeTabPathRef.current = activeTabPath })
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs })
  const handleCloseTabRef = useRef<(path: string) => void>(() => {})

  const handleSelectNote = useCallback(async (entry: VaultEntry) => {
    if (tabsRef.current.some((t) => t.entry.path === entry.path)) {
      setActiveTabPath(entry.path)
      return
    }
    try {
      const content = await loadNoteContent(entry.path)
      setTabs((prev) => addTabIfAbsent(prev, entry, content))
    } catch (err) {
      console.warn('Failed to load note content:', err)
      setTabs((prev) => addTabIfAbsent(prev, entry, ''))
    }
    setActiveTabPath(entry.path)
  }, [])

  const handleCloseTab = useCallback((path: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.entry.path !== path)
      if (path === activeTabPathRef.current) {
        setActiveTabPath(resolveNextActiveTab(prev, path))
      }
      return next
    })
  }, [])
  useEffect(() => { handleCloseTabRef.current = handleCloseTab })

  const handleSwitchTab = useCallback((path: string) => {
    setActiveTabPath(path)
  }, [])

  const handleReorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const next = reorderArray(prev, fromIndex, toIndex)
      saveTabOrder(next)
      return next
    })
  }, [])

  const handleReplaceActiveTab = useCallback(async (entry: VaultEntry) => {
    const currentPath = activeTabPathRef.current
    if (!currentPath) { handleSelectNote(entry); return }
    if (currentPath === entry.path) return
    try {
      const content = await loadNoteContent(entry.path)
      setTabs((prev) => replaceTabEntry(prev, currentPath, entry, content))
    } catch (err) {
      console.warn('Failed to load note content for replace:', err)
      setTabs((prev) => replaceTabEntry(prev, currentPath, entry, ''))
    }
    setActiveTabPath(entry.path)
  }, [handleSelectNote])

  const closeAllTabs = useCallback(() => {
    setTabs([])
    setActiveTabPath(null)
  }, [])

  useEffect(() => {
    if (tabs.length > 0) saveTabOrder(tabs)
    else clearTabOrder()
  }, [tabs])

  useEffect(() => {
    const savedOrder = loadTabOrder()
    if (savedOrder.length > 0) {
      setTabs((prev) => restoreOrder(prev, savedOrder)) // eslint-disable-line react-hooks/set-state-in-effect -- restore tab order on mount
    }
  }, [])

  return {
    tabs,
    setTabs,
    activeTabPath,
    activeTabPathRef,
    handleCloseTabRef,
    handleSelectNote,
    handleCloseTab,
    handleSwitchTab,
    handleReorderTabs,
    handleReplaceActiveTab,
    closeAllTabs,
  }
}
