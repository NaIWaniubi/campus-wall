/**
 * 数据库表结构类型定义
 * 完整定义所有表的接口，提供类型安全的数据库查询结果
 */

/**
 * 用户表
 */
export interface User {
  id: number;
  student_id: string;
  password: string;
  nickname: string;
  avatar: string | null;
  bio: string | null;
  college: string;
  class_info: string | null;
  phone: string | null;
  email: string | null;
  reputation: number;
  role: 'user' | 'admin';
  status: 'active' | 'banned';
  ban_until: string | null;
  ban_reason: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 板块表
 */
export interface Section {
  id: number;
  name: string;
  description: string;
  icon: string;
  color: string;
  post_count: number;
  sort_order: number;
  created_at: string;
}

/**
 * 帖子表
 */
export interface Post {
  id: number;
  section_id: number;
  user_id: number;
  title: string;
  content: string;
  images: string | null; // JSON string
  is_anonymous: number; // 0 or 1
  status: 'normal' | 'hidden' | 'deleted';
  view_count: number;
  like_count: number;
  favorite_count: number;
  comment_count: number;
  hotness: number;
  extra_fields: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

/**
 * 帖子扩展信息（用于列表查询返回）
 */
export interface PostWithUser extends Post {
  author_nickname?: string;
  author_avatar?: string;
  author_student_id?: string;
  section_name?: string;
  liked?: boolean;
  favorited?: boolean;
}

/**
 * 评论表
 */
export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  is_anonymous: number; // 0 or 1
  like_count: number;
  status: 'normal' | 'hidden' | 'deleted';
  created_at: string;
}

/**
 * 评论扩展信息（用于列表查询返回）
 */
export interface CommentWithUser extends Comment {
  author_nickname?: string;
  author_avatar?: string;
  liked?: boolean;
  replies?: CommentWithUser[];
}

/**
 * 点赞表
 */
export interface Like {
  id: number;
  user_id: number;
  target_type: 'post' | 'comment';
  target_id: number;
  created_at: string;
}

/**
 * 收藏表
 */
export interface Favorite {
  id: number;
  user_id: number;
  post_id: number;
  created_at: string;
}

/**
 * 举报表
 */
export interface Report {
  id: number;
  reporter_id: number;
  target_type: 'post' | 'comment';
  target_id: number;
  reason: string;
  status: 'pending' | 'handled';
  handle_result: string | null;
  created_at: string;
  handled_at: string | null;
}

/**
 * 举报扩展信息（用于管理后台）
 */
export interface ReportWithDetails extends Report {
  reporter_nickname?: string;
  target_content?: string;
  report_count?: number;
  revealedAuthor?: {
    nickname: string;
    studentId: string;
  };
}

/**
 * 通知表
 */
export interface Notification {
  id: number;
  user_id: number;
  type: 'like' | 'comment' | 'reply' | 'system';
  content: string;
  related_id: number | null;
  is_read: number; // 0 or 1
  created_at: string;
}

/**
 * 私信会话表
 */
export interface Conversation {
  id: number;
  user1_id: number;
  user2_id: number;
  last_message: string | null;
  last_message_at: string | null;
  user1_unread: number;
  user2_unread: number;
  created_at: string;
}

/**
 * 私信会话扩展信息
 */
export interface ConversationWithPeer extends Conversation {
  peer: {
    id: number;
    nickname: string;
    avatar: string | null;
  };
  unreadCount: number;
}

/**
 * 私信消息表
 */
export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  is_read: number; // 0 or 1
  created_at: string;
}

/**
 * 私信消息扩展信息
 */
export interface MessageWithMine extends Message {
  isMine: boolean;
  pendingId?: string;
}

/**
 * 反馈表
 */
export interface Feedback {
  id: number;
  user_id: number;
  type: 'bug' | 'feature' | 'improvement' | 'other';
  title: string;
  content: string;
  images: string | null; // JSON string
  status: 'pending' | 'processing' | 'resolved' | 'closed';
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 草稿表
 */
export interface Draft {
  id: number;
  user_id: number;
  section_id: number;
  title: string;
  content: string;
  images: string | null; // JSON string
  extra_fields: string | null; // JSON string
  created_at: string;
  updated_at: string;
}

/**
 * 系统配置表
 */
export interface SystemConfig {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

/**
 * Push 订阅表
 */
export interface PushSubscription {
  id: number;
  user_id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

/**
 * AI 对话历史表
 */
export interface AIConversation {
  id: number;
  user_id: number;
  question: string;
  answer: string;
  created_at: string;
}

/**
 * 操作日志表
 */
export interface OperationLog {
  id: number;
  user_id: number;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: string | null; // JSON string
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}
