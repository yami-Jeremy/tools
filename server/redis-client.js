/**
 * Redis 客户端封装（移植自 item-inspector）
 * - DEV/UAT/GQC：直连，SSL，无密码
 * - PRD：通过 IDP HTTP API
 */

const tls = require('tls');
const net = require('net');
const https = require('https');
const http = require('http');

// ─── IDP Token 缓存 ───────────────────────────────────────────────
let _idpToken = null;
let _idpTokenExpiresAt = 0;

async function _getIdpToken(cfg) {
  if (_idpToken && Date.now() < _idpTokenExpiresAt) {
    return _idpToken;
  }
  const { idpBaseUrl, googleRefreshToken } = cfg;
  const url = `${idpBaseUrl}/api/auth/google/refresh?optional&scope=openid%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.profile&env=development`;

  const data = await _httpsGet(url, {
    'Accept': '*/*',
    'Origin': 'https://idp.yamibuy.net',
    'Referer': 'https://idp.yamibuy.net/',
    'x-requested-with': 'XMLHttpRequest',
    'site_code': 'us',
    'Cookie': `google-refresh-token=${googleRefreshToken}`,
  });

  let json;
  try {
    json = JSON.parse(data);
  } catch {
    throw new Error(`IDP 登录响应不是合法 JSON（REDIS_PRD_GOOGLE_REFRESH_TOKEN 可能无效或已过期），响应: ${data.slice(0, 200)}`);
  }
  if (!json.backstageIdentity || !json.backstageIdentity.token) {
    throw new Error('IDP 登录失败：未返回 token，请检查 .env 中 REDIS_PRD_GOOGLE_REFRESH_TOKEN 是否有效');
  }
  _idpToken = json.backstageIdentity.token;
  const expiresIn = (json.backstageIdentity.expiresInSeconds || 3600) - 60;
  _idpTokenExpiresAt = Date.now() + expiresIn * 1000;
  return _idpToken;
}

function _httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers,
      rejectUnauthorized: false,
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
  });
}

