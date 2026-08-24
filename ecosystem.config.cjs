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
      },
    },
  ],
};
