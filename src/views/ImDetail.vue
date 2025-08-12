<template>
  <div class="po-param-container">
    <!-- 添加当前环境显示 -->
    <div class="env-display">
      <el-alert
        :title="`当前数据库环境: ${getEnvDisplayName(currentDb)}`"
        :type="getEnvTagType(currentDb)"
        show-icon
        :closable="false"
      />
    </div>

    <div class="search-section">
      <h2>商品信息查询</h2>
      <div class="search-form">
        <el-input
          v-model="skuInput"
          placeholder="请输入SKU编号"
          class="sku-input"
          clearable
          @keyup.enter="handleSearch"
        >
          <template #prepend>SKU</template>
        </el-input>
        <el-button 
          type="primary" 
          @click="handleSearch"
          :loading="loading"
          class="search-btn"
        >
          查询
        </el-button>
      </div>

    </div>

    <div class="result-section" v-if="searchResult">
      <h3>查询结果</h3>
      <div class="result-content">
        <div 
          v-for="(value, key) in searchResult" 
          :key="key" 
          class="result-item"
        >
          <span class="field-name">{{ getFieldDisplayName(key) }}:</span>
          <span class="field-value">{{ value }}</span>
        </div>
      </div>
    </div>

    <div class="error-section" v-if="errorMessage">
      <el-alert
        :title="errorMessage"
        type="error"
        show-icon
        :closable="false"
      />
    </div>

    <!-- 数据库连接状态 -->
    <div class="status-section">
      <el-tag 
        :type="dbStatus === 'connected' ? 'success' : 'danger'"
        size="small"
      >
        数据库: {{ dbStatus === 'connected' ? '已连接' : '未连接' }}
      </el-tag>
    </div>
  </div>
</template>

<script>
import { ref, onMounted, inject, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'

export default {
  name: 'PoParam',
  props: {
    currentDb: {
      type: String,
      default: 'gqc'
    }
  },
  setup(props) {
    const skuInput = ref('')
    const searchResult = ref(null)
    const loading = ref(false)
    const errorMessage = ref('')
    const dbStatus = ref('unknown')

    // 从 provide 获取 currentDb
    const injectedCurrentDb = inject('currentDb', null)
    
    // 使用计算属性来获取当前环境，优先使用注入的值
    const actualCurrentDb = computed(() => {
      if (injectedCurrentDb && injectedCurrentDb.value) {
        return injectedCurrentDb.value
      }
      return props.currentDb
    })

    // 调试信息：在控制台输出当前环境
    console.log('=== ImDetail 组件调试信息 ===')
    console.log('Props currentDb:', props.currentDb)
    console.log('Injected currentDb ref:', injectedCurrentDb)
    console.log('Injected currentDb value:', injectedCurrentDb?.value)
    console.log('Computed actualCurrentDb:', actualCurrentDb.value)
    console.log('========================')

    // 字段显示名称映射
    const fieldDisplayNames = {
      item_number: '商品编号',
      goods_id: '商品ID',
      seller_id: '卖家ID'
    }

    const getFieldDisplayName = (key) => {
      return fieldDisplayNames[key] || key
    }

    // 环境显示名称映射
    const envDisplayNames = {
      dev: 'DEV',
      gqc: 'GQC',
      uat: 'UAT',
      prd: 'PRD'
    }

    const getEnvDisplayName = (env) => {
      return envDisplayNames[env] || env
    }

    // 环境标签类型映射
    const getEnvTagType = (env) => {
      const types = {
        dev: 'info',
        gqc: 'warning',
        uat: 'success',
        prd: 'danger'
      }
      return types[env] || 'info'
    }

    // 检查数据库连接状态
    const checkDbStatus = async () => {
      try {
        console.log('检查数据库状态 - 当前环境:', actualCurrentDb.value)
        const response = await fetch(`/api/health/${actualCurrentDb.value}`)
        const data = await response.json()
        dbStatus.value = data.status === 'OK' ? 'connected' : 'disconnected'
        console.log('数据库状态检查结果:', data)
      } catch (error) {
        console.error('数据库状态检查失败:', error)
        dbStatus.value = 'disconnected'
      }
    }

    const handleSearch = async () => {
      if (!skuInput.value.trim()) {
        ElMessage.warning('请输入SKU编号')
        return
      }

      loading.value = true
      errorMessage.value = ''
      searchResult.value = null

      // 调试信息：输出接口调用时的环境参数
      console.log('=== 接口调用调试信息 ===')
      console.log('当前环境值:', actualCurrentDb.value)
      console.log('SKU输入:', skuInput.value.trim())
      console.log('完整请求参数:', {
        sku: skuInput.value.trim(),
        environment: actualCurrentDb.value
      })
      console.log('========================')

      try {
        const response = await fetch('/api/query-sku', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sku: skuInput.value.trim(),
            environment: actualCurrentDb.value
          })
        })

        const data = await response.json()

        if (response.ok) {
          if (data.success) {
            searchResult.value = data.data
            ElMessage.success(`查询成功 (${getEnvDisplayName(actualCurrentDb.value)})`)
          } else {
            errorMessage.value = data.message || '查询失败'
          }
        } else {
          errorMessage.value = '网络请求失败'
        }
      } catch (error) {
        console.error('查询错误:', error)
        errorMessage.value = '查询出错，请稍后重试'
      } finally {
        loading.value = false
      }
    }

    // 监听环境变化
    watch(actualCurrentDb, (newEnv, oldEnv) => {
      console.log('=== 环境变化监听 ===')
      console.log('环境从', oldEnv, '变为', newEnv)
      console.log('重新检查数据库状态...')
      console.log('====================')
      checkDbStatus()
    }, { immediate: true })

    onMounted(() => {
      console.log('=== ImDetail 组件挂载 ===')
      console.log('挂载时的环境值:', actualCurrentDb.value)
      console.log('=======================')
    })

    return {
      skuInput,
      searchResult,
      loading,
      errorMessage,
      dbStatus,
      currentDb: actualCurrentDb, // 使用计算属性
      getFieldDisplayName,
      getEnvDisplayName,
      getEnvTagType,
      handleSearch
    }
  }
}
</script>

<style scoped>
.po-param-container {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.search-section {
  background: #f5f7fa;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.search-section h2 {
  margin: 0 0 20px 0;
  color: #303133;
  text-align: center;
}

.search-form {
  display: flex;
  gap: 15px;
  align-items: center;
  justify-content: center;
  margin-bottom: 15px;
}

.sku-input {
  width: 300px;
}

.search-btn {
  min-width: 80px;
}

.current-env {
  text-align: center;
}

.result-section {
  background: white;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
}

.result-section h3 {
  margin: 0 0 20px 0;
  color: #303133;
  border-bottom: 2px solid #409eff;
  padding-bottom: 10px;
}

.result-content {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.result-item {
  display: flex;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
  border-left: 4px solid #409eff;
}

.field-name {
  font-weight: 600;
  color: #606266;
  min-width: 120px;
  margin-right: 15px;
}

.field-value {
  color: #303133;
  flex: 1;
}

.error-section {
  margin-top: 20px;
}

.status-section {
  text-align: center;
  margin-top: 20px;
}

.env-display {
  margin-bottom: 20px;
}

@media (max-width: 768px) {
  .search-form {
    flex-direction: column;
    align-items: stretch;
  }
  
  .sku-input {
    width: 100%;
  }
  
  .result-item {
    flex-direction: column;
    gap: 8px;
  }
  
  .field-name {
    min-width: auto;
    margin-right: 0;
  }
}
</style>
