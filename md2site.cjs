/*
 * 每日热点简报 -> 网站数据转换脚本
 * 读取坚果云「每日热点」目录的早班快讯 / 晚班全景 Markdown，
 * 解析为网站 data/hotspots.json 结构（morning=早班、evening=晚班），
 * 并保留每条新闻的真实来源外链（sources 数组）。
 *
 * 用法：node md2site.cjs
 * 输入：C:/Users/chyin/Nutstore/1/DailyWork/WorkBuddy/每日热点/YYYY-MM-DD-{早班快讯,晚班全景}.md
 * 输出：本目录 data/hotspots.json（重新生成）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC_DIR = 'C:/Users/chyin/Nutstore/1/DailyWork/WorkBuddy/每日热点';
const OUT = path.join(__dirname, 'data', 'hotspots.json');
const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/* ---------- 通用工具 ---------- */
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEK[new Date(y, m - 1, d).getDay()];
}
// 把 [文字](url) 解析成 {name,url}；整行来源串可含多个、用 、，, ｜ 分隔
function parseSources(line) {
  const out = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let m;
  while ((m = re.exec(line)) !== null) out.push({ name: m[1], url: m[2] });
  return out;
}
// 去掉所有 markdown 链接，只留文字（用于 source 纯文本展示）
function stripLinks(s) {
  return String(s).replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, '$1');
}
// 分类归一化：为机器人领域标签提供网页色板映射用的主类
function normCategory(raw) {
  const c = String(raw || '').trim();
  const map = {
    '融资': '融资', '资本': '融资', '资本市场': '融资',
    '订单与量产': '订单量产', '订单与合作': '订单量产', '场景落地': '订单量产', '政策场景': '订单量产',
    '产品发布': '产品发布', '产品与审批': '产品发布', '产品与人事观点': '产品发布',
    '技术论文': '技术', '模型与技术': '技术', '技术': '技术', '技术/观点': '技术', '模型开源': '技术',
    '政策标准': '政策', '人事观点': '观点', '宏观数据': '财经', '财报数据': '财经', '趋势': '观点',
    '数据': '技术', '零部件': '技术', '资本与政策': '政策'
  };
  return map[c] || '科技';
}

/* ---------- 解析快讯条目块 ----------
 * 块格式（早班/晚班共性）：
 * **N.【标签】标题**          <- 可能带 ｜子标签
 * 正文段落（连续到下一个 来源：/ 关注点： 行）
 * 来源：[名](url)、[名](url)｜时间：x
 * 关注点：x                   <- 早班有，晚班一般无
 */
