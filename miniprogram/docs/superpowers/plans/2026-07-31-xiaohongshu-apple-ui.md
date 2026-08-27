# Xiaohongshu Apple UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the mini program UI into a Xiaohongshu-style content card feed with Apple-like spacing, softness, and micro-interactions while preserving the campus green brand.

**Architecture:** This is a style-first UI pass over the existing native WeChat mini program. Keep the current data flow and page/component boundaries; change WXML only where visual structure needs extra hooks, and concentrate reusable tokens in `app.wxss`.

**Tech Stack:** Native WeChat Mini Program WXML/WXSS/JS, Node.js static tests, existing Express backend.

## Global Constraints

- Do not change backend data structure.
- Do not introduce paid services.
- Do not make a large business-logic refactor.
- Do not copy Xiaohongshu red; keep the campus green brand.
- Do not implement complex masonry layout in this pass; make the current list-card feed polished and stable.
- Keep original like, favorite, comment, publish, follow, share, and navigation behavior working.
- Use `http://127.0.0.1:3000/api` for local preview.

---

## File Structure

- Modify `app.wxss`: design tokens, global card/button/tag/avatar styles, reusable micro-interactions.
- Modify `app.json`: navigation and tab color polish only.
- Modify `pages/index/index.wxml`: add lightweight copy hooks for header/feed presentation if needed.
- Modify `pages/index/index.wxss`: convert heavy gradient header into iOS-like search/channel area and content-first feed.
- Modify `components/post-card/post-card.wxml`: add compact metadata and action labels without changing event handlers.
- Modify `components/post-card/post-card.wxss`: card hierarchy, image layout, action chips, card entrance/press animation.
- Modify `pages/detail/detail.wxss`: align detail reading card and bottom comment bar with the new visual system.
- Modify `pages/publish/publish.wxss`: iOS-style grouped form, soft input surfaces, polished publish bar.
- Test `tests/frontend-static.test.js`: existing regression suite should remain green.
- Create no new runtime dependency.

---

### Task 1: Global Visual System

**Files:**
- Modify: `app.wxss`
- Modify: `app.json`
- Test: `tests/frontend-static.test.js`

**Interfaces:**
- Consumes: existing class names `.card`, `.btn-primary`, `.tag`, `.avatar`, `.section-title`, animation names.
- Produces: reusable class behavior consumed by pages/components: softer card surfaces, consistent active feedback, `fadeInUp`, `pressable`-style active states.

- [ ] **Step 1: Update global color and surface tokens**

  In `app.wxss`, set the global page background to `#F5F6F8`, text to `#17202A`, and keep primary green as `#16A085`. Keep existing utility class names so pages do not break.

- [ ] **Step 2: Upgrade `.card`**

  In `app.wxss`, change `.card` to:

  ```css
  .card {
    background: rgba(255, 255, 255, 0.96);
    border-radius: 28rpx;
    padding: 28rpx;
    margin-bottom: 24rpx;
    box-shadow: 0 18rpx 48rpx rgba(15, 23, 42, 0.06);
    border: 1rpx solid rgba(15, 23, 42, 0.05);
  }
  ```

- [ ] **Step 3: Add natural active feedback**

  Add active states for tappable controls:

  ```css
  .card:active,
  .btn-primary:active,
  .btn-outline:active,
  .tag:active {
    transform: scale(0.985);
    opacity: 0.92;
  }
  ```

- [ ] **Step 4: Polish navigation colors**

  In `app.json`, keep the selected tab green and change `window.backgroundColor` to `#F5F6F8`. Keep navigation text readable.

