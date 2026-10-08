import { describe, expect, it } from 'vitest'
import { isActive, navGroups } from './admin-sidebar'

const items = navGroups.flatMap((group) => group.items)
const lit = (pathname: string) => items.filter((item) => isActive(pathname, item)).map((item) => item.href)

describe('admin sidebar: which entry lights up', () => {
  it('lights up one entry for every page under /manage/bikes, the deepest that matches', () => {
    expect(lit('/manage/bikes')).toEqual(['/manage/bikes'])
    expect(lit('/manage/bikes/new')).toEqual(['/manage/bikes'])
    expect(lit('/manage/bikes/3f2a')).toEqual(['/manage/bikes'])
    expect(lit('/manage/bikes/shop')).toEqual(['/manage/bikes/shop'])
    expect(lit('/manage/bikes/options')).toEqual(['/manage/bikes/options'])
  })

  it('lights up Home only on /manage itself', () => {
    expect(lit('/manage')).toEqual(['/manage'])
    expect(lit('/manage/routes/new')).toEqual(['/manage/routes'])
  })
})
