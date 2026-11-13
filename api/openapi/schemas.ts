/**
 * OpenAPI zod 契约（spec-C T7 裁剪版）：auth / posts / conversations / drafts 四个高频域
 * - schema 同时是运行时校验源与文档源（z.toJSONSchema），新增/改字段在此处同步
 * - 只描述 data 载荷；统一响应包络 { code, message, data } 由 document.ts 的 envelope 包装
 */
import { z } from 'zod';

/* ---------- 通用 ---------- */
export const PageQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
export const IsoTime = z.string();

/* ---------- auth ---------- */
export const LoginBody = z.object({
  studentId: z.string().min(1),
  password: z.string().min(1),
});
export const RegisterBody = z.object({
  studentId: z.string().min(1),
  password: z.string().min(6),
  nickname: z.string().min(1).max(20),
  college: z.string().optional(),
  grade: z.string().optional(),
});
export const PasswordBody = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
});
export const UserSchema = z.object({
  id: z.number().int(),
  studentId: z.string(),
  nickname: z.string(),
  avatar: z.string().nullable().optional(),
  college: z.string().optional(),
  grade: z.string().optional(),
  creditScore: z.number().optional(),
  role: z.string(),
  status: z.string(),
});
export const AuthSession = z.object({
  token: z.string(),
  user: UserSchema,
});

/* ---------- posts ---------- */
export const PostListQuery = PageQuery.extend({
  sectionId: z.coerce.number().int().positive().optional(),
  sort: z.enum(['hot', 'new']).optional(),
  keyword: z.string().optional(),
});
export const PostSummary = z.object({
  id: z.number().int(),
  title: z.string(),
  content: z.string(),
  sectionId: z.number().int().optional(),
  authorId: z.number().int().nullable().optional(),
  likeCount: z.number().int().optional(),
  commentCount: z.number().int().optional(),
  createdAt: IsoTime,
});
export const PostListData = z.object({
  list: z.array(PostSummary),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  hasMore: z.boolean(),
});
export const PostDetailData = PostSummary.extend({
  images: z.array(z.string()).optional(),
  isAnonymous: z.boolean().optional(),
  liked: z.boolean().optional(),
  favorited: z.boolean().optional(),
});
export const PostBody = z.object({
  sectionId: z.number().int().positive(),
  title: z.string().min(1).max(50),
  content: z.string().min(1).max(2000),
  images: z.array(z.string()).optional(),
  isAnonymous: z.boolean().optional(),
  /** 板块差异化字段（price/contact/location 等，键名走服务端白名单） */
  extra: z.record(z.string(), z.unknown()).optional(),
});

/* ---------- conversations（私信） ---------- */
export const ConversationItem = z.object({
  id: z.number().int(),
  peer: z.object({ id: z.number().int(), nickname: z.string(), avatar: z.string().nullable() }),
  lastMessage: z.string().nullable(),
  lastAt: IsoTime.nullable(),
  unread: z.number().int(),
});
export const ConversationCreateBody = z.object({
  peerId: z.number().int().positive(),
});
export const ChatMessageItem = z.object({
  id: z.number().int(),
  conversationId: z.number().int(),
  senderId: z.number().int(),
  content: z.string(),
  isMine: z.boolean(),
  createdAt: IsoTime.nullable(),
});
export const ChatMessageListData = z.object({
  list: z.array(ChatMessageItem),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  hasMore: z.boolean(),
});
export const ChatSendBody = z.object({
  content: z.string().min(1).max(500),
});

/* ---------- drafts（云草稿） ---------- */
export const DraftBody = z.object({
  sectionId: z.number().int().positive().optional(),
  title: z.string().max(50).optional(),
  content: z.string().max(5000).optional(),
  images: z.array(z.string()).optional(),
  isAnonymous: z.boolean().optional(),
  extraFields: z.record(z.string(), z.unknown()).optional(),
});
export const DraftItem = z.object({
  id: z.number().int(),
  sectionId: z.number().int().nullable(),
  sectionName: z.string().nullable().optional(),
  title: z.string(),
  content: z.string(),
  images: z.array(z.string()),
  isAnonymous: z.boolean(),
  extraFields: z.record(z.string(), z.unknown()),
  createdAt: IsoTime,
});
export const DraftSaved = z.object({ id: z.number().int() });

/* ---------- push（Web Push 订阅，V5） ---------- */
export const PushSubscriptionKeys = z.object({
  p256dh: z.string().min(8),
  auth: z.string().min(8),
});
export const PushSubscribeBody = z.object({
  subscription: z.object({
    endpoint: z.string().min(10),
    keys: PushSubscriptionKeys,
  }),
});
export const PushUnsubscribeBody = z.object({
  endpoint: z.string().min(10),
});
