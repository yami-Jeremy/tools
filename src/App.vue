<template>
  <div class="app-container">
    <div class="menu">
      <!-- 数据库环境选择器 -->
      <div class="db-selector">
        <h3>数据库环境</h3>
        <el-select 
          v-model="currentDb" 
          placeholder="选择数据库环境"
          size="small"
          @change="handleDbChange"
        >
          <el-option
            v-for="db in dbEnvironments"
            :key="db.value"
            :label="db.label"
            :value="db.value"
          />
        </el-select>
      </div>
      
      <div class="menu-links">
        <router-link to="/" class="menu-item">首页</router-link>
        <router-link to="/timestamp" class="menu-item">时间戳转换</router-link>
        <router-link to="/json" class="menu-item">JSON格式化</router-link>
        <router-link to="/docs" class="menu-item">业务文档</router-link>
        <router-link to="/database" class="menu-item">数据库文档</router-link>
        <router-link to="/im_detail" class="menu-item">商品信息查询</router-link>
      </div>
    </div>
    <div class="content">
      <router-view :current-db="currentDb" />
    </div>
  </div>
</template>

<script>
import { ref, provide } from 'vue'
import { ElMessage } from 'element-plus'

export default {
  name: 'App',
  setup() {
    const currentDb = ref('gqc')
    
    const dbEnvironments = [
      { label: 'DEV', value: 'dev' },
      { label: 'GQC', value: 'gqc' },
      { label: 'UAT', value: 'uat' },
      { label: 'PRD', value: 'prd' }
    ]

    const handleDbChange = (value) => {
      currentDb.value = value
      ElMessage.success(`已切换到${dbEnvironments.find(db => db.value === value)?.label}`)
    }

    // 提供给子组件使用
    provide('currentDb', currentDb)

    return {
      currentDb,
      dbEnvironments,
      handleDbChange
    }
  }
}
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
}

.menu {
  width: 200px;
  background-color: #f5f5f5;
  padding: 20px;
  border-right: 1px solid #ddd;
  display: flex;
  flex-direction: column;
}

.db-selector {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #ddd;
}

.db-selector h3 {
  margin: 0 0 15px 0;
  font-size: 14px;
  color: #606266;
  text-align: center;
}

.menu-links {
  flex: 1;
}

.menu-item {
  display: block;
  padding: 10px;
  color: #333;
  text-decoration: none;
  margin-bottom: 5px;
  border-radius: 4px;
}

.menu-item:hover {
  background-color: #e0e0e0;
}

.menu-item.router-link-active {
  background-color: #1890ff;
  color: white;
}

.content {
  flex: 1;
  padding: 20px;
}
</style> 