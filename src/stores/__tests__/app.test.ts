import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAppStore } from '../app'
import { useUserStore } from '../user'

describe('useAppStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes with default empty state', () => {
    const store = useAppStore()
    expect(store.sections).toEqual([])
    expect(store.unreadCount).toBe(0)
    expect(store.loading).toBe(false)
  })

  it('getSectionName returns corresponding name by id', () => {
    const store = useAppStore()
    store.sections = [
      { id: 1, name: '二手交易', icon: 'shopping-bag', sort: 1, isActive: true, forceAnonymous: false, needAudit: true },
      { id: 2, name: '失物招领', icon: 'search', sort: 2, isActive: true, forceAnonymous: false, needAudit: false },
    ]

    expect(store.getSectionName(1)).toBe('二手交易')
    expect(store.getSectionName(2)).toBe('失物招领')
    expect(store.getSectionName(99)).toBe('')
  })

  it('getSectionIcon returns corresponding icon by name', () => {
    const store = useAppStore()
    store.sections = [
      { id: 1, name: '二手交易', icon: 'shopping-bag', sort: 1, isActive: true, forceAnonymous: false, needAudit: true },
      { id: 3, name: '表白墙', icon: 'heart', sort: 3, isActive: true, forceAnonymous: false, needAudit: false },
    ]

    expect(store.getSectionIcon('二手交易')).toBe('shopping-bag')
    expect(store.getSectionIcon('表白墙')).toBe('heart')
    expect(store.getSectionIcon('未知')).toBe('')
  })

  it('refreshUnread does nothing when user is not logged in', async () => {
    const appStore = useAppStore()
    const userStore = useUserStore()
    userStore.token = ''

    const fetchSpy = vi.spyOn(appStore, 'fetchUnreadCount')
    await appStore.refreshUnread()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
