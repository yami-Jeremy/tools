<template>
  <div class="json">
    <h2>JSON格式化工具</h2>
    
    <div class="json-container">
      <div class="input-section">
        <label for="json-input">输入JSON文本：</label>
        <textarea
          id="json-input"
          v-model="jsonInput"
          placeholder="请输入要格式化的JSON文本..."
          class="json-textarea"
        ></textarea>
      </div>
      
      <div class="button-group">
        <button @click="formatJson" class="btn btn-primary">
          格式化
        </button>
        <button @click="compressJson" class="btn btn-secondary">
          压缩
        </button>
        <button @click="clearInput" class="btn btn-clear">
          清空
        </button>
      </div>
      
      <div class="output-section" v-if="jsonOutput">
        <label>处理结果：</label>
        <textarea
          :value="jsonOutput"
          readonly
          class="json-textarea output-textarea"
        ></textarea>
        <button @click="copyToClipboard" class="btn btn-copy">
          复制结果
        </button>
      </div>
    </div>
    
    <!-- Toast提示组件 -->
    <div v-if="showToast" class="toast" :class="{ 'toast-show': showToast }">
      {{ toastMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const jsonInput = ref('')
const jsonOutput = ref('')
const showToast = ref(false)
const toastMessage = ref('')

// 显示Toast提示
const showToastMessage = (message) => {
  toastMessage.value = message
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 2000)
}

// 格式化JSON
const formatJson = () => {
  try {
    if (!jsonInput.value.trim()) {
      showToastMessage('请输入JSON文本')
      return
    }
    
    const parsed = JSON.parse(jsonInput.value)
    jsonOutput.value = JSON.stringify(parsed, null, 2)
  } catch (error) {
    showToastMessage('无效的JSON格式：' + error.message)
  }
}

// 压缩JSON
const compressJson = () => {
  try {
    if (!jsonInput.value.trim()) {
      showToastMessage('请输入JSON文本')
      return
    }
    
    const parsed = JSON.parse(jsonInput.value)
    jsonOutput.value = JSON.stringify(parsed)
  } catch (error) {
    showToastMessage('无效的JSON格式：' + error.message)
  }
}

// 清空输入
const clearInput = () => {
  jsonInput.value = ''
  jsonOutput.value = ''
}

// 复制到剪贴板
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(jsonOutput.value)
    showToastMessage('已复制到剪贴板')
  } catch (error) {
    // 降级方案
    const textArea = document.createElement('textarea')
    textArea.value = jsonOutput.value
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    showToastMessage('已复制到剪贴板')
  }
}
</script>

<style scoped>
.json {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  position: relative;
}

.json h2 {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
}

.json-container {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.input-section, .output-section {
  margin-bottom: 20px;
}

.input-section label, .output-section label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: #555;
}

.json-textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}

.json-textarea:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.output-textarea {
  background-color: #f8f9fa;
  border-color: #28a745;
}

.button-group {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover {
  background-color: #0056b3;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background-color: #545b62;
}

.btn-clear {
  background-color: #dc3545;
  color: white;
}

.btn-clear:hover {
  background-color: #c82333;
}

.btn-copy {
  background-color: #28a745;
  color: white;
  margin-top: 10px;
}

.btn-copy:hover {
  background-color: #1e7e34;
}

/* Toast提示样式 */
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background-color: #333;
  color: white;
  padding: 12px 20px;
  border-radius: 6px;
  font-size: 14px;
  z-index: 1000;
  opacity: 0;
  transform: translateY(-20px);
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toast-show {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 600px) {
  .button-group {
    flex-direction: column;
  }
  
  .btn {
    width: 100%;
  }
  
  .toast {
    right: 10px;
    left: 10px;
    top: 10px;
  }
}
</style> 