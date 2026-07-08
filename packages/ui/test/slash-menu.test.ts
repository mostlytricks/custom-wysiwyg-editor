import { describe, expect, it } from 'vitest'
import { DEFAULT_SLASH_ITEMS, filterSlashItems } from '@custom-wysiwyg/ui'

describe('filterSlashItems', () => {
  it('returns everything for an empty query', () => {
    expect(filterSlashItems(DEFAULT_SLASH_ITEMS, '')).toHaveLength(DEFAULT_SLASH_ITEMS.length)
  })

  it('matches labels case-insensitively', () => {
    const out = filterSlashItems(DEFAULT_SLASH_ITEMS, 'Heading')
    expect(out.map((i) => i.id)).toEqual(['h1', 'h2', 'h3'])
  })

  it('matches keywords', () => {
    const out = filterSlashItems(DEFAULT_SLASH_ITEMS, 'title')
    expect(out.map((i) => i.id)).toContain('h1')
  })

  it('returns empty for no match', () => {
    expect(filterSlashItems(DEFAULT_SLASH_ITEMS, 'zzz')).toHaveLength(0)
  })
})
