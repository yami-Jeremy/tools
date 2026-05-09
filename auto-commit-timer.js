/**
 * 自动提交定时器
 * 每隔30秒修改 auto-commit.txt 文件内容（写入当前时间）
 * 然后自动执行 git add + commit + push
 *
 * 使用方式: node auto-commit-timer.js
 * 停止方式: Ctrl+C
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 目标文件路径
const TARGET_FILE = path.join(__dirname, 'auto-commit.txt');

// 更新间隔（毫秒）
const INTERVAL_MS = 30000;

// 提交计数器
let commitCount = 0;

function executeGit(command) {
  try {
    const output = execSync(command, { cwd: __dirname, encoding: 'utf-8' });
    return { success: true, output: output.trim() };
  } catch (error) {
    return { success: false, output: error.message };
  }
}

function updateAndCommit() {
  commitCount++;
  const now = new Date();
  const timestamp = now.toLocaleString('zh-CN', { timeZone: 'America/Los_Angeles' });
  const content = `最后更新时间: ${timestamp}\n提交序号: ${commitCount}\n时间戳: ${Date.now()}\n`;

  // 写入文件
  fs.writeFileSync(TARGET_FILE, content, 'utf-8');
  console.log(`\n[${timestamp}] 第 ${commitCount} 次更新`);

  // git add
  const addResult = executeGit('git add auto-commit.txt');
  if (!addResult.success) {
    console.error('  ❌ git add 失败:', addResult.output);
    return;
  }
  console.log('  ✅ git add 完成');

  // git commit
  const commitMsg = `自动提交 #${commitCount}: ${timestamp}`;
  const commitResult = executeGit(`git commit -m "${commitMsg}"`);
  if (!commitResult.success) {
    console.error('  ❌ git commit 失败:', commitResult.output);
    return;
  }
  console.log('  ✅ git commit 完成');

  // git push
  const pushResult = executeGit('git push origin main');
  if (!pushResult.success) {
    console.error('  ❌ git push 失败:', pushResult.output);
    return;
  }
  console.log('  ✅ git push 完成');
  console.log(`  📤 已推送到远程仓库`);
}

// 首次执行
updateAndCommit();

// 定时执行
const timer = setInterval(updateAndCommit, INTERVAL_MS);

// 优雅退出
process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\n\n定时器已停止，共完成 ' + commitCount + ' 次提交');
  process.exit(0);
});

console.log(`\n自动提交定时器已启动`);
console.log(`间隔: ${INTERVAL_MS / 1000} 秒`);
console.log(`目标: auto-commit.txt`);
console.log(`远程: origin/main`);
console.log('按 Ctrl+C 停止\n');
