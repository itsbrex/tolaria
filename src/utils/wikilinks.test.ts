import { describe, it, expect } from 'vitest'
import { preProcessWikilinks, injectWikilinks, splitFrontmatter, countWords } from './wikilinks'

interface TestBlock {
  type?: string
  text?: string
  content?: TestBlock[]
  children?: TestBlock[]
  props?: Record<string, string>
  href?: string
  [key: string]: unknown
}

describe('preProcessWikilinks', () => {
  it('replaces [[target]] with placeholder tokens', () => {
    const result = preProcessWikilinks('See [[My Note]] for details')
    expect(result).toContain('WIKILINK:My Note')
    expect(result).not.toContain('[[My Note]]')
  })

  it('handles aliases [[note|alias]]', () => {
    const result = preProcessWikilinks('Link to [[project/my-project|My Project]]')
    expect(result).toContain('WIKILINK:project/my-project|My Project')
  })

  it('handles multiple wikilinks', () => {
    const result = preProcessWikilinks('See [[A]] and [[B]]')
    expect(result).toContain('WIKILINK:A')
    expect(result).toContain('WIKILINK:B')
  })

  it('returns unchanged text when no wikilinks', () => {
    const input = 'No links here'
    expect(preProcessWikilinks(input)).toBe(input)
  })

  it('handles empty string', () => {
    expect(preProcessWikilinks('')).toBe('')
  })
})

describe('injectWikilinks', () => {
  const WL_START = '\u2039WIKILINK:'
  const WL_END = '\u203A'

  it('converts placeholder text nodes into wikilink nodes', () => {
    const blocks = [{
      content: [
        { type: 'text', text: `before ${WL_START}My Note${WL_END} after` },
      ],
    }]

    const result = injectWikilinks(blocks) as TestBlock[]
    expect(result[0].content).toHaveLength(3)
    expect(result[0].content![0]).toEqual({ type: 'text', text: 'before ' })
    expect(result[0].content![1]).toEqual({
      type: 'wikilink',
      props: { target: 'My Note' },
      content: undefined,
    })
    expect(result[0].content![2]).toEqual({ type: 'text', text: ' after' })
  })

  it('handles multiple wikilinks in one text node', () => {
    const blocks = [{
      content: [
        { type: 'text', text: `${WL_START}A${WL_END} and ${WL_START}B${WL_END}` },
      ],
    }]

    const result = injectWikilinks(blocks) as TestBlock[]
    const wikilinkNodes = result[0].content!.filter((n: TestBlock) => n.type === 'wikilink')
    expect(wikilinkNodes).toHaveLength(2)
    expect(wikilinkNodes[0].props!.target).toBe('A')
    expect(wikilinkNodes[1].props!.target).toBe('B')
  })

  it('passes through non-text content items unchanged', () => {
    const blocks = [{
      content: [
        { type: 'link', text: 'some link', href: 'http://example.com' },
      ],
    }]

    const result = injectWikilinks(blocks) as TestBlock[]
    expect(result[0].content![0].type).toBe('link')
  })

  it('recursively processes children blocks', () => {
    const blocks = [{
      content: [],
      children: [{
        content: [
          { type: 'text', text: `See ${WL_START}Nested${WL_END}` },
        ],
      }],
    }]

    const result = injectWikilinks(blocks) as TestBlock[]
    const childContent = result[0].children![0].content!
    expect(childContent).toHaveLength(2)
    expect(childContent[1].type).toBe('wikilink')
    expect(childContent[1].props!.target).toBe('Nested')
  })

  it('handles blocks without content or children', () => {
    const blocks = [{ type: 'heading', props: { level: 1 } }]
    const result = injectWikilinks(blocks as unknown[]) as TestBlock[]
    expect(result).toEqual(blocks)
  })

  it('handles text node that starts with wikilink', () => {
    const blocks = [{
      content: [
        { type: 'text', text: `${WL_START}First${WL_END} text` },
      ],
    }]

    const result = injectWikilinks(blocks) as TestBlock[]
    expect(result[0].content![0].type).toBe('wikilink')
    expect(result[0].content![0].props!.target).toBe('First')
    expect(result[0].content![1].text).toBe(' text')
  })

  it('handles text node that ends with wikilink', () => {
    const blocks = [{
      content: [
        { type: 'text', text: `text ${WL_START}Last${WL_END}` },
      ],
    }]

    const result = injectWikilinks(blocks) as TestBlock[]
    expect(result[0].content![0].text).toBe('text ')
    expect(result[0].content![1].type).toBe('wikilink')
  })
})

describe('splitFrontmatter', () => {
  it('splits YAML frontmatter from body', () => {
    const content = '---\ntitle: Hello\n---\n\n# Hello\n'
    const [fm, body] = splitFrontmatter(content)
    expect(fm).toBe('---\ntitle: Hello\n---\n')
    expect(body).toBe('\n# Hello\n')
  })

  it('returns empty frontmatter when none present', () => {
    const content = '# No Frontmatter'
    const [fm, body] = splitFrontmatter(content)
    expect(fm).toBe('')
    expect(body).toBe('# No Frontmatter')
  })

  it('returns empty frontmatter when closing --- is missing', () => {
    const content = '---\ntitle: Hello\nNo closing'
    const [fm, body] = splitFrontmatter(content)
    expect(fm).toBe('')
    expect(body).toBe(content)
  })

  it('handles frontmatter followed by immediate content', () => {
    const content = '---\ntitle: Hello\n---\nContent'
    const [fm, body] = splitFrontmatter(content)
    expect(fm).toBe('---\ntitle: Hello\n---\n')
    expect(body).toBe('Content')
  })
})

describe('countWords', () => {
  it('counts words in body text, stripping frontmatter', () => {
    const content = '---\ntitle: Hello\n---\n\nThis is a test note with seven words.'
    expect(countWords(content)).toBe(8)
  })

  it('strips markdown formatting characters', () => {
    const content = '---\ntitle: Test\n---\n\n# Heading\n\n**bold** and *italic*'
    const count = countWords(content)
    expect(count).toBeGreaterThan(0)
  })

  it('returns 0 for empty body', () => {
    const content = '---\ntitle: Hello\n---\n'
    expect(countWords(content)).toBe(0)
  })

  it('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0)
  })

  it('returns 0 for content that is only frontmatter', () => {
    const content = '---\ntitle: Hello\nstatus: Active\n---\n'
    expect(countWords(content)).toBe(0)
  })

  it('handles content without frontmatter', () => {
    const content = 'Hello world this is four words plus three'
    expect(countWords(content)).toBe(8)
  })
})
