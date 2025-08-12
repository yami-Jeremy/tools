<template>
  <div class="database-page">
    <div class="sql-section">
      <!-- 增加数据 -->
      <div class="sql-example">
        <h3>1. INSERT</h3>
        <div class="code-block">
          <pre><code>INSERT INTO users (name, email, age) VALUES ('张三', 'zhangsan@example.com', 25);</code></pre>
        </div>
      </div>

      <!-- 查询数据 -->
      <div class="sql-example">
        <h3>2. SELECT</h3>
        <div class="code-block">
          <pre><code>SELECT name, email FROM users WHERE age > 20 ORDER BY age DESC;</code></pre>
        </div>
      </div>

      <!-- 更新数据 -->
      <div class="sql-example">
        <h3>3. UPDATE</h3>
        <div class="code-block">
          <pre><code>UPDATE users SET age = 26, email = 'newemail@example.com' WHERE name = '张三';</code></pre>
        </div>
      </div>

      <!-- 删除数据 -->
      <div class="sql-example">
        <h3>4. DELETE</h3>
        <div class="code-block">
          <pre><code>DELETE FROM users WHERE name = '张三';</code></pre>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Database',
  data() {
    return {
      // 可以在这里添加更多数据
    }
  }
}
</script>

<style scoped>
.database-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

h1 {
  color: #2c3e50;
  text-align: center;
  margin-bottom: 30px;
  border-bottom: 3px solid #3498db;
  padding-bottom: 10px;
}

h2 {
  color: #34495e;
  margin-bottom: 25px;
  font-size: 1.8em;
}

.sql-section {
  background: #f8f9fa;
  padding: 25px;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.sql-example {
  padding: 10px;
  background: white;
}

h3 {
  color: #2980b9;
  margin-bottom: 15px;
  font-size: 1.3em;
}

.code-block {
  background: #2d3748;
  color: #e2e8f0;
  padding: 15px;
  border-radius: 6px;
  margin: 15px 0;
  overflow-x: auto;
}

.code-block pre {
  margin: 0;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.4;
}

.description {
  color: #666;
  font-style: italic;
  margin-top: 10px;
  font-size: 14px;
}
</style>
