import { memo, useState, useRef, useCallback, useEffect } from 'react'
import type { VaultEntry } from '../types'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { Plus, Columns, ArrowsOutSimple } from '@phosphor-icons/react'

interface Tab {
  entry: VaultEntry
  content: string
}

interface TabBarProps {
  tabs: Tab[]
  activeTabPath: string | null
  onSwitchTab: (path: string) => void
  onCloseTab: (path: string) => void
  onCreateNote?: () => void
  onReorderTabs?: (fromIndex: number, toIndex: number) => void
  onRenameTab?: (path: string, newTitle: string) => void
}

const DISABLED_ICON_STYLE = { opacity: 0.4, cursor: 'not-allowed' } as const

/** Inline edit input shown when user double-clicks a tab title. */
function InlineTabEdit({ initialValue, onSave, onCancel }: {
  initialValue: string
  onSave: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  const handleSave = useCallback(() => {
    const trimmed = value.trim()
    if (trimmed && trimmed !== initialValue) {
      onSave(trimmed)
    } else {
      onCancel()
    }
  }, [value, initialValue, onSave, onCancel])

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleSave()
        if (e.key === 'Escape') onCancel()
        e.stopPropagation()
      }}
      onBlur={handleSave}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      style={{
        width: '100%',
        minWidth: 40,
        maxWidth: 150,
        background: 'var(--background)',
        border: '1px solid var(--ring)',
        borderRadius: 3,
        padding: '2px 6px',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--foreground)',
        outline: 'none',
        fontFamily: 'inherit',
      }}
    />
  )
}

const DROP_INDICATOR_STYLE = {
  position: 'absolute' as const,
  top: 8,
  bottom: 8,
  width: 2,
  background: 'var(--primary)',
  borderRadius: 1,
  zIndex: 10,
}

function tabStyle(isActive: boolean, isEditing: boolean, isDragging: boolean): React.CSSProperties {
  return {
    background: isActive ? 'var(--background)' : 'transparent',
    borderRight: `1px solid ${isActive ? 'var(--border)' : 'var(--sidebar-border)'}`,
    borderBottom: isActive ? 'none' : '1px solid var(--sidebar-border)',
    padding: '0 12px',
    fontSize: 12,
    fontWeight: isActive ? 500 : 400,
    cursor: isEditing ? 'default' : isDragging ? 'grabbing' : 'grab',
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties
}

interface TabItemProps {
  tab: Tab
  isActive: boolean
  isEditing: boolean
  isDragging: boolean
  showDropBefore: boolean
  showDropAfter: boolean
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onSwitch: () => void
  onClose: () => void
  onDoubleClick: () => void
  onRenameSave: (newTitle: string) => void
  onRenameCancel: () => void
}

/** A single tab item with drag, click, and inline rename support. */
function TabItem({ tab, isActive, isEditing, isDragging, showDropBefore, showDropAfter, onDragStart, onDragEnd, onDragOver, onDrop, onSwitch, onClose, onDoubleClick, onRenameSave, onRenameCancel }: TabItemProps) {
  return (
    <div
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "group flex shrink-0 items-center gap-1.5 whitespace-nowrap max-w-[180px] transition-all relative",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-secondary-foreground"
      )}
      style={tabStyle(isActive, isEditing, isDragging)}
      onClick={() => !isEditing && onSwitch()}
    >
      {showDropBefore && <div style={{ ...DROP_INDICATOR_STYLE, left: -1 }} />}
      {isEditing ? (
        <InlineTabEdit initialValue={tab.entry.title} onSave={onRenameSave} onCancel={onRenameCancel} />
      ) : (
        <span className="truncate" onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick() }}>
          {tab.entry.title}
        </span>
      )}
      <button
        className={cn(
          "shrink-0 rounded-sm p-0 bg-transparent border-none text-muted-foreground cursor-pointer transition-opacity hover:bg-accent hover:text-foreground",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        style={{ lineHeight: 0 }}
        draggable={false}
        onClick={(e) => { e.stopPropagation(); onClose() }}
      >
        <X size={14} />
      </button>
      {showDropAfter && <div style={{ ...DROP_INDICATOR_STYLE, right: -1 }} />}
    </div>
  )
}

export const TabBar = memo(function TabBar({
  tabs, activeTabPath, onSwitchTab, onCloseTab, onCreateNote, onReorderTabs, onRenameTab,
}: TabBarProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const dragNodeRef = useRef<HTMLDivElement | null>(null)

  const handleDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    if (editingPath) return
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    if (e.currentTarget) {
      dragNodeRef.current = e.currentTarget
      requestAnimationFrame(() => {
        if (dragNodeRef.current) dragNodeRef.current.style.opacity = '0.5'
      })
    }
  }, [editingPath])

  const handleDragEnd = useCallback(() => {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = ''
    dragNodeRef.current = null
    setDragIndex(null)
    setDropIndex(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragIndex === null || dragIndex === index) { setDropIndex(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setDropIndex(e.clientX < rect.left + rect.width / 2 ? index : index + 1)
  }, [dragIndex])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (dragIndex !== null && dropIndex !== null && dragIndex !== dropIndex && onReorderTabs) {
      const toIndex = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
      if (toIndex !== dragIndex) onReorderTabs(dragIndex, toIndex)
    }
    handleDragEnd()
  }, [dragIndex, dropIndex, onReorderTabs, handleDragEnd])

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as HTMLElement | null)) setDropIndex(null)
  }, [])

  return (
    <div
      className="flex shrink-0 items-stretch"
      style={{ height: 45, background: 'var(--sidebar)', WebkitAppRegion: 'drag' } as React.CSSProperties}
      data-tauri-drag-region
      onDragLeave={handleDragLeave}
    >
      {tabs.map((tab, index) => (
        <TabItem
          key={tab.entry.path}
          tab={tab}
          isActive={tab.entry.path === activeTabPath}
          isEditing={editingPath === tab.entry.path}
          isDragging={dragIndex !== null}
          showDropBefore={dropIndex === index}
          showDropAfter={dropIndex === index + 1 && index === tabs.length - 1}
          onDragStart={(e) => handleDragStart(e, index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={handleDrop}
          onSwitch={() => onSwitchTab(tab.entry.path)}
          onClose={() => onCloseTab(tab.entry.path)}
          onDoubleClick={() => onRenameTab && setEditingPath(tab.entry.path)}
          onRenameSave={(newTitle) => { setEditingPath(null); onRenameTab?.(tab.entry.path, newTitle) }}
          onRenameCancel={() => setEditingPath(null)}
        />
      ))}

      <div className="flex-1" style={{ borderBottom: '1px solid var(--border)' }} />

      <div
        className="flex shrink-0 items-center"
        style={{
          borderLeft: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          gap: 12,
          padding: '0 12px',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <button
          className="flex items-center justify-center border-none bg-transparent p-0 text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
          onClick={onCreateNote}
          title="New note"
        >
          <Plus size={16} />
        </button>
        <button
          className="flex items-center justify-center border-none bg-transparent p-0 text-muted-foreground"
          style={DISABLED_ICON_STYLE}
          title="Coming soon"
          tabIndex={-1}
        >
          <Columns size={16} />
        </button>
        <button
          className="flex items-center justify-center border-none bg-transparent p-0 text-muted-foreground"
          style={DISABLED_ICON_STYLE}
          title="Coming soon"
          tabIndex={-1}
        >
          <ArrowsOutSimple size={16} />
        </button>
      </div>
    </div>
  )
})
