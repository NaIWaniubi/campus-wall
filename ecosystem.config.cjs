/**
 * PM2 进程守护配置（审计 quality P1-3）
 * 用法：npm run start:pm2（需全局或本地安装 pm2）
 */
module.exports = {
  apps: [
    {
      name: 'campus-wall',
      script: 'tsx',
      args: 'api/server.ts',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        // 关键项必须显式注入：api/config.ts 在 production 下对 JWT_SECRET 强校验
        // （缺失直接拒绝启动），DATA_DIR 决定 SQLite 落盘位置。
        // 用 .env.production.local 或部署平台环境变量提供，避免把密钥写进仓库。
        JWT_SECRET: process.env.JWT_SECRET || '',
        ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD || '',
        CORS_ORIGIN: process.env.CORS_ORIGIN || '',
        PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || '',
        PORT: process.env.PORT || '3001',
        DATA_DIR: process.env.DATA_DIR || './data',
        // R3 审查 P1：原先默认 '1' 让 PM2 直跑时信任任意 XFF，限流按攻击者自选 IP 分桶被完全绕过。
        // 空串保持 app.ts 的安全默认（trust proxy=false）；反代部署须显式设置跳数。
        TRUST_PROXY: process.env.TRUST_PROXY || '',
        WS_ENABLED: process.env.WS_ENABLED || '1',
      },
    },
  ],
};
