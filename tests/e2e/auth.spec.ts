/**
 * 流程 2：登录 / 登出（含登录态持久化校验）
 */
import { expect } from '@playwright/test'
import { test } from './helpers'
import { login } from './helpers'

test('演示用户可登录并保持登录态', async ({ page }) => {
  await login(page)
  // Pinia persist 写入 localStorage
  const stored = await page.evaluate(() => localStorage.getItem('campus-wall-user'))
  expect(stored).toContain('token')
  // 刷新后仍是登录态（持久化生效）
  await page.reload()
  await page.goto('/profile/settings')
  await expect(page.getByText('退出登录')).toBeVisible()
})

test('错误密码被拒绝并停留在登录页', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('请输入学号').fill('23770001')
  await page.getByPlaceholder('请输入密码').fill('wrong-password')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  // 失败提示（「学号或密码错误」统一文案，防枚举）且未跳走
  await expect(page.getByText(/错误|失败/).first()).toBeVisible({ timeout: 8_000 })
  await expect(page).toHaveURL(/\/login/)
})

test('可退出登录并回到登录页', async ({ page }) => {
  await login(page)
  await page.goto('/profile/settings')
  await page.getByText('退出登录').click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await page.waitForURL(/\/login/)
  const stored = await page.evaluate(() => localStorage.getItem('campus-wall-user'))
  expect(JSON.parse(stored || '{}').token).toBe('')
})
