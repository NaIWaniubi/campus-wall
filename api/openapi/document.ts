/**
 * OpenAPI 3.1 文档组装（spec-C T7 裁剪版）
 * - 组件 schema 由 zod 经 z.toJSONSchema 生成（零依赖，zod v4 内置）
 * - 统一响应包络：{ code: 200, message: string, data: <payload> }
 * - 覆盖 auth / posts / conversations / drafts 四个高频域；其余域按需补录
 * - 消费方：GET /api/openapi.json（机器）+ GET /api/docs（Swagger UI，CDN 静态页）
 */
import { z } from 'zod';
import type { ZodType } from 'zod';
import {
  AuthSession, LoginBody, RegisterBody, PasswordBody, UserSchema,
  PostBody, PostListData, PostDetailData, PostListQuery,
  ConversationItem, ConversationCreateBody, ChatMessageListData, ChatSendBody, PageQuery,
  DraftBody, DraftItem, DraftSaved,
  PushSubscribeBody, PushUnsubscribeBody,
} from './schemas.js';

type JsonSchema = Record<string, unknown>;

/** zod → JSON Schema（input 口径：.optional() 保留非必填语义） */
function jsonSchema(schema: ZodType): JsonSchema {
  const out = z.toJSONSchema(schema, { io: 'input' }) as JsonSchema;
  delete out.$schema; // OpenAPI 3.1 组件内不需要顶层 $schema
  return out;
}

/** 统一响应包络 */
function envelope(data: JsonSchema | undefined): JsonSchema {
  return {
    type: 'object',
    properties: {
      code: { type: 'integer', const: 200 },
      message: { type: 'string' },
      ...(data ? { data } : {}),
    },
    required: data ? ['code', 'message', 'data'] : ['code', 'message'],
  };
}

function ok(data?: JsonSchema) {
  return {
    description: '成功',
    content: { 'application/json': { schema: envelope(data) } },
  };
}

function body(schema: ZodType) {
  return { required: true, content: { 'application/json': { schema: jsonSchema(schema) } } };
}

/** 组件注册表：注册后返回 $ref 引用 */
const components: Record<string, JsonSchema> = {};
function ref(name: string, schema: ZodType): JsonSchema {
  if (!components[name]) components[name] = jsonSchema(schema);
  return { $ref: `#/components/schemas/${name}` };
}

