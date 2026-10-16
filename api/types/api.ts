/**
 * API 请求和响应类型定义
 * 完整定义所有 API 的请求/响应格式，提供端到端的类型安全
 */

import type { PostWithUser, CommentWithUser, User, Section, Notification, ConversationWithPeer, MessageWithMine, Feedback, Draft, ReportWithDetails } from './database.js';

/**
 * 统一 API 响应格式
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

/**
 * 分页响应格式
 */
export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * 用户相关 API
 */
export namespace UserAPI {
  // 注册
  export interface RegisterRequest {
    studentId: string;
    password: string;
    nickname: string;
    college: string;
    classInfo?: string;
    phone?: string;
    email?: string;
  }

  export interface RegisterResponse {
    user: Omit<User, 'password'>;
    token: string;
  }

  // 登录
  export interface LoginRequest {
    studentId: string;
    password: string;
  }

  export interface LoginResponse {
    user: Omit<User, 'password'>;
    token: string;
  }

  // 修改密码
  export interface ChangePasswordRequest {
    oldPassword: string;
    newPassword: string;
  }

  // 更新资料
  export interface UpdateProfileRequest {
    nickname?: string;
    avatar?: string;
    bio?: string;
    college?: string;
    classInfo?: string;
    phone?: string;
    email?: string;
  }

  export interface UserProfile extends Omit<User, 'password'> {
    postCount?: number;
    likeCount?: number;
    favoriteCount?: number;
  }
}

/**
 * 帖子相关 API
 */
export namespace PostAPI {
  // 创建帖子
  export interface CreateRequest {
    sectionId: number;
    title: string;
    content: string;
    images?: string[];
    isAnonymous?: boolean;
    extraFields?: Record<string, any>;
  }

  export interface CreateResponse {
    postId: number;
  }

  // 列表查询
  export interface ListRequest {
    sectionId?: number;
    sortBy?: 'hot' | 'latest';
    page?: number;
    pageSize?: number;
    search?: string;
    subType?: string;
    minPrice?: number;
    maxPrice?: number;
    lostOrFound?: 'lost' | 'found';
  }

  export type ListResponse = PaginatedResponse<PostWithUser>;

  // 帖子详情
  export interface DetailResponse extends PostWithUser {
    comments?: CommentWithUser[];
  }

  // 更新帖子
  export interface UpdateRequest {
    title?: string;
    content?: string;
    images?: string[];
    extraFields?: Record<string, any>;
  }

  // 点赞响应
  export interface LikeResponse {
    liked: boolean;
    likeCount: number;
  }

  // 收藏响应
  export interface FavoriteResponse {
    favorited: boolean;
    favoriteCount: number;
  }
}

/**
 * 评论相关 API
 */
export namespace CommentAPI {
  // 创建评论
  export interface CreateRequest {
    content: string;
    isAnonymous?: boolean;
  }

  export interface CreateResponse {
    commentId: number;
  }

  // 回复评论
  export interface ReplyRequest {
    content: string;
    isAnonymous?: boolean;
  }

  export interface ReplyResponse {
    commentId: number;
  }

  // 列表查询
  export interface ListRequest {
    page?: number;
    pageSize?: number;
  }

  export type ListResponse = PaginatedResponse<CommentWithUser>;

  // 点赞响应
  export interface LikeResponse {
    liked: boolean;
    likeCount: number;
  }
}

/**
 * 板块相关 API
 */
export namespace SectionAPI {
  export type ListResponse = Section[];
  
  export interface StatsResponse {
    totalPosts: number;
    todayPosts: number;
    totalUsers: number;
    activeUsers: number;
  }
}

/**
 * 通知相关 API
 */
export namespace NotificationAPI {
  export interface ListRequest {
    page?: number;
    pageSize?: number;
    unreadOnly?: boolean;
  }

  export type ListResponse = PaginatedResponse<Notification>;

  export interface UnreadCountResponse {
    count: number;
  }
}

/**
 * 私信相关 API
 */
export namespace ConversationAPI {
  // 会话列表
  export type ListResponse = ConversationWithPeer[];

  // 消息列表
  export interface MessageListRequest {
    afterId?: number;
    limit?: number;
  }

  export interface MessageListResponse {
    list: MessageWithMine[];
    hasMore: boolean;
  }

  // 发送消息
  export interface SendRequest {
    content: string;
  }

