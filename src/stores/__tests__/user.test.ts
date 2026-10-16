import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '../user'

describe('useUserStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('initializes with empty token and null user', () => {
    const store = useUserStore()
    expect(store.token).toBe('')
    expect(store.user).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(store.isAdmin).toBe(false)
  })

  it('computes permissions and limits based on creditScore', () => {
    const store = useUserStore()
    store.token = 'mock_token'
    store.user = {
      id: 1,
      studentId: '20240001',
      nickname: '小张',
      avatar: '',
      college: '计算机',
      grade: '2024',
      signature: '',
      creditScore: 95,
      role: 'student',
      status: 'active',
      createdAt: '2026-01-01',
    }

    expect(store.isLoggedIn).toBe(true)
    expect(store.canPost).toBe(true)
    expect(store.canComment).toBe(true)
    expect(store.canAnonymous).toBe(true)
    expect(store.postLimit).toBe(10)

    // 信誉分降到 70
    store.user.creditScore = 70
    expect(store.canPost).toBe(true)
    expect(store.canAnonymous).toBe(false)
    expect(store.postLimit).toBe(3)

    // 信誉分降到 50 (受限)
    store.user.creditScore = 50
    expect(store.canPost).toBe(false)
    expect(store.canComment).toBe(false)
    expect(store.postLimit).toBe(0)
  })

  it('correctly identifies super_admin and section_admin roles', () => {
    const store = useUserStore()
    store.token = 'mock_token'
    store.user = {
      id: 2,
      studentId: 'admin',
      nickname: '管理员',
      avatar: '',
      college: '软件',
      grade: '2024',
      signature: '',
      creditScore: 120,
      role: 'super_admin',
      status: 'active',
      createdAt: '2026-01-01',
    }

    expect(store.isAdmin).toBe(true)
    expect(store.isSuperAdmin).toBe(true)

    store.user.role = 'section_admin'
    expect(store.isAdmin).toBe(true)
    expect(store.isSuperAdmin).toBe(false)
  })

  it('logout() resets token and user state completely', () => {
    const store = useUserStore()
    store.token = 'active_token'
    store.user = {
      id: 3,
      studentId: '20240003',
      nickname: '小李',
      avatar: '',
      college: '经管',
      grade: '2024',
      signature: '',
      creditScore: 100,
      role: 'student',
      status: 'active',
      createdAt: '2026-01-01',
    }

    store.logout()
    expect(store.token).toBe('')
    expect(store.user).toBeNull()
    expect(store.isLoggedIn).toBe(false)
  })

  it('migrateLegacyUser() migrates snake_case fields to camelCase', () => {
    const store = useUserStore()
    store.user = {
      id: 4,
      student_id: '20240004',
      nickname: '小赵',
      avatar: '',
      college: '理学院',
      grade: '2024',
      signature: '',
      credit_score: 85,
      role: 'student',
      status: 'active',
      created_at: '2026-01-01',
    } as any

    store.migrateLegacyUser()
    expect((store.user as any).creditScore).toBe(85)
    expect((store.user as any).studentId).toBe('20240004')
    expect((store.user as any).createdAt).toBe('2026-01-01')
  })
})
