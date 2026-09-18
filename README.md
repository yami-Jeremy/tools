# 工具集合项目

单 Node 进程：原生 HTML/JS 静态页面（`public/index.html`）+ Express API（`server/server.js`），无需构建步骤。

## 启动项目

### 1. 安装依赖
```bash
npm install
```

### 2. 配置环境变量
在项目根目录 `.env` 中配置 `DEV/UAT/GQC/PRD_DB_HOST/PORT/USER/PASSWORD/NAME`。

### 3. 启动
```bash
npm start
```

访问 http://localhost:3000

开发时可用 `npm run dev`（nodemon 自动重启，修改 `public/index.html` 直接刷新浏览器即可，无需重启）。