export function buildOpenApiDocument() {
  components.User = jsonSchema(UserSchema);
  components.AuthSession = {
    ...jsonSchema(AuthSession),
    properties: {
      ...((jsonSchema(AuthSession).properties ?? {}) as Record<string, JsonSchema>),
      user: ref('User', UserSchema),
    },
  };

  const paths = {
    /* ---------- auth ---------- */
    '/api/auth/login': {
      post: {
        summary: '学号密码登录',
        tags: ['auth'],
        requestBody: body(LoginBody),
        responses: { 200: ok(ref('AuthSession', AuthSession)) },
      },
    },
    '/api/auth/register': {
      post: {
        summary: '注册（密码 ≥6 位）',
        tags: ['auth'],
        requestBody: body(RegisterBody),
        responses: { 200: ok(ref('AuthSession', AuthSession)) },
      },
    },
    '/api/auth/me': {
      get: { summary: '当前登录用户', tags: ['auth'], responses: { 200: ok(ref('User', UserSchema)) } },
    },
    '/api/auth/password': {
      put: {
        summary: '修改密码',
        tags: ['auth'],
        requestBody: body(PasswordBody),
        responses: { 200: ok() },
      },
    },

    /* ---------- posts ---------- */
    '/api/posts': {
      get: {
        summary: '帖子列表（分页/板块/排序/关键词）',
        tags: ['posts'],
        parameters: [{ in: 'query', name: '查询参数', schema: jsonSchema(PostListQuery) }],
        responses: { 200: ok(jsonSchema(PostListData)) },
      },
      post: {
        summary: '发布帖子（敏感词分级：硬词转人工审核）',
        tags: ['posts'],
        requestBody: body(PostBody),
        responses: { 200: ok({ type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] }) },
      },
    },
    '/api/posts/{id}': {
      get: {
        summary: '帖子详情',
        tags: ['posts'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: ok(jsonSchema(PostDetailData)), 404: { description: '帖子不存在' } },
      },
      put: {
        summary: '编辑帖子（服务端 24h 窗口校验）',
        tags: ['posts'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: body(PostBody),
        responses: { 200: ok() },
      },
    },

    '/api/posts/{id}/similars': {
      get: {
        summary: '详情页相关推荐（高文本相似优先，同板块兜底）',
        tags: ['posts'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: {
          200: ok({
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                title: { type: 'string' },
                sectionName: { type: 'string' },
                likeCount: { type: 'integer' },
              },
              required: ['id', 'title', 'sectionName', 'likeCount'],
            },
          }),
          404: { description: '帖子不存在或当前用户不可见' },
        },
      },
    },

    '/api/ai/digest': {
      get: {
        summary: '今日简报（默认公开全站版；scope=personal 需登录）',
        tags: ['ai'],
        parameters: [
          {
            in: 'query',
            name: 'scope',
            required: false,
            schema: { type: 'string', enum: ['personal'] },
          },
        ],
        responses: {
          200: ok({
            type: 'object',
            properties: {
              date: { type: 'string' },
              window: { type: 'string' },
              scope: { type: 'string', enum: ['personal'] },
              stats: {
                type: 'object',
                properties: { posts: { type: 'integer' }, comments: { type: 'integer' } },
                required: ['posts', 'comments'],
              },
              sections: { type: 'array', items: { type: 'object' } },
              hot: { type: ['object', 'null'] },
              summary: { type: 'string' },
              tip: { type: 'string' },
              offline: { type: 'boolean' },
            },
          }),
          401: { description: 'personal 路径未登录或登录已失效' },
        },
      },
    },

    /* ---------- conversations ---------- */
    '/api/conversations': {
      get: {
        summary: '我的会话列表（按最近活跃倒序）',
        tags: ['conversations'],
        responses: { 200: ok({ type: 'array', items: ref('ConversationItem', ConversationItem) }) },
      },
      post: {
        summary: '创建/复用与某用户的会话（幂等）',
        tags: ['conversations'],
        requestBody: body(ConversationCreateBody),
        responses: { 200: ok({ type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] }) },
      },
    },
    '/api/conversations/{id}/messages': {
      get: {
        summary: '会话消息分页（支持 ?afterId= 增量拉取，WS 重连补拉用）',
        tags: ['conversations'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'integer' } },
          { in: 'query', name: '查询参数（page/pageSize/afterId）', schema: jsonSchema(PageQuery.extend({ afterId: z.coerce.number().int().nonnegative().optional() })) },
        ],
        responses: { 200: ok(jsonSchema(ChatMessageListData)) },
      },
      post: {
        summary: '发送私信（≤500 字；同时经 WS 双路推送，REST 永远兜底）',
        tags: ['conversations'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: body(ChatSendBody),
        responses: { 200: ok({ type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] }) },
      },
    },

    /* ---------- drafts ---------- */
    '/api/drafts': {
      get: {
        summary: '云草稿列表（最近 10 条，跨设备可见）',
        tags: ['drafts'],
        responses: { 200: ok({ type: 'array', items: ref('DraftItem', DraftItem) }) },
      },
      post: {
        summary: '新建云草稿（总数达 10 条自动挤掉最早一条）',
        tags: ['drafts'],
        requestBody: body(DraftBody),
        responses: { 200: ok(ref('DraftSaved', DraftSaved)) },
      },
      put: {
        summary: '更新已有草稿（PUT /api/drafts?id=123——编辑必须走 PUT，POST 会新建挤占上限）',
        tags: ['drafts'],
        parameters: [{ in: 'query', name: 'id', required: true, schema: { type: 'integer' } }],
        requestBody: body(DraftBody),
        responses: { 200: ok(ref('DraftSaved', DraftSaved)) },
      },
      delete: { summary: '清空我的全部草稿', tags: ['drafts'], responses: { 200: ok() } },
    },
    '/api/drafts/{id}': {
      delete: {
        summary: '删除单条草稿',
        tags: ['drafts'],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'integer' } }],
        responses: { 200: ok() },
      },
    },

    /* ---------- push（Web Push 订阅，V5） ---------- */
    '/api/push/public-key': {
      get: {
        summary: 'VAPID 公钥（匿名可查；enabled=false 时客户端自动隐藏推送入口）',
        tags: ['push'],
        responses: { 200: ok({ type: 'object', properties: { publicKey: { type: ['string', 'null'] }, enabled: { type: 'boolean' } }, required: ['publicKey', 'enabled'] }) },
      },
    },
    '/api/push/subscribe': {
      post: {
        summary: '落库浏览器推送订阅（需登录；同 endpoint 再授权视为刷新归属与 keys）',
        tags: ['push'],
        requestBody: body(PushSubscribeBody),
        responses: { 200: ok(), 501: { description: '服务端未配置 VAPID，推送未开启' } },
      },
    },
    '/api/push/unsubscribe': {
      post: {
        summary: '按 endpoint 退订并删除订阅（需登录）',
        tags: ['push'],
        requestBody: body(PushUnsubscribeBody),
        responses: { 200: ok() },
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: '校园墙 API',
      version: '5.0.0',
      description: '契约文档（裁剪版：auth/posts/conversations/drafts/push 五域）。zod schema 为唯一契约源。',
    },
    paths,
    components: { schemas: components },
  };
}

/** Swagger UI 静态页（CDN 引入，零依赖挂载） */
export function swaggerHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>校园墙 API 文档</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.addEventListener('load', function () {
        window.SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger', docExpansion: 'none' })
      })
    </script>
  </body>
</html>`;
}