// ─── IDP Redis 查询 ───────────────────────────────────────────────
async function _idpRedisQuery(cfg, redisUrl, key) {
  const token = await _getIdpToken(cfg);

  // 先查 catalog 拿实际 redis_url
  const catalogUrl = `${cfg.idpBaseUrl}/api/catalog/entities/by-query?filter=kind%3DResource%2Cspec.type%3Dredis&fields=metadata.name%2Cspec.resource.url`;
  const catalogData = await _httpsGet(catalogUrl, {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const catalogJson = JSON.parse(catalogData);
  const items = catalogJson.items || [];

  // 匹配 redisUrl（如 "ec-item.redis.yamibuy.net:6380"）
  let targetUrl = redisUrl;
  if (!targetUrl) {
    throw new Error('redisUrl 参数不能为空');
  }

  // 调 IDP Redis 查询接口
  const queryUrl = `${cfg.idpBaseUrl}/api/redis-proxy/query`;
  const postData = JSON.stringify({ redis_url: targetUrl, key });

  return new Promise((resolve, reject) => {
    const urlObj = new URL(queryUrl);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`IDP redis-proxy 请求失败 (status=${res.statusCode})：${body ? body.slice(0, 200) : '空响应'}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ─── 直连 Redis（原始 RESP 协议）───────────────────────────────────
function _directRedisCommand(host, port, useTls, ...args) {
  return new Promise((resolve, reject) => {
    // 构建 RESP 命令
    let cmd = `*${args.length}\r\n`;
    for (const arg of args) {
      const s = String(arg);
      cmd += `$${Buffer.byteLength(s)}\r\n${s}\r\n`;
    }

    let buffer = '';
    let sock;

    const onConnect = () => {
      sock.write(cmd);
    };

    const onData = (data) => {
      buffer += data.toString();
      // 简单解析：等到收到完整响应
      try {
        const result = _parseResp(buffer);
        if (result !== undefined) {
          sock.destroy();
          resolve(result);
        }
      } catch (e) {
        // 继续等待数据
      }
    };

    const onError = (err) => {
      reject(err);
    };

    if (useTls) {
      sock = tls.connect({ host, port, rejectUnauthorized: false }, onConnect);
    } else {
      sock = net.createConnection({ host, port }, onConnect);
    }

    sock.setTimeout(8000);
    sock.on('data', onData);
    sock.on('error', onError);
    sock.on('timeout', () => {
      sock.destroy();
      reject(new Error('Redis 连接超时'));
    });
  });
}

function _parseResp(data) {
  if (!data) return undefined;
  const first = data[0];

  if (first === '+') {
    // 简单字符串
    const end = data.indexOf('\r\n');
    if (end === -1) return undefined;
    return data.slice(1, end);
  }
  if (first === '-') {
    // 错误
    const end = data.indexOf('\r\n');
    if (end === -1) return undefined;
    throw new Error(data.slice(1, end));
  }
  if (first === ':') {
    // 整数
    const end = data.indexOf('\r\n');
    if (end === -1) return undefined;
    return parseInt(data.slice(1, end), 10);
  }
  if (first === '$') {
    // 批量字符串
    const lenEnd = data.indexOf('\r\n');
    if (lenEnd === -1) return undefined;
    const len = parseInt(data.slice(1, lenEnd), 10);
    if (len === -1) return null; // nil
    const start = lenEnd + 2;
    if (data.length < start + len + 2) return undefined;
    return data.slice(start, start + len);
  }
  if (first === '*') {
    // 数组
    const lenEnd = data.indexOf('\r\n');
    if (lenEnd === -1) return undefined;
    const count = parseInt(data.slice(1, lenEnd), 10);
    if (count === -1) return null;
    const arr = [];
    let pos = lenEnd + 2;
    for (let i = 0; i < count; i++) {
      const sub = _parseResp(data.slice(pos));
      if (sub === undefined) return undefined;
      arr.push(sub);
      // 跳过已消费的内容（简化实现，只支持 bulk string 数组）
      if (data[pos] === '$') {
        const lEnd = data.indexOf('\r\n', pos);
        const l = parseInt(data.slice(pos + 1, lEnd), 10);
        pos = lEnd + 2 + l + 2;
      } else if (data[pos] === ':') {
        pos = data.indexOf('\r\n', pos) + 2;
      } else if (data[pos] === '+') {
        pos = data.indexOf('\r\n', pos) + 2;
      } else {
        break;
      }
    }
    return arr;
  }
  return undefined;
}

// ─── 对外暴露的接口 ───────────────────────────────────────────────

/**
 * GET 字符串 key
 */
async function redisGet(redisCfg, redisServiceUrl, key) {
  if (redisCfg.type === 'idp') {
    const result = await _idpRedisQuery(redisCfg, redisServiceUrl, key);
    if (result && result.error) throw new Error(result.error);
    return result.value !== undefined ? result.value : null;
  }
  return _directRedisCommand(redisCfg.host, redisCfg.port, redisCfg.tls, 'GET', key);
}

/**
 * HGET hash key field
 */
async function redisHGet(redisCfg, redisServiceUrl, key, field) {
  if (redisCfg.type === 'idp') {
    // IDP 模式下查 hash，先 GET 整个 key（IDP API 支持），然后取 field
    const result = await _idpRedisQuery(redisCfg, redisServiceUrl, key);
    if (result && result.error) throw new Error(result.error);
    if (result && result.value && typeof result.value === 'object') {
      return result.value[field] || null;
    }
    return null;
  }
  return _directRedisCommand(redisCfg.host, redisCfg.port, redisCfg.tls, 'HGET', key, field);
}

/**
 * HGETALL hash key
 */
async function redisHGetAll(redisCfg, redisServiceUrl, key) {
  if (redisCfg.type === 'idp') {
    const result = await _idpRedisQuery(redisCfg, redisServiceUrl, key);
    if (result && result.error) throw new Error(result.error);
    if (result && result.value) {
      return typeof result.value === 'object' ? result.value : JSON.parse(result.value);
    }
    return null;
  }
  const arr = await _directRedisCommand(redisCfg.host, redisCfg.port, redisCfg.tls, 'HGETALL', key);
  if (!arr || arr.length === 0) return null;
  const obj = {};
  for (let i = 0; i < arr.length; i += 2) {
    obj[arr[i]] = arr[i + 1];
  }
  return obj;
}

module.exports = { redisGet, redisHGet, redisHGetAll };
