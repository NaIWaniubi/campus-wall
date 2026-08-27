# Campus Wall Social Redesign Design

Date: 2026-07-28
Project: Native WeChat mini program at `C:\Users\chen\Desktop\校园墙`

## Objective

Redesign the current campus-wall mini program from a generic demo-style utility into a production-oriented campus anonymous community with stronger social interaction, better visual polish, clearer user workflows, and low-cost launch choices.

The first launch targets a small on-campus pilot of roughly 100 to 1,000 users. It should feel real and usable, while avoiding paid services where a practical free or low-cost substitute can support the pilot safely.

## Confirmed Product Direction

The selected direction is a heavier social-community version:

- Campus anonymous plaza and topic browsing are central.
- Mutual-aid, second-hand, lost-and-found, and request posts remain important.
- Private messaging is included in the first launch.
- Following users is included in the first launch.
- Anonymous posting and anonymous private messaging are allowed in the UI.
- The backend always keeps the real authenticated account for moderation, reports, blocking, and bans.
- Posts use publish-first-review-later moderation.
- First launch uses WeChat-only login; phone and email login are deferred.

## Navigation And Information Architecture

Use five primary tabs:

- Home: recommendation, latest, following, and hot topic entry points.
- Topics: topic/channel browsing for confession wall, casual chat, help, second-hand, lost-and-found, study, jobs, and events.
- Publish: centered primary action for posting.
- Messages: private messages plus interaction and system notifications.
- Profile: user homepage, personal content, follows, favorites, settings, reports, and admin entry when permitted.

The primary workflow should be:

1. Browse feed or topic.
2. Open a post detail page.
3. Like, favorite, comment, follow the author, share, report, or privately message the author.
4. Publish content with topic, anonymous mode, images, location, and private-message setting.
5. Return through messages, notifications, or profile content lists.

## Visual And Interaction Direction

Use the approved "Community Lane" direction, made more mature and less template-like:

- Replace dominant purple gradients, glass cards, heavy shadows, and decorative animation.
- Use a light campus-community palette with fresh green or teal as the main action color and a small amount of warm orange for urgency and heat.
- Use neutral light backgrounds, compact spacing, and card radius around 8px or less.
- Make post cards feel like campus notes: author or anonymous identity, topic, text, media, location, time, status, and interaction counts are easy to scan.
- Keep utility metadata visible for mutual-aid posts, especially location, deadline, status, and urgency.
- Avoid nested cards and decorative blobs.
- Use clear empty states, login prompts, loading states, retry states, and failure recovery.

Publishing should be a simpler one-step flow:

- Write content.
- Select topic/category.
- Choose anonymous or public identity.
- Add optional images.
- Add optional campus location.
- Choose whether private messages are allowed.
- Publish directly without a final confirmation dialog.

## Authentication

First launch uses WeChat login only.

Implementation expectation:

- The mini program calls `wx.login`.
- The backend exchanges the code through WeChat's `code2Session` flow.
- The backend creates or updates an account tied to the real WeChat openid or unionid when available.
- The backend issues its own session token.
- Phone and email login are not shown in the first launch.

The existing demo behavior of treating the temporary WeChat login code as an openid must be replaced before production.

Protected actions require login:

- Publish
- Comment
- Like
- Favorite
- Follow
- Private message
- Report
- Edit profile

Logged-out users may browse public content and receive clear login prompts when they try protected actions.

## Social Features

### Feeds

Home includes:

- Recommended: simple server-ranked feed using recency, engagement, report status, and moderation status.
- Latest: reverse chronological public posts.
- Following: posts from followed users; empty state encourages browsing topics or following authors.

### Topics

Topics replace the current purely category-like feel with community channels. Each topic page shows:

- Topic name and short description.
- Hot posts.
- Latest posts.
- Publish shortcut with the topic preselected.

Counts must come from real data, not random inflation.

### Follow

Users can follow and unfollow other users from post cards, post details, and profile pages.

Required data:

- Follower relationship records.
- Follower and following counts derived from real relationships.
- Notifications when a user gains a follower.
- Following feed based on followed author IDs.

Anonymous posts still belong to a real account, but the visible identity remains anonymous.

### Private Messaging

Private messaging is part of the first launch and should remain controlled:

- One-to-one text chat only.
- Enter from post detail, user profile, or message list.
- Show conversation list with last message, unread count, and time.
- Show chat screen with text input, send state, failure retry, report, and block.
- Support anonymous display names in the UI.
- Backend stores the real sender and receiver IDs for safety.
- No images, voice, group chats, open user search, or read receipts in the first launch.

