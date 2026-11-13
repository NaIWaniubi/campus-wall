import io

def rd(p): return io.open(p, encoding='utf-8').read()
def wr(p, s): io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ---- HomePage：品牌卡 + 发布 FAB ----
p = 'src/pages/HomePage.vue'; s = rd(p)
s = s.replace('<section class="relative overflow-hidden p-4" style="background: var(--ink); border: 1.5px solid var(--ink); border-radius: 18px; box-shadow: var(--shadow-hard)">',
              '<section class="ds-poster relative overflow-hidden p-4" style="border: 1.5px solid rgb(247 242 232 / 0.18); border-radius: 18px">')
s = s.replace('<p class="ds-display text-[22px] mt-2" style="color: var(--paper)">校园墙</p>',
              '<p class="ds-display text-[22px] mt-2 on-poster">校园墙</p>')
s = s.replace('<p class="mt-1.5 text-[11.5px] leading-relaxed" style="color: rgb(247 242 232 / 0.72)">',
              '<p class="mt-1.5 text-[11.5px] leading-relaxed on-poster-soft">')
s = s.replace('<p class="mt-2 text-[11px] font-bold" style="color: var(--lime)">失物雷达 / 信誉分 / 匿名治理 / 实时私信</p>',
              '<p class="mt-2 text-[11px] font-bold on-poster-accent">失物雷达 / 信誉分 / 匿名治理 / 实时私信</p>')
s = s.replace('''      class="hidden md:flex fixed right-5 w-14 h-14 rounded-[16px] items-center justify-center transition-all duration-200 active:translate-x-[2px] active:translate-y-[2px] z-20"
      style="background: var(--ink); color: var(--lime); border: 1.5px solid var(--ink); box-shadow: var(--shadow-hard); bottom: calc(1.5rem + env(safe-area-inset-bottom))"''',
'''      class="ds-ink-btn hidden md:flex fixed right-5 w-14 h-14 rounded-[16px] items-center justify-center transition-all duration-200 active:translate-x-[2px] active:translate-y-[2px] z-20"
      style="box-shadow: var(--shadow-hard); bottom: calc(1.5rem + env(safe-area-inset-bottom))"''')
wr(p, s); print('HomePage', s.count('background: var(--ink)'))

# ---- PostDetailPage：sticky 头 + 评论提交按钮 ----
p = 'src/pages/PostDetailPage.vue'; s = rd(p)
s = s.replace('<header class="sticky top-0 z-20" style="background: var(--ink)">',
              '<header class="ds-poster sticky top-0 z-20">')
s = s.replace('style="width:34px;height:34px;background:rgb(255 255 255 / 0.1);border-color:rgb(255 255 255 / 0.32);color:var(--card);box-shadow:none"',
              'style="width:34px;height:34px;background:rgb(255 255 255 / 0.1);border-color:rgb(255 255 255 / 0.32);color:#F7F2E8;box-shadow:none"')
s = s.replace('class="ds-icon-btn shrink-0 disabled:opacity-50"',
              'class="ds-icon-btn ds-ink-btn shrink-0 disabled:opacity-50"')
s = s.replace('style="background: var(--ink); border-color: var(--ink); color: var(--lime)" @click="submitComment"',
              '@click="submitComment"')
wr(p, s); print('PostDetail', s.count('background: var(--ink)'), s.count('background:var(--ink)'))

# ---- PublishPage：提交条 + pub-draft 色 ----
p = 'src/pages/PublishPage.vue'; s = rd(p)
s = s.replace('<section class="ds-card flex items-center gap-3 p-3" style="background: var(--ink)">',
              '<section class="ds-poster flex items-center gap-3 p-3" style="border-radius: 18px">')
s = s.replace(""".pub-draft {
  padding: 12px 18px;
  background: transparent;
  color: var(--paper);
  border-color: rgb(255 255 255 / 0.42);
  box-shadow: none;
}""", """/* 恒暗提交条上的幽灵按钮：文字必须恒亮（--paper 深色会翻黑） */
.pub-draft {
  padding: 12px 18px;
  background: transparent;
  color: #F7F2E8;
  border-color: rgb(255 255 255 / 0.42);
  box-shadow: none;
}""")
wr(p, s); print('Publish', s.count('background: var(--ink)'))

# ---- SearchPage：清空按钮 ----
p = 'src/pages/SearchPage.vue'; s = rd(p)
s = s.replace('class="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full"',
              'class="ds-ink-btn absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full"')
s = s.replace('style="background: var(--ink); color: var(--paper)"', '')
wr(p, s); print('Search', s.count('background: var(--ink)'))

