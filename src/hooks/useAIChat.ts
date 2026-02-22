/**
 * Custom hook encapsulating AI chat state and message handling.
 */
import { useState, useCallback, useRef } from 'react'
import type { VaultEntry } from '../types'
import {
  type ChatMessage, nextMessageId, getApiKey,
  buildSystemPrompt, streamChat,
} from '../utils/ai-chat'
import { countWords } from '../utils/wikilinks'

function generateMockResponse(message: string, entry: VaultEntry | null, content: string): string {
  const title = entry?.title ?? 'Untitled'
  const words = countWords(content)
  const lower = message.toLowerCase()

  if (lower.includes('summarize')) {
    return `This note is about **${title}**. It contains ${words} words covering the main concepts documented in your vault.`
  }
  if (lower.includes('expand')) {
    return `Here are some ways to expand this note:\n\n1. Add more detail to the introduction\n2. Include related examples\n3. Connect it to your quarterly goals\n4. Add a summary section at the end`
  }
  if (lower.includes('grammar')) {
    return `I reviewed the document for grammar issues. The writing looks clean overall — no major errors found.`
  }

  return `Based on **${title}**, I can help with analysis, summarization, or expansion. What would you like to focus on?`
}

export function useAIChat(
  entry: VaultEntry | null,
  allContent: Record<string, string>,
  contextNotes: VaultEntry[],
  model: string,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const abortRef = useRef(false)

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || isStreaming) return

    const userMsg: ChatMessage = { role: 'user', content: text.trim(), id: nextMessageId() }
    setMessages(prev => [...prev, userMsg])
    setIsStreaming(true)
    setStreamingContent('')
    abortRef.current = false

    const allMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
    const hasApiKey = !!getApiKey()

    if (!hasApiKey) {
      const content = entry ? (allContent[entry.path] ?? '') : ''
      setTimeout(() => {
        if (abortRef.current) return
        const response = generateMockResponse(text, entry, content)
        setMessages(prev => [...prev, { role: 'assistant', content: response, id: nextMessageId() }])
        setIsStreaming(false)
      }, 800)
      return
    }

    const { prompt: systemPrompt } = buildSystemPrompt(contextNotes, allContent)
    let accumulated = ''

    const onChunk = (chunk: string) => {
      if (abortRef.current) return
      accumulated += chunk
      setStreamingContent(accumulated)
    }

    const onDone = () => {
      if (abortRef.current) return
      setMessages(prev => [...prev, { role: 'assistant', content: accumulated, id: nextMessageId() }])
      setStreamingContent('')
      setIsStreaming(false)
    }

    const onError = (error: string) => {
      if (abortRef.current) return
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error}`, id: nextMessageId() }])
      setStreamingContent('')
      setIsStreaming(false)
    }

    streamChat(allMessages, systemPrompt, model, onChunk, onDone, onError)
  }, [isStreaming, entry, allContent, contextNotes, model, messages])

  const clearConversation = useCallback(() => {
    abortRef.current = true
    setMessages([])
    setIsStreaming(false)
    setStreamingContent('')
  }, [])

  const retryMessage = useCallback((msgIndex: number) => {
    const userMsgIndex = msgIndex - 1
    if (userMsgIndex < 0) return
    const userMsg = messages[userMsgIndex]
    if (userMsg.role !== 'user') return

    setMessages(prev => prev.slice(0, msgIndex))
    sendMessage(userMsg.content)
  }, [messages, sendMessage])

  return { messages, isStreaming, streamingContent, sendMessage, clearConversation, retryMessage }
}