Blocking rules:

- A blocked user cannot send further messages to the blocker.
- Blocked conversations show a clear state.
- Blocked content should be reduced or hidden where practical.

## Content And Moderation

The first launch uses publish-first-review-later:

- Normal posts appear immediately.
- Severe sensitive keywords block publishing.
- Medium-risk keywords allow publishing but add the content to an admin review queue.
- User reports add posts, comments, messages, or users to the review queue.
- Admins can hide posts, hide comments, mark reports resolved, warn users, or ban users.
- Banned users cannot publish, comment, follow, like, favorite, or send messages.

Moderation applies to:

- Posts
- Comments
- Private messages
- Profiles
- Reports and feedback

This avoids paid smart moderation for the pilot while keeping basic safety controls.

## Data And Backend Direction

The current JSON-file persistence is not acceptable for production launch. Replace it with a low-cost persistent database.

Preferred pilot choices:

- Local or server-hosted SQLite for the cheapest controlled pilot.
- A free-tier cloud database if the pilot needs public deployment and easier operations.

The backend should keep separate modules or route groups for:

- Auth and session handling
- Users and profiles
- Posts and topics
- Comments
- Reactions and favorites
- Follows
- Conversations and messages
- Notifications
- Reports and moderation
- Uploads

Secrets must move out of source code and into environment configuration.

The shared request wrapper should treat successful 2xx responses as success, not only HTTP 200.

## Low-Cost Launch Choices

Avoid paid services where safe:

- Use WeChat login instead of SMS or email login for first launch.
- Use站内 notifications instead of SMS notifications.
- Use keyword rules plus manual admin review instead of paid smart moderation.
- Limit image count and file size to control storage.
- Use simple ranking rather than paid recommendation or analytics services.
- Use a simple admin page inside the mini program or a lightweight local web admin first.

Costs that may still exist for real launch:

- Mini program certification and related platform requirements.
- Domain, HTTPS, and hosting.
- Database hosting if not running locally.
- Object storage if images are used at meaningful scale.

## Existing Issues To Fix In Implementation

- Replace random topic/category counts with real counts.
- Make list-page like and favorite actions call backend APIs.
- Use native WeChat share buttons for share actions.
- Strengthen publish validation for topic, subtype, required category fields, and media limits.
- Remove the final publish confirmation dialog.
- Add login prompts to protected actions and logged-out message/profile states.
- Remove or disable settings that are not actually implemented.
- Fix clear-cache behavior so it does not unexpectedly log the user out.
- Replace free-form phone binding with no first-launch phone binding.
- Remove fake follower counts and implement real follows.
- Replace demo auth and hard-coded secrets.

## Error States

Required states:

- Logged out
- Empty feed
- Empty following feed
- Empty topic
- Empty private messages
- Empty notifications
- Network failure with retry
- Publish failure with draft preservation
- Upload failure with retry/remove
- Content blocked by severe keyword
- Content under review
- Content removed
- User banned
- Conversation blocked

## Testing Scope

Before calling the work complete, verify:

- WeChat login success and failure handling.
- Logged-out browsing and protected-action login prompts.
- Anonymous and non-anonymous publishing.
- Topic selection and validation.
- Feed loading for recommended, latest, and following.
- Real persistence for like, favorite, comment, follow, and message state after refresh.
- Private message send, failed send retry, unread count, and conversation list.
- Report flow for posts, comments, messages, and users.
- Admin handling for report resolution, content hiding, and user banning.
- Sensitive keyword blocking and review queue marking.
- Native share behavior.
- Settings no longer expose fake or harmful controls.

## Explicit First-Launch Exclusions

Do not implement in the first launch:

- SMS login
- Email login
- School identity verification
- Paid smart moderation
- Image or voice private messages
- Group chat
- Payment or escrow
- Complex recommendation algorithms
- Multi-campus operations
- Full analytics dashboard

## Acceptance Criteria

The redesign is acceptable when:

- The app feels like a polished campus social community rather than a generic template.
- Core social actions persist and survive refresh.
- Users can browse, publish, follow, message, report, and manage their own content.
- Anonymous behavior is visible to users but accountable in backend data.
- The pilot can run without SMS fees or paid moderation services.
- Existing demo-only production blockers are either fixed or clearly removed from launch scope.
