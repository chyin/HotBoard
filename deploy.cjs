/*
 * 热点早晚报 - 自动发布脚本
 * 由 build.cjs 构建完成后自动调用，把生成的静态页 commit 并 push 到 GitHub。
 * 由 data/deploy.json 控制开关；未启用 / 非 git 仓库 / 无 remote 时静默跳过，
 * 不影响本地构建与预览。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const CFG = path.join(ROOT, 'data', 'deploy.json');
const LOCK = path.join(ROOT, 'data', '.deploy.lock');

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(CFG, 'utf8')); } catch (e) { /* 无配置 */ }
if (cfg.enabled !== true) {
  console.log('[deploy] 自动发布未启用（data/deploy.json 中 enabled 需为 true），本次跳过');
  process.exit(0);
}

function run(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  if (r.error) throw r.error;
  return r;
}

// 必须在 git 仓库内
let r = run(['rev-parse', '--is-inside-work-tree']);
if (r.status !== 0 || String(r.stdout || '').trim() !== 'true') {
  console.error('[deploy] 当前目录不是 git 仓库，跳过 push');
  process.exit(0);
}
// 必须有 remote
r = run(['remote']);
const remotes = String(r.stdout || '').trim().split(/\s+/).filter(Boolean);
if (!remotes.length) {
  console.error('[deploy] 未配置 git remote，跳过 push');
  process.exit(0);
}
const remote = (cfg.remote && remotes.indexOf(cfg.remote) >= 0) ? cfg.remote : remotes[0];

// 并发锁：10 分钟内的重复调用直接跳过，避免早晚任务或手动构建同时 push
try {
  if (fs.existsSync(LOCK) && (Date.now() - fs.statSync(LOCK).mtimeMs) < 10 * 60 * 1000) {
    console.log('[deploy] 检测到近期发布锁，跳过本次（可能正在发布）');
    process.exit(0);
  }
  fs.writeFileSync(LOCK, String(process.pid));
} catch (e) { /* 忽略锁写入失败 */ }
function release() { try { fs.unlinkSync(LOCK); } catch (e) {} }
process.on('exit', release);

// 暂存所有变更
r = run(['add', '-A']);
if (r.status !== 0) { console.error('[deploy] git add 失败:', String(r.stderr || '').trim()); process.exit(1); }

// 无改动则不提交
r = run(['diff', '--cached', '--quiet']);
if (r.status === 0) { console.log('[deploy] 无内容变化，跳过 commit/push'); process.exit(0); }

// 提交
const now = new Date();
const p = n => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
const msg = `${cfg.commitPrefix || 'auto'} update ${stamp}`;
r = run(['commit', '-m', msg]);
if (r.status !== 0) { console.error('[deploy] git commit 失败:', String(r.stderr || r.stdout || '').trim()); process.exit(1); }
console.log('[deploy] 已提交:', msg);

// push（带重试 + rebase）
const branch = cfg.branch || 'main';
const retries = cfg.retries || 3;
let ok = false;
for (let i = 1; i <= retries; i++) {
  r = run(['push', remote, `HEAD:refs/heads/${branch}`]);
  if (r.status === 0) { ok = true; break; }
  console.error(`[deploy] 第 ${i}/${retries} 次 push 失败:`, String(r.stderr || r.stdout || '').trim());
  if (i < retries) run(['pull', '--rebase', remote, branch]);
}
if (!ok) { console.error('[deploy] push 最终失败，线上未更新'); process.exit(1); }
console.log('[deploy] 已推送到', remote, '— GitHub Pages 将在约 1-2 分钟后完成部署');