  export interface SendResponse {
    messageId: number;
    createdAt: string;
  }

  // 未读数
  export interface UnreadCountResponse {
    count: number;
  }
}

/**
 * 反馈相关 API
 */
export namespace FeedbackAPI {
  // 提交反馈
  export interface SubmitRequest {
    type: 'bug' | 'feature' | 'improvement' | 'other';
    title: string;
    content: string;
    images?: string[];
  }

  export interface SubmitResponse {
    feedbackId: number;
  }

  // 我的反馈列表
  export interface ListRequest {
    page?: number;
    pageSize?: number;
  }

  export type ListResponse = PaginatedResponse<Feedback>;
}

/**
 * 草稿相关 API
 */
export namespace DraftAPI {
  // 保存草稿
  export interface SaveRequest {
    sectionId: number;
    title: string;
    content: string;
    images?: string[];
    extraFields?: Record<string, any>;
  }

  export interface SaveResponse {
    draftId: number;
  }

  // 我的草稿列表
  export type ListResponse = Draft[];
}

/**
 * AI 助手相关 API
 */
export namespace AIAPI {
  // 提问
  export interface AskRequest {
    question: string;
    conversationId?: string;
  }

  export interface AskResponse {
    answer: string;
    conversationId: string;
  }

  // 历史记录
  export interface HistoryRequest {
    page?: number;
    pageSize?: number;
  }

  export interface HistoryItem {
    id: number;
    question: string;
    answer: string;
    createdAt: string;
  }

  export type HistoryResponse = PaginatedResponse<HistoryItem>;
}

/**
 * 管理后台相关 API
 */
export namespace AdminAPI {
  // 用户管理 - 封禁
  export interface BanUserRequest {
    action: 'ban' | 'unban';
    reason?: string;
    duration?: string | number;
  }

  // 调整信誉分
  export interface AdjustReputationRequest {
    amount: number;
    reason: string;
  }

  // 内容审核
  export interface ReviewContentRequest {
    action: 'approve' | 'reject' | 'delete';
    reason?: string;
  }

  // 举报列表
  export interface ReportListRequest {
    status?: 'pending' | 'handled';
    page?: number;
    pageSize?: number;
  }

  export type ReportListResponse = PaginatedResponse<ReportWithDetails>;

  // 处理举报
  export interface HandleReportRequest {
    action: 'dismiss' | 'delete_content' | 'ban_user';
    reason?: string;
    banDuration?: number;
  }

  // 统计数据
  export interface StatsResponse {
    users: {
      total: number;
      today: number;
      active: number;
      banned: number;
    };
    posts: {
      total: number;
      today: number;
      hidden: number;
      deleted: number;
    };
    reports: {
      pending: number;
      handled: number;
      total: number;
    };
    system: {
      uptime: number;
      memoryUsage: number;
      cpuUsage: number;
    };
  }

  // 用户列表
  export interface UserListRequest {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: 'active' | 'banned';
    role?: 'user' | 'admin';
  }

  export type UserListResponse = PaginatedResponse<Omit<User, 'password'>>;

  // 操作日志
  export interface LogListRequest {
    page?: number;
    pageSize?: number;
    userId?: number;
    action?: string;
  }

  export interface LogItem {
    id: number;
    userId: number;
    userNickname: string;
    action: string;
    targetType: string | null;
    targetId: number | null;
    details: string | null;
    ip: string | null;
    createdAt: string;
  }

  export type LogListResponse = PaginatedResponse<LogItem>;
}

/**
 * 上传相关 API
 */
export namespace UploadAPI {
  export interface UploadResponse {
    url: string;
    filename: string;
    size: number;
  }
}

/**
 * Push 相关 API
 */
export namespace PushAPI {
  export interface SubscribeRequest {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }

  export interface PublicKeyResponse {
    publicKey: string | null;
  }
}

/**
 * WebSocket 消息类型
 */
export namespace WSMessage {
  // 客户端发送
  export interface ClientMessage {
    type: 'chat' | 'ping';
    peerId?: number;
    content?: string;
    clientMsgId?: string;
  }

  // 服务端发送
  export interface ServerMessage {
    type: 'chat' | 'ack' | 'pong' | 'notification';
    from?: number;
    content?: string;
    createdAt?: string;
    messageId?: number;
    clientMsgId?: string;
    notification?: Notification;
  }
}