function parseItems(lines) {
  const items = [];
  const headRe = /^\*\*\d+\.\s*【([^】]+)】\s*(.+?)\*\*\s*$/;
  let cur = null;
  const flush = () => { if (cur) { items.push(cur); cur = null; } };
  for (let raw of lines) {
    const line = raw.trim();
    const h = line.match(headRe);
    if (h) {
      flush();
      const rawTag = h[1].trim();
      // 「分类/子标签」或「分类｜子标签」：主类取第一段
      const mainTag = rawTag.split(/[|｜\/]/)[0].trim();
      cur = { category: normCategory(mainTag), rawCategory: rawTag, title: h[2].trim(), body: [], sources: [], time: '', why: '' };
      continue;
    }
    if (!cur) continue;
    // 兼容两种格式：11-18「来源：…｜时间：x」与 11-19「- 来源：… / - 发生时间：x」
    const bl = line.replace(/^[-*]\s+/, '').trim();
    if (/^来源[：:]/.test(bl)) {
      cur.sources = parseSources(bl);
      const tm = bl.match(/[｜|]\s*时间[：:]\s*(.+?)(\s*$)/);
      if (tm) cur.time = tm[1].trim();
      continue;
    }
    if (/^发生时间[：:]/.test(bl)) {
      cur.time = bl.replace(/^发生时间[：:]\s*/, '').trim();
      continue;
    }
    if (/^(关注点|值得关注的原因)[：:]/.test(bl)) {
      cur.why = stripLinks(bl.replace(/^(关注点|值得关注的原因)[：:]\s*/, '')).trim();
      continue;
    }
    if (/^事件[：:]/.test(bl)) {
      cur.body.push(bl.replace(/^事件[：:]\s*/, ''));
      continue;
    }
    if (/^---\s*$/.test(line) || /^##\s/.test(line) || /^###\s/.test(line)) { flush(); continue; }
    if (line) cur.body.push(bl);
  }
  flush();
  // 组装 desc：正文 + 关注点
  return items.map(it => {
    let desc = it.body.join(' ').trim();
    if (it.why) desc += (desc ? ' ' : '') + '【关注点】' + it.why;
    const tags = [it.rawCategory];
    if (it.time) tags.push(it.time);
    return {
      category: it.category,
      rawCategory: it.rawCategory,
      title: it.title,
      desc: desc,
      time: it.time,
      why: it.why,
      source: it.sources.map(s => s.name).join('、') || '公开报道',
      sources: it.sources,
      tags: tags.filter(Boolean).slice(0, 3)
    };
  });
}

/* ---------- 解析单个 md 文件 ---------- */
function parseBrief(file, kind) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  // 日期
  let date = '';
  const dm = (lines[0] || '').match(/（(\d{4}-\d{2}-\d{2})）/);
  if (dm) date = dm[1];
  // 主线：## ① 今日主线 / 今日全景 之后的首段非空正文
  let mainline = '';
  const mi = lines.findIndex(l => /^##\s*①/.test(l.trim()));
  if (mi >= 0) {
    for (let i = mi + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!t) continue;
      if (/^##\s/.test(t)) break;
      mainline = stripLinks(t);
      break;
    }
  }
  // 条目：从「## ② 核心快讯 / 分区热点」起，到「## ③」止
  const startIdx = lines.findIndex(l => /^##\s*②/.test(l.trim()));
  let endIdx = lines.findIndex(l => /^##\s*③/.test(l.trim()));
  if (endIdx < 0) endIdx = lines.length;
  const section = (startIdx >= 0 ? lines.slice(startIdx + 1, endIdx) : []);
  const items = parseItems(section);
  // 待核实区 / 明日关注（列表项）
  function listAfter(re) {
    const i = lines.findIndex(l => re.test(l.trim()));
    const arr = [];
    if (i < 0) return arr;
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (/^##\s/.test(t)) break;
      const lm = t.match(/^(?:\d+\.\s*|-\s*)(.+)$/);
      if (lm) arr.push(stripLinks(lm[1]).trim());
    }
    return arr;
  }
  const verify = listAfter(/^##\s*④?\s*待核实区|^##\s*③\s*待核实区|^##\s*④\s*待核实区/);
  const watch = listAfter(/^##\s*(④|⑤)\s*(明日关注|明日跟踪)/);
  return { date, mainline, items, verify, watch, kind };
}

/* ---------- 主流程 ---------- */
function main() {
  if (!fs.existsSync(SRC_DIR)) { console.error('源目录不存在:', SRC_DIR); process.exit(1); }
  const files = fs.readdirSync(SRC_DIR).filter(f => /^\d{4}-\d{2}-\d{2}-(早班快讯|晚班全景)\.md$/.test(f)).sort();
  if (!files.length) { console.error('未找到简报 md'); process.exit(1); }

  // 按日期聚合
  const byDate = new Map();
  for (const f of files) {
    const isMorning = f.includes('早班快讯');
    const parsed = parseBrief(path.join(SRC_DIR, f), isMorning ? 'morning' : 'evening');
    if (!parsed.date) continue;
    if (!byDate.has(parsed.date)) byDate.set(parsed.date, { date: parsed.date, morning: [], evening: [], summary: '', verify: [], watch: [] });
    const d = byDate.get(parsed.date);
    if (isMorning) {
      d.morning = parsed.items;
      d.summary = parsed.mainline || d.summary;
      if (parsed.verify.length) d.verify = parsed.verify;
      if (parsed.watch.length) d.watch = parsed.watch;
    } else {
      d.evening = parsed.items;
      if (parsed.mainline) d.summary = d.summary ? (d.summary + ' ' + parsed.mainline) : parsed.mainline;
      if (parsed.verify.length && !d.verify.length) d.verify = parsed.verify;
      if (parsed.watch.length && !d.watch.length) d.watch = parsed.watch;
    }
  }

  const days = Array.from(byDate.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7)
    .map(d => Object.assign({ weekday: weekdayOf(d.date), qa: [] }, d));

  const now = new Date();
  const p = n => String(n).padStart(2, '0');
  const updatedAt = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}T${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}+08:00`;

  const out = {
    site: {
      name: '热点早晚报',
      tagline: '人形机器人与具身智能 · 每日早班快讯与晚班全景',
      updatedAt
    },
    days
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

  console.log('[md2site] 已生成', OUT);
  days.forEach(d => console.log(`  ${d.date} ${d.weekday} | 早班 ${d.morning.length} 条 | 晚班 ${d.evening.length} 条 | 外链 ${d.morning.concat(d.evening).reduce((n, x) => n + (x.sources || []).length, 0)} 个`));
}
main();
