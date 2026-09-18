/**
 * 各环境连接配置
 * MySQL 密码等敏感信息从环境变量读取（见 .env），不做任何硬编码兜底
 * Redis 主机名/IDP 地址不是密钥，直接写常量；PRD Redis 走 IDP 的 google refresh token 从环境变量读取
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

function buildMysqlConfig(prefix) {
  return {
    host: process.env[`${prefix}_DB_HOST`],
    port: parseInt(process.env[`${prefix}_DB_PORT`], 10) || 3306,
    user: process.env[`${prefix}_DB_USER`],
    password: process.env[`${prefix}_DB_PASSWORD`],
    database: process.env[`${prefix}_DB_NAME`],
    ssl: { rejectUnauthorized: false },
  };
}

const dbEnvironments = {
  dev: {
    label: 'DEV',
    mysql: buildMysqlConfig('DEV'),
    redis: { type: 'direct', host: 'dev-serverless-redis.yamibuy.tech', port: 6379, tls: true },
  },
  uat: {
    label: 'UAT',
    mysql: buildMysqlConfig('UAT'),
    redis: { type: 'direct', host: 'uat-serverless-redis.yamibuy.tech', port: 6379, tls: true },
  },
  gqc: {
    label: 'GQC',
    mysql: buildMysqlConfig('GQC'),
    redis: { type: 'direct', host: 'gqc-serverless-redis.yamibuy.tech', port: 6379, tls: true },
  },
  prd: {
    label: 'PRD',
    mysql: buildMysqlConfig('PRD'),
    // PRD Redis 通过 IDP HTTP API 查询，不直连
    redis: {
      type: 'idp',
      idpBaseUrl: 'https://idp.yamibuy.net:7007',
      googleRefreshToken: process.env.REDIS_PRD_GOOGLE_REFRESH_TOKEN || '',
    },
  },
};

function validateConfig() {
  const errors = [];
  for (const [env, cfg] of Object.entries(dbEnvironments)) {
    const m = cfg.mysql;
    if (!m.host || !m.user || !m.password || !m.database) {
      errors.push(`${env} 环境 MySQL 配置不完整，请检查 .env 中 ${env.toUpperCase()}_DB_* 变量`);
    }
  }
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }
}

module.exports = { dbEnvironments, validateConfig };
