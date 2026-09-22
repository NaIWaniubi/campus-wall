import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: '校园墙 Campus Wall',
  description: '校园信息聚合社区平台 · 开发与运维文档',
  cleanUrls: true,
  // 仓库内的存量长文档含裸 HTML，暂不纳入站点构建（保留在 docs/ 供仓库内查阅）
  srcExclude: ['ARCHITECTURE.md', 'API-MAPPING.md'],
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/' },
      { text: '架构', link: '/guide/architecture' },
      { text: '开发', link: '/guide/development' },
      { text: '部署', link: '/guide/deployment' },
    ],
    sidebar: [
      {
        text: '指南',
        items: [
          { text: '项目概览', link: '/guide/' },
          { text: '系统架构', link: '/guide/architecture' },
          { text: '本地开发', link: '/guide/development' },
          { text: '部署运维', link: '/guide/deployment' },
        ],
      },
    ],
    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一页', next: '下一页' },
    darkModeSwitchLabel: '主题',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '目录',
    lastUpdated: { text: '最后更新于' },
  },
})