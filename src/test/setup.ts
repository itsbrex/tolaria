import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock react-virtuoso: JSDOM has no real viewport, so render all items directly
vi.mock('react-virtuoso', () => {
  const React = require('react')
  return {
    Virtuoso: ({ data, itemContent, components }: {
      data?: unknown[]
      itemContent?: (index: number, item: unknown) => React.ReactNode
      components?: { Header?: React.ComponentType }
    }) => {
      const Header = components?.Header
      return React.createElement('div', { 'data-testid': 'virtuoso-mock' },
        Header ? React.createElement(Header) : null,
        data?.map((item: unknown, index: number) =>
          React.createElement('div', { key: index }, itemContent?.(index, item))
        )
      )
    },
    GroupedVirtuoso: ({ groupCounts, groupContent, itemContent }: {
      groupCounts: number[]
      groupContent: (index: number) => React.ReactNode
      itemContent: (index: number, groupIndex: number) => React.ReactNode
    }) => {
      const React = require('react')
      let globalIndex = 0
      return React.createElement('div', { 'data-testid': 'grouped-virtuoso-mock' },
        groupCounts?.map((count: number, groupIndex: number) => {
          const items = []
          for (let i = 0; i < count; i++) {
            items.push(React.createElement('div', { key: globalIndex }, itemContent(globalIndex, groupIndex)))
            globalIndex++
          }
          return React.createElement('div', { key: `group-${groupIndex}` },
            groupContent(groupIndex),
            ...items
          )
        })
      )
    },
  }
})