- [ ] **Step 5: Run static regression tests**

  Run: `node --test tests/frontend-static.test.js`

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add app.wxss app.json tests/frontend-static.test.js
  git commit -m "style: establish soft campus UI system"
  ```

---

### Task 2: Home Feed Header and Layout

**Files:**
- Modify: `pages/index/index.wxml`
- Modify: `pages/index/index.wxss`
- Test: `tests/frontend-static.test.js`

**Interfaces:**
- Consumes: existing page data `currentCampus`, `categoryList`, `currentCategory`, `feedTabs`, `activeFeed`, `posts`.
- Produces: same event handlers `onSwitchCampus`, `onGoSearch`, `onSelectCategory`, `onSwitchFeed`, `onGoPublish`; no JS changes required.

- [ ] **Step 1: Keep the current WXML event wiring intact**

  Do not rename or remove `bindtap="onSwitchCampus"`, `bindtap="onGoSearch"`, `bindtap="onSelectCategory"`, `bindtap="onSwitchFeed"`, `bindtap="onGoPublish"`.

- [ ] **Step 2: Replace heavy header styling**

  In `pages/index/index.wxss`, change `.page-index` background to `#F5F6F8` and replace `.header` gradient with:

  ```css
  .header {
    background: rgba(245, 246, 248, 0.96);
    padding: 24rpx 24rpx 0;
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(24rpx);
    -webkit-backdrop-filter: blur(24rpx);
  }
  ```

- [ ] **Step 3: Make search and campus controls iOS-like**

  Use white rounded search/campus surfaces with subtle borders, black text, and muted placeholder text. Campus selector should be compact; search bar should visually dominate.

- [ ] **Step 4: Convert category chips to content-channel pills**

  Make inactive chips white with gray text and active chips green-tinted with stronger text. Remove loud white-on-gradient treatment.

- [ ] **Step 5: Convert feed tabs to a light segmented row**

  Keep 推荐/最新/关注, but make active state feel like a segmented control: green text and a soft green underline or background capsule.

- [ ] **Step 6: Remove continuous FAB pulsing**

  Keep the floating publish button but remove infinite animation. Use a static Apple-like shadow and `:active` scale feedback.

- [ ] **Step 7: Run static regression tests**

  Run: `node --test tests/frontend-static.test.js`

  Expected: all tests pass.

- [ ] **Step 8: Commit**

  ```bash
  git add pages/index/index.wxml pages/index/index.wxss
  git commit -m "style: refine home feed header and layout"
  ```

---

### Task 3: Xiaohongshu-Style Post Card

**Files:**
- Modify: `components/post-card/post-card.wxml`
- Modify: `components/post-card/post-card.wxss`
- Test: `tests/frontend-static.test.js`

**Interfaces:**
- Consumes: `post`, `currentUserId`, component methods `onTapCard`, `onFollow`, `onPreviewImage`, `onLike`, `onComment`, `onFavorite`, `onShare`.
- Produces: visually richer content card; all existing custom events remain unchanged.

- [ ] **Step 1: Keep existing action events unchanged**

  Do not remove `bindtap="onTapCard"`, `catchtap="onFollow"`, `bindtap="onLike"`, `bindtap="onComment"`, `bindtap="onFavorite"`, `open-type="share"`, `catchtap="onShare"`.

- [ ] **Step 2: Improve card hierarchy**

  In `components/post-card/post-card.wxss`, use larger radius (`30rpx`), stronger internal spacing, and softer shadow. Set `.post-card` overflow to hidden enough for card polish without clipping share buttons.

- [ ] **Step 3: Make author row more premium**

  Reduce noisy letter spacing, make nickname `29rpx`/`700`, time `22rpx`, and style follow/category pills as small, soft capsules.

- [ ] **Step 4: Improve reading typography**

  Set content text to `30rpx`, line-height around `1.72`, title to `34rpx`/`800`, and remove excessive letter spacing.

- [ ] **Step 5: Upgrade image presentation**

  Make single image large and rounded with max-height around `520rpx`. Make multi-image grid use `10rpx` gap and `18rpx` radius. Preserve `bindtap="onPreviewImage"`.

- [ ] **Step 6: Restyle tags and extras**

  Make topic tags lighter and smaller; show trade price as a clear accent using current danger color, not an oversized alarm color.

- [ ] **Step 7: Restyle actions as light chips**

  Make action buttons pill-shaped with light gray background on hover/active. Keep active like/favorite color feedback.

- [ ] **Step 8: Run static regression tests**

  Run: `node --test tests/frontend-static.test.js`

  Expected: all tests pass.

- [ ] **Step 9: Commit**

  ```bash
  git add components/post-card/post-card.wxml components/post-card/post-card.wxss
  git commit -m "style: polish post cards for content feed"
  ```

