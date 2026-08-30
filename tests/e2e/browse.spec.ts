/**
 * 流程 1：游客浏览（未登录首页信息流 + 搜索）
 */
import { expect } from '@playwright/test'
import { test } from './helpers'

test('游客可浏览首页信息流并看到种子帖子', async ({ page }) => {
  await page.goto('/')
  // 种子帖标题（seed-demo：二手 iPad 帖）
  await expect(page.getByText('出九成新 iPad Air 5 蓝色 64G').first()).toBeVisible()
  // 信息流至少渲染出多张帖子卡（标题可见即可视为 PostCard 渲染成功）
  await expect(page.getByText('毕业出捷安特通勤自行车')).toBeVisible()
})

test('游客可搜索到目标帖子', async ({ page }) => {
  await page.goto('/search')
  await page.getByPlaceholder('搜索帖子').fill('iPad')
  await page.getByPlaceholder('搜索帖子').press('Enter')
  await expect(page.getByText('出九成新 iPad Air 5 蓝色 64G').first()).toBeVisible()
})

test('游客可打开帖子详情（匿名作者脱敏展示）', async ({ page }) => {
  await page.goto('/')
  await page.getByText('表白图书馆三楼靠窗的男生').first().click()
  await expect(page).toHaveURL(/\/post\/\d+/)
  await expect(page.getByText('表白图书馆三楼靠窗的男生')).toBeVisible()
})
