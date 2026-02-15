import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/mantine'
import '@blocknote/mantine/style.css'
import type { VaultEntry } from '../types'
import './Editor.css'

interface Tab {
  entry: VaultEntry
  content: string
}

interface EditorProps {
  tabs: Tab[]
  activeTabPath: string | null
  onSwitchTab: (path: string) => void
  onCloseTab: (path: string) => void
  onNavigateWikilink: (target: string) => void
  onLoadDiff?: (path: string) => Promise<string>
  isModified?: (path: string) => boolean
}

/** Strip YAML frontmatter from markdown, returning [frontmatter, body] */
function splitFrontmatter(content: string): [string, string] {
  if (!content.startsWith('---')) return ['', content]
  const end = content.indexOf('\n---', 3)
  if (end === -1) return ['', content]
  let to = end + 4
  if (content[to] === '\n') to++
  return [content.slice(0, to), content.slice(to)]
}

function DiffView({ diff }: { diff: string }) {
  if (!diff) {
    return (
      <div className="diff-view__empty">
        No changes to display
      </div>
    )
  }

  const lines = diff.split('\n')

  return (
    <div className="diff-view">
      {lines.map((line, i) => {
        let className = 'diff-view__line diff-view__line--context'
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className = 'diff-view__line diff-view__line--added'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = 'diff-view__line diff-view__line--removed'
        } else if (line.startsWith('@@')) {
          className = 'diff-view__line diff-view__line--hunk'
        } else if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('new file')) {
          className = 'diff-view__line diff-view__line--header'
        }

        return (
          <div key={i} className={className}>
            <span className="diff-view__line-number">{i + 1}</span>
            <span className="diff-view__line-content">{line || '\u00A0'}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Inner component that creates/manages BlockNote for a single tab */
function BlockNoteTab({ content, onNavigateWikilink }: { content: string; onNavigateWikilink: (target: string) => void }) {
  const [, body] = useMemo(() => splitFrontmatter(content), [content])
  const navigateRef = useRef(onNavigateWikilink)
  navigateRef.current = onNavigateWikilink

  // Extract wiki-link targets from the raw markdown
  const wikiTargets = useMemo(() => {
    const targets = new Set<string>()
    const re = /\[\[([^\]]+)\]\]/g
    let m
    while ((m = re.exec(body))) targets.add(m[1])
    return targets
  }, [body])

  const editor = useCreateBlockNote({})

  // Load markdown content into editor
  useEffect(() => {
    async function load() {
      // Convert [[target]] wiki-links to markdown links — BlockNote renders them as underlined text
      const preprocessed = body.replace(/\[\[([^\]]+)\]\]/g, (_match, target) => `[${target}](https://wikilink.internal/${encodeURIComponent(target)})`)
      const blocks = await editor.tryParseMarkdownToBlocks(preprocessed)
      editor.replaceBlocks(editor.document, blocks)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body])

  // Intercept all clicks in the editor — check if target is a wikilink anchor
  useEffect(() => {
    const WIKILINK_PREFIX = 'https://wikilink.internal/'

    const handler = (e: MouseEvent) => {
      // Walk up from click target to find an <a> with wikilink href
      let el = e.target as HTMLElement | null
      while (el && el.tagName !== 'A') el = el.parentElement
      if (!el) return
      const href = (el as HTMLAnchorElement).getAttribute('href') || ''
      if (href.startsWith(WIKILINK_PREFIX)) {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        const target = decodeURIComponent(href.replace(WIKILINK_PREFIX, ''))
        navigateRef.current(target)
        return false
      }
    }

    // Capture phase on the container
    const container = document.querySelector('.editor__blocknote-container')
    if (!container) return
    container.addEventListener('click', handler as EventListener, true)
    return () => container.removeEventListener('click', handler as EventListener, true)
  }, [editor])

  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') !== 'light'

  return (
    <div className="editor__blocknote-container">
      <BlockNoteView
        editor={editor}
        theme={isDark ? 'dark' : 'light'}
      />
    </div>
  )
}

export function Editor({ tabs, activeTabPath, onSwitchTab, onCloseTab, onNavigateWikilink, onLoadDiff, isModified }: EditorProps) {
  const [diffMode, setDiffMode] = useState(false)
  const [diffContent, setDiffContent] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const activeTab = tabs.find((t) => t.entry.path === activeTabPath) ?? null
  const showDiffToggle = activeTab && isModified?.(activeTab.entry.path)

  useEffect(() => {
    setDiffMode(false)
    setDiffContent(null)
  }, [activeTabPath])

  const handleToggleDiff = useCallback(async () => {
    if (diffMode) {
      setDiffMode(false)
      setDiffContent(null)
      return
    }
    if (!activeTabPath || !onLoadDiff) return
    setDiffLoading(true)
    try {
      const diff = await onLoadDiff(activeTabPath)
      setDiffContent(diff)
      setDiffMode(true)
    } catch (err) {
      console.warn('Failed to load diff:', err)
    } finally {
      setDiffLoading(false)
    }
  }, [diffMode, activeTabPath, onLoadDiff])

  if (tabs.length === 0) {
    return (
      <div className="editor">
        <div className="editor__drag-strip" data-tauri-drag-region />
        <div className="editor__placeholder">
          <p>Select a note to start editing</p>
          <span className="editor__placeholder-hint">Cmd+P to search &middot; Cmd+N to create</span>
        </div>
      </div>
    )
  }

  return (
    <div className="editor">
      <div className="editor__tab-bar" data-tauri-drag-region>
        {tabs.map((tab) => (
          <div
            key={tab.entry.path}
            className={`editor__tab${tab.entry.path === activeTabPath ? ' editor__tab--active' : ''}`}
            onClick={() => onSwitchTab(tab.entry.path)}
          >
            <span className="editor__tab-title">{tab.entry.title}</span>
            <button
              className="editor__tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.entry.path)
              }}
            >
              ×
            </button>
          </div>
        ))}
        {showDiffToggle && (
          <div className="editor__tab-bar-actions">
            <button
              className={`editor__diff-toggle${diffMode ? ' editor__diff-toggle--active' : ''}`}
              onClick={handleToggleDiff}
              disabled={diffLoading}
              title={diffMode ? 'Switch to Edit view' : 'Show diff'}
            >
              {diffLoading ? '...' : diffMode ? 'Edit' : 'Diff'}
            </button>
          </div>
        )}
      </div>
      {diffMode ? (
        <div className="editor__diff-container">
          <DiffView diff={diffContent ?? ''} />
        </div>
      ) : (
        activeTab && (
          <BlockNoteTab
            key={activeTabPath}
            content={activeTab.content}
            onNavigateWikilink={onNavigateWikilink}
          />
        )
      )}
    </div>
  )
}
