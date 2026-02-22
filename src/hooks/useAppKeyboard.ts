import { useEffect } from 'react'

interface KeyboardActions {
  onQuickOpen: () => void
  onCreateNote: () => void
  onSave: () => void
  onTrashNote: (path: string) => void
  onArchiveNote: (path: string) => void
  activeTabPathRef: React.MutableRefObject<string | null>
  handleCloseTabRef: React.MutableRefObject<(path: string) => void>
}

type ShortcutHandler = () => void

export function useAppKeyboard({
  onQuickOpen, onCreateNote, onSave, onTrashNote, onArchiveNote,
  activeTabPathRef, handleCloseTabRef,
}: KeyboardActions) {
  useEffect(() => {
    const withActiveTab = (fn: (path: string) => void): ShortcutHandler => () => {
      const path = activeTabPathRef.current
      if (path) fn(path)
    }

    const keyMap: Record<string, ShortcutHandler> = {
      p: onQuickOpen,
      n: onCreateNote,
      s: onSave,
      e: withActiveTab(onArchiveNote),
      w: withActiveTab((path) => handleCloseTabRef.current(path)),
      Backspace: withActiveTab(onTrashNote),
      Delete: withActiveTab(onTrashNote),
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const handler = keyMap[e.key]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onQuickOpen, onCreateNote, onSave, onTrashNote, onArchiveNote, activeTabPathRef, handleCloseTabRef])
}
