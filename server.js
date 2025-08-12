const express = require('express')
const mysql = require('mysql2/promise')
const cors = require('cors')
const path = require('path')
require('dotenv').config()

const app = express()
const port = process.env.PORT || 3000

// 中间件
app.use(cors())
app.use(express.json())

// 从环境变量构建数据库配置
const buildDbConfig = (env) => {
  const prefix = env.toUpperCase()
  return {
    host: process.env[`${prefix}_DB_HOST`],
    port: parseInt(process.env[`${prefix}_DB_PORT`]) || 3306,
    user: process.env[`${prefix}_DB_USER`],
    password: process.env[`${prefix}_DB_PASSWORD`],
    database: process.env[`${prefix}_DB_NAME`],
    ssl: { rejectUnauthorized: false }
  }
}

// 多数据库环境配置
const dbEnvironments = {
  dev: buildDbConfig('dev'),
  gqc: buildDbConfig('gqc'),
  uat: buildDbConfig('uat'),
  prd: buildDbConfig('prd')
}

// 验证配置完整性
const validateConfig = () => {
  const errors = []
  for (const [env, config] of Object.entries(dbEnvironments)) {
    if (!config.host || !config.user || !config.password || !config.database) {
      errors.push(`${env} 环境配置不完整`)
    }
  }
  if (errors.length > 0) {
    console.error('❌ 数据库配置错误:', errors.join(', '))
    process.exit(1)
  }
}

// 启动时验证配置
validateConfig()

// 数据库连接池管理
const pools = {}

// 获取数据库连接池
const getPool = (env) => {
  if (!pools[env]) {
    const config = dbEnvironments[env]
    if (!config) {
      throw new Error(`未知的数据库环境: ${env}`)
    }
    pools[env] = mysql.createPool(config)
  }
  return pools[env]
}

// 测试指定环境的数据库连接
const testConnection = async (env) => {
  try {
    const pool = getPool(env)
    const connection = await pool.getConnection()
    connection.release()
    return { success: true, message: '连接成功' }
  } catch (error) {
    return { success: false, message: error.message }
  }
}

// 初始化默认环境连接
testConnection('gqc').then(result => {
  if (result.success) {
    console.log('✅ GQC环境数据库连接成功')
  } else {
    console.error('❌ GQC环境数据库连接失败:', result.message)
  }
})

// SKU查询API - 支持环境切换
app.post('/api/query-sku', async (req, res) => {
  const { sku, environment = 'gqc' } = req.body

  if (!sku) {
    return res.status(400).json({
      success: false,
      message: 'SKU参数不能为空'
    })
  }

  if (!dbEnvironments[environment]) {
    return res.status(400).json({
      success: false,
      message: '无效的数据库环境'
    })
  }
  console.log(environment);
  try {
    const pool = getPool(environment)
    const connection = await pool.getConnection()
    
    try {
      const [rows] = await connection.execute(
        'SELECT item_number, goods_id, seller_id FROM yamibuy_im.im_item WHERE item_number = ?',
        [sku]
      )

      if (rows.length === 0) {
        return res.json({
          success: false,
          message: '未找到该SKU的商品信息'
        })
      }

      res.json({
        success: true,
        data: rows[0],
        environment: environment
      })
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error(`[${environment}] 数据库查询错误:`, error)
    res.status(500).json({
      success: false,
      message: `数据库查询失败: ${error.message}`,
      environment: environment
    })
  }
})

// 通用数据库查询API - 支持环境切换
app.post('/api/query', async (req, res) => {
  const { sql, params = [], environment = 'gqc' } = req.body

  if (!sql) {
    return res.status(400).json({
      success: false,
      message: 'SQL语句不能为空'
    })
  }

  if (!dbEnvironments[environment]) {
    return res.status(400).json({
      success: false,
      message: '无效的数据库环境'
    })
  }

  try {
    const pool = getPool(environment)
    const connection = await pool.getConnection()
    
    try {
      const [rows] = await connection.execute(sql, params)
      res.json({
        success: true,
        data: rows,
        environment: environment
      })
    } finally {
      connection.release()
    }
  } catch (error) {
    console.error(`[${environment}] 数据库查询错误:`, error)
    res.status(500).json({
      success: false,
      message: `数据库查询失败: ${error.message}`,
      environment: environment
    })
  }
})

// 健康检查 - 支持环境切换
app.get('/api/health/:environment?', async (req, res) => {
  const environment = req.params.environment || 'gqc'
  
  if (!dbEnvironments[environment]) {
    return res.status(400).json({
      status: 'ERROR',
      message: '无效的数据库环境'
    })
  }

  try {
    const result = await testConnection(environment)
    res.json({ 
      status: result.success ? 'OK' : 'ERROR',
      timestamp: new Date().toISOString(),
      environment: environment,
      database: result.success ? 'Connected' : 'Disconnected',
      message: result.message
    })
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      environment: environment,
      database: 'Error',
      message: error.message
    })
  }
})

// 获取所有数据库环境状态
app.get('/api/environments/status', async (req, res) => {
  const status = {}
  
  for (const env of Object.keys(dbEnvironments)) {
    status[env] = await testConnection(env)
  }
  
  res.json(status)
})

// 开发环境下，将API请求代理到前端开发服务器
if (process.env.NODE_ENV === 'development') {
  app.use('/', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next()
    }
    // 非API请求转发到前端开发服务器
    res.redirect('http://localhost:5173' + req.path)
  })
} else {
  // 生产环境下，提供静态文件服务
  app.use(express.static(path.join(__dirname, 'dist')))
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`🚀 后端服务器运行在端口 ${port}`)
  console.log(`📊 健康检查: http://localhost:${port}/api/health`)
  if (process.env.NODE_ENV === 'development') {
    console.log(`🌐 前端开发服务器: http://localhost:5173`)
  }
})
