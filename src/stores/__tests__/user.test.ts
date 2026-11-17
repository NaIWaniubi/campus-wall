import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '../user'

// access token 只在内存，启动靠 refresh 静默续期——这里 mock 请求层覆盖三条分支。
// vi.hoisted：mock 工厂在模块导入期就会执行，普通 const 此时尚未初始化，必须用 hoisted 声明
const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }))
vi.mock('@/utils/request', () => ({
  default: {
    post: (...args: unknown[]) => refreshMock(...args),
    get: () => Promise.resolve({ data: {} }),
  },
}))

describe('useUserStore', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    refreshMock.mockReset()
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

  it('ensureSession：内存无 token 且有持久化 refresh 时静默续期成功', async () => {
    const store = useUserStore()
    store.refreshToken = 'rt-abc'
    refreshMock.mockResolvedValue({ data: { token: 'acc-1', refreshToken: 'rt-2' } })

    await store.ensureSession()

    expect(refreshMock).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'rt-abc' })
    expect(store.token).toBe('acc-1')
    expect(store.refreshToken).toBe('rt-2')
    expect(store.isLoggedIn).toBe(true)
  })

  it('ensureSession：续期失败时清空登录态（吊销/过期）', async () => {
    const store = useUserStore()
    store.token = ''
    store.user = { id: 9, studentId: 'x', nickname: 'n', avatar: '', college: '', grade: '', signature: '', creditScore: 100, role: 'student', status: 'active', createdAt: '' }
    store.refreshToken = 'rt-dead'
    refreshMock.mockRejectedValue(new Error('401'))

    await store.ensureSession()

    expect(store.token).toBe('')
    expect(store.refreshToken).toBe('')
    expect(store.user).toBeNull()
  })

  it('ensureSession：已有 token 时不再打续期接口（避免多余往返）', async () => {
    const store = useUserStore()
    store.token = 'live-acc'
    store.refreshToken = 'rt-x'

    await store.ensureSession()

    expect(refreshMock).not.toHaveBeenCalled()
  })
})
