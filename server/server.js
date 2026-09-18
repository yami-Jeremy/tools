/**
 * 工具集合 - 本地 Node.js 服务端（单进程，含静态页面 + API）
 * 启动: node server/server.js
 * 访问: http://localhost:3000
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { dbEnvironments, validateConfig } = require('./config');
const { queryItemBasicInfo, queryRedisPriceCache, queryRedisItemCache } = require('./query');

const PORT = process.env.PORT || 3000;

validateConfig();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── MySQL 连接池管理（健康检查用，商品查询走 query.js 自己的连接池）──
const pools = {};

function getPool(env) {
  if (!pools[env]) {
    pools[env] = mysql.createPool({ ...dbEnvironments[env].mysql, connectionLimit: 5, connectTimeout: 10000 });
  }
  return pools[env];
}

async function testConnection(env) {
  try {
    const pool = getPool(env);
    const connection = await pool.getConnection();
    connection.release();
    return { success: true, message: '连接成功' };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

// ─── API: 环境列表 ───────────────────────────────────────────────
app.get('/api/envs', (req, res) => {
  res.json(Object.entries(dbEnvironments).map(([key, cfg]) => ({ key, label: cfg.label })));
});

// ─── API: 商品信息查询（DB + Redis 价格/商品缓存）─────────────────
app.post('/api/query', async (req, res) => {
  const { env, item_number, zipcode } = req.body;

  if (!env || !item_number) {
    return res.status(400).json({ error: '缺少 env 或 item_number 参数' });
  }
  if (!dbEnvironments[env]) {
    return res.status(400).json({ error: `未知环境: ${env}` });
  }
  if (!/^\d{10}$/.test(String(item_number).trim())) {
    return res.status(400).json({ error: 'item_number 格式错误，应为 10 位数字' });
  }

  const cfg = dbEnvironments[env];
  const itemNum = String(item_number).trim();
  // zipcode 清理：只保留数字和字母，最长 10 位
  const zipcodeClean = zipcode ? String(zipcode).trim().replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) : '';

  try {
    const [dbResult, redisPriceCache, redisItemCache] = await Promise.allSettled([
      queryItemBasicInfo(cfg.mysql, itemNum, zipcodeClean || undefined),
      queryRedisPriceCache(cfg.redis, itemNum),
      queryRedisItemCache(cfg.redis, itemNum),
    ]);

    res.json({
      env,
      item_number: itemNum,
      zipcode: zipcodeClean || null,
      db: dbResult.status === 'fulfilled' ? dbResult.value : { error: dbResult.reason?.message },
      redis_price_cache: redisPriceCache.status === 'fulfilled' ? redisPriceCache.value : { error: redisPriceCache.reason?.message },
      redis_item_cache: redisItemCache.status === 'fulfilled' ? redisItemCache.value : { error: redisItemCache.reason?.message },
      queried_at: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: 健康检查 ───────────────────────────────────────────────
app.get('/api/health/:environment?', async (req, res) => {
  const environment = req.params.environment || 'gqc';
  if (!dbEnvironments[environment]) {
    return res.status(400).json({ status: 'ERROR', message: '无效的数据库环境' });
  }

  const result = await testConnection(environment);
  res.json({
    status: result.success ? 'OK' : 'ERROR',
    timestamp: new Date().toISOString(),
    environment,
    database: result.success ? 'Connected' : 'Disconnected',
    message: result.message,
  });
});

// ─── API: 所有环境状态 ────────────────────────────────────────────
app.get('/api/environments/status', async (req, res) => {
  const status = {};
  for (const env of Object.keys(dbEnvironments)) {
    status[env] = await testConnection(env);
  }
  res.json(status);
});

app.listen(PORT, () => {
  console.log(`\n✅ 工具集合已启动`);
  console.log(`   访问地址: http://localhost:${PORT}`);
  console.log(`   支持环境: ${Object.values(dbEnvironments).map(c => c.label).join(' / ')}\n`);
});
