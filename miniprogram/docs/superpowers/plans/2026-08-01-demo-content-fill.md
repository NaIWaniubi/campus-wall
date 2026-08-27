# Demo Content Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution for this small plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the mini program's testing environment so normal browsing does not show empty “no posts/no messages/no activity” states.

**Architecture:** Add a focused backend seed service that is idempotent: it inserts missing demo users, posts, interactions, messages, notifications, reports, and user-specific activity without clearing existing data. The login flow calls the user-specific seeder so any demo login immediately has “My Posts”, “Likes”, “Favorites”, “Messages”, “Following”, and “Followers” data.

**Tech Stack:** Node.js, Express, SQLite via better-sqlite3, native node:test.

## Global Constraints

- Do not clear user-created testing data.
- Use fixed `demo-*` ids and `INSERT OR IGNORE` so restarts are safe.
- Do not pre-like, pre-favorite, or pre-follow legacy post/user ids used by existing tests (`post 1`, `u1`).
- Avoid increasing the existing `校园趣事` hot-topic count.
- Keep this local/free; no paid services or network image generation.

---

### Task 1: Add regression test for non-empty demo user surfaces

**Files:**
- Modify: `server/tests/api.test.js`

- [x] Add a test that logs in a fresh demo user.
- [x] Assert these endpoints return non-empty lists: `/api/user/posts`, `/api/user/likes`, `/api/user/favorites`, `/api/conversations`, `/api/notifications`, following list, followers list.
- [x] Run the targeted test and confirm it fails before implementation.

### Task 2: Add idempotent demo seed service

**Files:**
- Create: `server/src/services/demoSeedService.js`
- Modify: `server/src/services/authService.js`

- [x] Insert fixed demo users and category posts across lost, confession, help, trade, carshare, team, and daily.
- [x] Insert comments, likes, favorites, follows, conversations, messages, notifications, and pending reports with `INSERT OR IGNORE`.
- [x] Export `ensureDemoCatalog()` for global content and `ensureDemoUserExperience(userId)` for login-specific pages.
- [x] Call `ensureDemoCatalog()` after app data initialization and `ensureDemoUserExperience(user.id)` during login.

### Task 3: Verify and commit

**Files:**
- Test: `server/tests/api.test.js`
- Test: `tests/frontend-static.test.js`

- [x] Run backend tests.
- [x] Run frontend static tests.
- [x] Run JS syntax and JSON checks.
- [x] Restart local server if needed and query key endpoints.
- [ ] Commit the implementation.
