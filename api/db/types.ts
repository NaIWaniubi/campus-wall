/**
 * Kysely 18 表完整类型定义
 * - kysely 用 ColumnType 区分 insert/select/update 阶段的字段类型
 * - 此处定义与 spec §5 Task 2 一致；个别字段在 SQLite/PG 端做兼容映射
 */
import type { ColumnType, Generated } from 'kysely';

export interface UserTable {
  id: Generated<number>;
  student_id: string;            // 学号，唯一
  nickname: string;
  password_hash: string;
  avatar: string | null;
  bio: string | null;
  reputation: number;            // 0-120
  role: 'user' | 'admin' | 'super';
  is_banned: 0 | 1;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface PostTable {
  id: Generated<number>;
  user_id: number;
  section_id: number;
  type: 'normal' | 'lost' | 'found' | 'trade' | 'announcement';
  title: string;
  content: string;
  images: string;                // JSON 数组字符串
  status: 'visible' | 'hidden' | 'deleted';
  view_count: Generated<number>;
  like_count: Generated<number>;
  comment_count: Generated<number>;
  is_top: 0 | 1;
  is_essence: 0 | 1;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface CommentTable {
  id: Generated<number>;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  like_count: Generated<number>;
  status: 'visible' | 'hidden' | 'deleted';
  created_at: ColumnType<string, string | undefined, never>;
}
export interface SectionTable {
  id: Generated<number>;
  slug: string;                  // 唯一，如 'lost-found'
  name: string;
  description: string;
  icon: string | null;
  sort_order: Generated<number>;
  post_count: Generated<number>;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface MessageTable {  // 私信
  id: Generated<number>;
  conv_id: number;
  sender_id: number;
  receiver_id: number;
  content: string;
  type: 'text' | 'image' | 'system';
  read_at: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface ConversationTable {
  id: Generated<number>;
  user_a: number;
  user_b: number;
  last_message_id: number | null;
  last_message_at: string | null;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface SubscriptionTable {  // 板块订阅
  id: Generated<number>;
  user_id: number;
  section_id: number;
  notify_new_post: 0 | 1;
  notify_digest: 0 | 1;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface NotificationTable {  // 站内通知
  id: Generated<number>;
  user_id: number;
  type: 'like' | 'comment' | 'follow' | 'system' | 'trade' | 'announcement';
  target_id: number | null;
  content: string;
  read_at: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface TradeTable {
  id: Generated<number>;
  post_id: number;
  seller_id: number;
  buyer_id: number | null;
  price: number;
  status: 'open' | 'reserved' | 'closed' | 'completed';
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface FollowTable {
  id: Generated<number>;
  follower_id: number;
  followee_id: number;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface LikeTable {
  id: Generated<number>;
  user_id: number;
  target_type: 'post' | 'comment';
  target_id: number;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface DraftTable {
  id: Generated<number>;
  user_id: number;
  section_id: number | null;
  title: string;
  content: string;
  images: string;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface AnnouncementTable {
  id: Generated<number>;
  user_id: number;
  title: string;
  content: string;
  pinned: 0 | 1;
  starts_at: string;
  ends_at: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface FeedbackTable {
  id: Generated<number>;
  user_id: number;
  type: 'bug' | 'suggest' | 'complain';
  content: string;
  contact: string | null;
  status: 'pending' | 'processing' | 'resolved';
  created_at: ColumnType<string, string | undefined, never>;
}
export interface AiLogTable {  // AI 调用日志
  id: Generated<number>;
  user_id: number | null;
  feature: 'rewrite' | 'summarize' | 'moderate' | 'match';
  input_hash: string;            // 脱敏 hash
  output: string;
  latency_ms: number;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface SensitiveWordTable {
  id: Generated<number>;
  word: string;
  level: 1 | 2 | 3;              // 提示/审核/拒绝
  action: 'warn' | 'review' | 'block';
  category: string | null;
  created_by: number | null;
  created_at: ColumnType<string, string | undefined, never>;
  updated_at: ColumnType<string, never, string>;
}
export interface PushSubscriptionTable {  // Web Push 订阅
  id: Generated<number>;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: ColumnType<string, string | undefined, never>;
}
export interface SettingTable {  // 键值配置
  key: string;
  value: string;
  updated_at: ColumnType<string, never, string>;
}
export interface AuditLogTable {  // 管理操作审计
  id: Generated<number>;
  user_id: number;
  action: string;
  target_type: string;
  target_id: number | null;
  detail: string;
  ip: string | null;
  created_at: ColumnType<string, string | undefined, never>;
}

export interface Database {
  users: UserTable;
  posts: PostTable;
  comments: CommentTable;
  sections: SectionTable;
  messages: MessageTable;
  conversations: ConversationTable;
  subscriptions: SubscriptionTable;
  notifications: NotificationTable;
  trades: TradeTable;
  follows: FollowTable;
  likes: LikeTable;
  drafts: DraftTable;
  announcements: AnnouncementTable;
  feedback: FeedbackTable;
  ai_logs: AiLogTable;
  sensitive_words: SensitiveWordTable;
  push_subscriptions: PushSubscriptionTable;
  settings: SettingTable;
  audit_logs: AuditLogTable;
}
