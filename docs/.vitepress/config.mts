import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '校园墙 Campus Wall',
  description: '校园信息聚合社区平台 · 产品 / 工程 / 运维全书',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/' },
      { text: '产品', link: '/guide/features' },
      { text: '工程', link: '/guide/testing' },
      { text: '部署', link: '/guide/deployment' },
      { text: '参考', items: [
        { text: '架构文档（详细）', link: '/ARCHITECTURE' },
        { text: '接口映射', link: '/API-MAPPING' },
        { text: '设计系统 V4', link: '/DESIGN-V4' },
        { text: '参赛材料', link: '/COMPETITION-SUBMISSION' },
      ] },
    ],
    sidebar: [
      {
        text: '开始',
        items: [
          { text: '项目概览', link: '/guide/' },
          { text: '本地开发', link: '/guide/development' },
          { text: '部署运维', link: '/guide/deployment' },
          { text: '版本史', link: '/guide/versions' },
        ],
      },
      {
        text: '产品',
        items: [
          { text: '功能全景', link: '/guide/features' },
          { text: '设计系统 V4', link: '/guide/design' },
          { text: 'AI 架构', link: '/guide/ai' },
        ],
      },
      {
        text: '工程',
        items: [
          { text: '质量门', link: '/guide/testing' },
          { text: '安全与匿名', link: '/guide/security' },
          { text: '系统架构', link: '/guide/architecture' },
        ],
      },
      {
        text: '参考',
        items: [
          { text: '架构文档（详细）', link: '/ARCHITECTURE' },
          { text: '接口映射', link: '/API-MAPPING' },
          { text: '设计系统规范', link: '/DESIGN-V4' },
          { text: '部署手册', link: '/DEPLOY' },
          { text: '参赛提交材料', link: '/COMPETITION-SUBMISSION' },
          { text: '验证报告', link: '/VERIFICATION_REPORT' },
          { text: '优化报告', link: '/OPTIMIZATION_REPORT' },
        ],
      },
    ],
    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '主题',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    lastUpdated: { text: '最后更新于' },
    search: { provider: 'local', options: { translations: { button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' } } } },
  },
})
