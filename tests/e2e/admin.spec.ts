/**
 * 流程 5：管理端（登录 → Dashboard 渲染 → 审核通过种子待审帖）
 */
import { expect } from '@playwright/test'
import { test } from './helpers'
import { adminLogin } from './helpers'

test('管理员可登录并看到数据总览', async ({ page }) => {
  await adminLogin(page)
  // 六卡下钻 + echarts 趋势容器渲染（TrendChart canvas）
  await expect(page.getByText('帖子总数')).toBeVisible()
  await expect(page.getByText(/近\s*7\s*天趋势/)).toBeVisible()
})

test('管理员可在人工审核队列通过待审帖', async ({ page }) => {
  await adminLogin(page)
  await page.goto('/admin/posts?tab=pending_review')
  // 种子帖：【审核队列演示】校外兼职小广告
  const row = page.getByText('【审核队列演示】校外兼职小广告').first()
  await expect(row).toBeVisible()

  await page.getByRole('button', { name: '通过', exact: true }).first().click()
  await expect(page.getByText('已通过审核')).toBeVisible({ timeout: 8_000 })
  // 该帖离开待审队列
  await expect(row).toBeHidden()
})
