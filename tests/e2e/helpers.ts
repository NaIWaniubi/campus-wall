/**
 * E2E 公共步骤：Web 登录 / 管理端登录 + 公告弹窗屏蔽 fixture
 * 演示账号见 README：23770001/demo1234（信誉 92，可发帖可评论可匿名）、admin/admin123
 */
import { expect, test as base, type Page } from '@playwright/test'

/** 屏蔽公告弹窗：overlay 会拦截全页点击，且 ack 为服务端持久化在 E2E 多 context 下不可靠，直接 mock 空数据 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('**/api/announcements**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ code: 200, message: 'ok', data: null }),
      })
    )
    await use(page)
  },
})

export async function login(page: Page, studentId = '23770001', password = 'demo1234') {
  await page.goto('/login')
  // V5 登录重构后账号框为「手机号 / 拼音 / 账号」；正则一并兼容旧「学号」文案
  await page.getByPlaceholder(/账号|学号/).fill(studentId)
  await page.getByPlaceholder('请输入密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  // 登录成功后跳转（默认回首页），以导航离开登录页为成功信号
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 10_000 })
}

export async function adminLogin(page: Page) {
  await page.goto('/admin/login')
  await page.getByPlaceholder(/管理员账号|账号|学号/).fill('admin')
  await page.getByPlaceholder('请输入密码').fill('admin123')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL((u) => u.pathname.startsWith('/admin') && !u.pathname.includes('/login'), {
    timeout: 10_000,
  })
  await expect(page.getByText('待审内容')).toBeVisible()
}
