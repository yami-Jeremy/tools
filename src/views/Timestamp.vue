<template>
  <div class="timestamp">
    <h2>时间戳转换</h2>
    
    <!-- 提示消息 -->
    <div v-if="showTip" class="tip-message">
      复制成功
    </div>
    
    <!-- 实时时间戳 -->
    <div class="timestamp-row">
      <span class="timestamp-value">{{ currentTimestamp }}</span>
      <button @click="copyTimestamp" class="copy-btn">复制</button>
    </div>

    <!-- 实时时间 -->
    <div class="timestamp-row">
      <span class="timestamp-value">{{ currentDateTime }}</span>
      <button @click="copyDateTime" class="copy-btn">复制</button>
    </div>

    <!-- 时间戳转日期 -->
    <div class="timestamp-row" style="margin-top: 50px;">
      <input 
        v-model="timestampInput" 
        type="number" 
        placeholder="请输入时间戳"
        class="timestamp-input"
      >
      <button @click="convertToDate" class="convert-btn">转成日期</button>
      <span v-if="convertedDate" class="result">{{ convertedDate }}</span>
    </div>

    <!-- 日期转时间戳 -->
    <div class="timestamp-row">
      <input 
        v-model="dateInput" 
        type="text" 
        placeholder="请输入日期 (格式: 2025-05-17 06:57:09)"
        class="date-input"
      >
      <button @click="convertToTimestamp" class="convert-btn">转时间戳</button>
      <span v-if="convertedTimestamp" class="result">{{ convertedTimestamp }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// 实时时间戳
const currentTimestamp = ref(Math.floor(Date.now() / 1000))
// 添加实时时间
const currentDateTime = ref('')
let timer = null

// 时间戳转日期
const timestampInput = ref('')
const convertedDate = ref('')

// 日期转时间戳
const dateInput = ref('')
const convertedTimestamp = ref('')

// 添加提示状态
const showTip = ref(false)
let tipTimer = null

// 更新实时时间戳和时间
const updateTimestamp = () => {
  const now = new Date()
  currentTimestamp.value = Math.floor(now.getTime() / 1000)
  currentDateTime.value = now.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/\//g, '-')
}

// 复制时间戳
const copyTimestamp = () => {
  navigator.clipboard.writeText(currentTimestamp.value.toString())
    .then(() => {
      showTip.value = true
      if (tipTimer) clearTimeout(tipTimer)
      tipTimer = setTimeout(() => {
        showTip.value = false
      }, 2000)
    })
    .catch(err => {
      console.error('复制失败:', err)
    })
}

// 添加复制日期时间函数
const copyDateTime = () => {
  navigator.clipboard.writeText(currentDateTime.value)
    .then(() => {
      showTip.value = true
      if (tipTimer) clearTimeout(tipTimer)
      tipTimer = setTimeout(() => {
        showTip.value = false
      }, 2000)
    })
    .catch(err => {
      console.error('复制失败:', err)
    })
}

// 时间戳转日期
const convertToDate = () => {
  if (!timestampInput.value) return
  const date = new Date(Number(timestampInput.value) * 1000)
  convertedDate.value = date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/\//g, '-')
}

// 日期转时间戳
const convertToTimestamp = () => {
  if (!dateInput.value) return
  const date = new Date(dateInput.value)
  if (isNaN(date.getTime())) {
    alert('请输入正确的日期格式！')
    return
  }
  convertedTimestamp.value = Math.floor(date.getTime() / 1000)
}

// 组件挂载时启动定时器
onMounted(() => {
  timer = setInterval(updateTimestamp, 1000)
})

// 组件卸载时清除所有定时器
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (tipTimer) clearTimeout(tipTimer)
})
</script>

<style scoped>
.timestamp {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.timestamp-row {
  margin: 20px 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.timestamp-value {
  font-size: 1.3em;
  font-family: monospace;
  width: 218px;
  display: inline-block;
}

.timestamp-input,
.date-input {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  width: 200px;
}

.copy-btn,
.convert-btn {
  padding: 8px 16px;
  background-color: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
  white-space: nowrap;
}

.copy-btn:hover,
.convert-btn:hover {
  background-color: #45a049;
}

.result {
  margin-left: 10px;
  font-family: monospace;
  width: 200px;
  display: inline-block;
  font-size: 1.5em;  /* 新增这一行来增大字体 */
}

/* 添加提示样式 */
.tip-message {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  animation: fadeInOut 2s ease-in-out;
  z-index: 1000;
}

@keyframes fadeInOut {
  0% {
    opacity: 0;
    transform: translate(-50%, -20px);
  }
  15% {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  85% {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -20px);
  }
}
</style> 