---

### Task 4: Detail Page Reading Experience

**Files:**
- Modify: `pages/detail/detail.wxss`
- Test: `tests/frontend-static.test.js`

**Interfaces:**
- Consumes: existing detail WXML class names and component events.
- Produces: detail page consistent with new card system; no JS behavior changes.

- [ ] **Step 1: Align page background and margins**

  Set `.page-detail` background to `#F5F6F8`, use `24rpx` horizontal margin, and keep enough bottom padding for the fixed comment bar.

- [ ] **Step 2: Improve detail card readability**

  Use card radius `30rpx`, content line-height `1.82`, title weight `800`, and softened metadata colors.

- [ ] **Step 3: Improve extra information blocks**

  Use white/green-tinted inner blocks with `22rpx` radius and subtle borders, not strong gradients.

- [ ] **Step 4: Polish bottom comment bar**

  Make `.comment-bar` a translucent white iOS dock with blur, `.comment-input` a soft pill, and action icons compact.

- [ ] **Step 5: Run static regression tests**

  Run: `node --test tests/frontend-static.test.js`

  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add pages/detail/detail.wxss
  git commit -m "style: refine detail reading experience"
  ```

---

### Task 5: Publish Page Apple-Style Form

**Files:**
- Modify: `pages/publish/publish.wxss`
- Test: `tests/frontend-static.test.js`

**Interfaces:**
- Consumes: existing publish WXML and JS state: categories, subtype, switches, title/content, topics, images, extra fields, campus picker, publish button.
- Produces: same publish behavior with cleaner grouped form styling.

- [ ] **Step 1: Align page background and spacing**

  Set `.page-publish` background to `#F5F6F8`, increase section spacing to `24rpx`, and keep bottom padding for `.publish-bar`.

- [ ] **Step 2: Restyle category choices**

  Make category cards softer: white inactive surface, green-tinted active state, rounded `24rpx`, subtle active shadow.

- [ ] **Step 3: Restyle text inputs**

  Make title/content fields feel like iOS input groups: remove harsh underlines, use `#F7F8FA` inner surfaces for text areas, and keep placeholder text at `#A4B0BE`.

- [ ] **Step 4: Restyle switches and image upload**

  Keep WeChat switches, but make surrounding rows clearer. Make image upload cells `18rpx` radius, muted dashed add tile, and clean delete badge.

- [ ] **Step 5: Restyle fixed publish bar**

  Use translucent white background with blur, large rounded green button, disabled state `#D7DEE2` with no shadow.

- [ ] **Step 6: Run static regression tests**

  Run: `node --test tests/frontend-static.test.js`

  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add pages/publish/publish.wxss
  git commit -m "style: polish publish form"
  ```

---

### Task 6: Final Verification and Manual Preview

**Files:**
- Read: all modified files
- Test: backend API tests and frontend static tests

**Interfaces:**
- Consumes: completed UI tasks.
- Produces: verified preview-ready mini program.

- [ ] **Step 1: Run backend tests**

  Run: `npm test --prefix server`

  Expected: all backend tests pass.

- [ ] **Step 2: Run frontend static tests**

  Run: `node --test tests/frontend-static.test.js`

  Expected: all frontend static tests pass.

- [ ] **Step 3: Run syntax checks**

  Run a PowerShell JSON parse check over first-party `.json` files excluding `server/node_modules`.

  Expected: no parse errors.

- [ ] **Step 4: Confirm local backend works**

  Run: `Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/posts' -TimeoutSec 3`

  Expected: response has `code: 0` and a `data.list` array.

- [ ] **Step 5: Manual WeChat DevTools preview**

  In 微信开发者工具, click 编译. Confirm:
  - 首页 loads posts without “网络连接失败”.
  - 卡片视觉 matches Xiaohongshu-style content feed.
  - 点赞/收藏/评论入口 still respond.
  - 发布页 form remains usable.

- [ ] **Step 6: Final commit**

  ```bash
  git status --short
  git add .
  git commit -m "chore: verify xiaohongshu apple ui refresh"
  ```