# ---- LoginPage：忘记密码遮罩 ----
p = 'src/pages/LoginPage.vue'; s = rd(p)
s = s.replace('<div class="absolute inset-0" style="background: var(--ink); opacity: 0.55"></div>',
              '<div class="ds-scrim absolute inset-0"></div>')
wr(p, s); print('Login', s.count('background: var(--ink)'))

# ---- RegisterPage 同款遮罩（检查） ----
p = 'src/pages/RegisterPage.vue'; s = rd(p)
before = s.count('background: var(--ink)')
s = s.replace('<div class="absolute inset-0" style="background: var(--ink); opacity: 0.55"></div>',
              '<div class="ds-scrim absolute inset-0"></div>')
wr(p, s); print('Register', before, '->', s.count('background: var(--ink)'))

# ---- AiAssistant：头部 + 发送按钮 ----
p = 'src/components/AiAssistant.vue'; s = rd(p)
s = s.replace('<div class="flex items-center justify-between px-4 py-3" style="background: var(--ink); color: var(--paper)">',
              '<div class="ds-poster flex items-center justify-between px-4 py-3">')
s = s.replace('<span class="ds-label" style="color: var(--lime)">官网知识库</span>',
              '<span class="ds-label on-poster-accent">官网知识库</span>')
s = s.replace('class="flex h-9 w-9 shrink-0 items-center justify-center transition active:translate-y-[1px] disabled:opacity-50"',
              'class="ds-ink-btn flex h-9 w-9 shrink-0 items-center justify-center transition active:translate-y-[1px] disabled:opacity-50"')
s = s.replace('style="background: var(--ink); color: var(--lime); border: 1.5px solid var(--ink); border-radius: 12px"',
              'style="border-radius: 12px"')
wr(p, s); print('AiAssistant', s.count('background: var(--ink)'))

# ---- AnnouncementDialog：头部 ----
p = 'src/components/AnnouncementDialog.vue'; s = rd(p)
s = s.replace('<div class="px-5 pt-6 pb-7 text-center" style="background: var(--ink); color: var(--paper)">',
              '<div class="ds-poster px-5 pt-6 pb-7 text-center">')
s = s.replace('<h3 id="announcement-title" class="ds-display text-[20px]" style="color: var(--paper)">官方公告</h3>',
              '<h3 id="announcement-title" class="ds-display text-[20px] on-poster">官方公告</h3>')
wr(p, s); print('Announce', s.count('background: var(--ink)'))

# ---- MessagePage：hero 上的 --paper 文字（黑底黑字 bug） ----
p = 'src/pages/MessagePage.vue'; s = rd(p)
s = s.replace('style="border: 1.5px solid rgb(255 255 255 / 0.34); color: var(--paper)"',
              'style="border: 1.5px solid rgb(255 255 255 / 0.34)" class="on-poster"')
s = s.replace('<h1 class="ds-display text-[22px]" style="color: var(--paper)">消息</h1>',
              '<h1 class="ds-display text-[22px] on-poster">消息</h1>')
wr(p, s); print('Message', s.count('color: var(--paper)'))

# ---- ForbiddenPage：coral 底上的 paper 图标 ----
p = 'src/pages/ForbiddenPage.vue'; s = rd(p)
s = s.replace('<ShieldX class="w-10 h-10" style="color: var(--paper)" />',
              '<ShieldX class="w-10 h-10" style="color: #F7F2E8" />')
wr(p, s); print('Forbidden ok')

# ---- CommandPalette：is-active 与遮罩的深色翻转（scoped 内） ----
p = 'src/components/CommandPalette.vue'; s = rd(p)
s = s.replace(""".cp-item.is-active {
  background: var(--ink);
  color: var(--lime);
}""", """.cp-item.is-active {
  background: var(--ink);
  color: var(--lime);
}
[data-theme='dark'] .cp-item.is-active {
  background: var(--lime);
  color: #14110F;
}""")
wr(p, s); print('Palette ok')

# ---- OnboardingGuide：遮罩同样问题 ----
p = 'src/components/OnboardingGuide.vue'; s = rd(p)
s = s.replace('.ob-overlay { background: rgb(20 17 15 / 0.58); backdrop-filter: blur(3px); }',
              """.ob-overlay { background: rgb(20 17 15 / 0.58); backdrop-filter: blur(3px); }
[data-theme='dark'] .ob-overlay { background: rgb(0 0 0 / 0.74); }""")
wr(p, s); print('Onboarding ok')
