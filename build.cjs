/*
 * 热点早晚报 - 静态站构建脚本
 * 读取 data/hotspots.json，生成三类产品：
 *   1) 每期独立页：YYYY-MM-DD.html（含早报/晚报/问答三个可切换面板，页内有目录页链接）
 *   2) 目录页：archive.html（索引全部历史期数，按日期倒序，每日更新）
 *   3) 主页：index.html（始终展示最新一期，内容与最新期独立页一致）
 * 所有内容内嵌、零外部 JS/CSS 依赖，供坚果云分享 / 在线预览。
 * 用法：node build.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const SRC = path.join(DATA_DIR, 'hotspots.json');
const MANIFEST = path.join(DATA_DIR, 'archive-manifest.json');
const OUT_INDEX = path.join(ROOT, 'index.html');
const OUT_ARCHIVE = path.join(ROOT, 'archive.html');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const days = (data.days && Array.isArray(data.days)) ? data.days : [];
const day = days[0];
if (!day) { console.error('no day data'); process.exit(1); }

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(d) { const p = String(d).split('-'); return `${p[0]} 年 ${+p[1]} 月 ${+p[2]} 日`; }
function fmtTime(t) {
  if (!t) return '—';
  const dt = new Date(t); if (isNaN(dt)) return t;
  const p = n => (n < 10 ? '0' + n : '' + n);
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}
function shortDate(d) { const p = String(d).split('-'); return `${+p[1]}月${+p[2]}日`; }
function fileOf(d) { return d + '.html'; }

/* ---------- 累积目录清单（不受 7 天数据保留限制） ---------- */
function syncManifest() {
  let m = { days: [] };
  try { const raw = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); if (raw && Array.isArray(raw.days)) m = raw; } catch (e) { /* seed */ }
  const map = new Map(m.days.map(d => [d.date, d]));
  days.forEach(d => {
    const prev = map.get(d.date) || {};
    map.set(d.date, {
      date: d.date,
      weekday: d.weekday || prev.weekday || '',
      summary: d.summary || prev.summary || '',
      morningCount: (d.morning || []).length,
      eveningCount: (d.evening || []).length,
      qaCount: (d.qa || []).length,
      file: fileOf(d.date),
      updatedAt: (data.site && data.site.updatedAt) || prev.updatedAt || ''
    });
  });
  m.days = Array.from(map.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2), 'utf8');
  return m;
}
const manifest = syncManifest();

/* ---------- 通用样式 ---------- */
const STYLE = `
:root{--paper:#f7f5f0;--surface:#fff;--ink:#1c1b19;--ink-2:#5c584f;--ink-3:#928d82;--line:#e8e3d9;--accent:#b23a2e;--accent-soft:#fbece9;--gold:#a8812c;--gold-soft:#f7f0dd;--blue:#2f5d8a;--blue-soft:#e9f0f7;--green:#2f6b4f;--green-soft:#e7f2ec;--purple:#6b4a8c;--purple-soft:#f0eaf7;--shadow:0 1px 2px rgba(30,25,15,.04),0 8px 24px rgba(30,25,15,.05);--serif:"Songti SC","Noto Serif CJK SC","Source Han Serif SC",STSong,SimSun,serif;--sans:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",Roboto,sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.75;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:920px;margin:0 auto;padding:0 20px}
header.masthead{padding:34px 0 0}
.topline{display:flex;justify-content:space-between;font-size:12px;color:var(--ink-3);letter-spacing:.08em;border-top:3px double var(--ink);padding-top:10px}
.brand{text-align:center;padding:18px 0 14px;border-bottom:1px solid var(--ink)}
.brand h1{font-family:var(--serif);font-size:50px;letter-spacing:.18em;font-weight:700;line-height:1.1}
.brand .en{font-size:11px;letter-spacing:.42em;color:var(--accent);margin-top:8px;text-transform:uppercase}
.brand .tagline{font-size:13px;color:var(--ink-2);margin-top:12px}
.metaline{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px;color:var(--ink-3);padding:10px 0;border-bottom:1px solid var(--line)}
.live i{width:7px;height:7px;border-radius:50%;background:#3a9e63;display:inline-block;margin-right:6px}
.metaline .navlinks{display:flex;gap:14px;margin-left:auto}
.metaline .navlinks a{color:var(--ink-2);border-bottom:1px solid var(--line);padding-bottom:1px}
.metaline .navlinks a:hover{color:var(--accent);border-color:var(--accent)}
.pagenav{padding:20px 0 4px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.datechip{font-family:var(--serif);font-size:24px;font-weight:700}
.datechip small{font-family:var(--sans);font-size:12px;color:var(--ink-3);font-weight:400;margin-left:8px}
.pn-right{margin-left:auto;display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--ink-3)}
.pn-right a{color:var(--blue);border-bottom:1px dashed var(--line)}
.pn-right a:hover{border-color:var(--blue)}
.pn-right .disabled{color:var(--ink-3);opacity:.5}
.homebar{margin-top:12px;background:var(--gold-soft);border:1px solid #efe4c6;border-radius:5px;padding:10px 14px;font-size:12.5px;color:#7a6320;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.homebar a{color:var(--accent);font-weight:600;border-bottom:1px solid var(--accent)}
.summary{background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:4px;padding:18px 20px;margin:14px 0 24px;box-shadow:var(--shadow)}
.summary .label{font-size:11px;letter-spacing:.2em;color:var(--accent);font-weight:600}
.summary p{font-family:var(--serif);font-size:16px;line-height:1.85;margin-top:6px}
.tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:22px}
.tab{appearance:none;background:none;border:none;border-bottom:2px solid transparent;padding:11px 20px;font-size:15px;font-family:var(--sans);color:var(--ink-2);cursor:pointer;transition:.18s;display:flex;align-items:center;gap:8px}
.tab:hover{color:var(--ink)}
.tab.active{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
.tab .num{font-size:11px;background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:0 7px;color:var(--ink-3)}
.panel{display:none;animation:fade .3s ease}
.panel.active{display:block}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.sec-intro{display:flex;align-items:baseline;gap:14px;margin:4px 0 16px}
.sec-intro .big{font-family:var(--serif);font-size:26px;font-weight:700}
.sec-intro .sub{font-size:12px;color:var(--ink-3)}
.sec-intro .rule{flex:1;height:1px;background:var(--line)}
.news{display:grid;grid-template-columns:40px 1fr;gap:16px;padding:18px 8px;border-bottom:1px solid var(--line)}
.news .idx{font-family:var(--serif);font-size:29px;font-weight:700;color:var(--line);line-height:1}
.cat{display:inline-block;font-size:11px;letter-spacing:.05em;padding:2px 9px;border-radius:3px;font-weight:600}
.cat-财经,.cat-融资{background:var(--gold-soft);color:var(--gold)}.cat-科技,.cat-技术{background:var(--blue-soft);color:var(--blue)}.cat-民生,.cat-订单量产{background:var(--green-soft);color:var(--green)}.cat-体育,.cat-产品发布{background:var(--purple-soft);color:var(--purple)}.cat-娱乐,.cat-观点{background:var(--accent-soft);color:var(--accent)}.cat-航天,.cat-政策{background:var(--green-soft);color:var(--green)}.cat-时政{background:var(--accent-soft);color:var(--accent)}
.src-links{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.src-links a{color:var(--blue);border-bottom:1px dashed var(--line);font-size:11.5px}
.src-links a:hover{border-color:var(--blue)}
.extra-box{background:var(--gold-soft);border:1px solid #efe4c6;border-radius:5px;padding:12px 16px;margin:16px 0;font-size:12.5px;color:#6d5820}
.extra-box h4{font-family:var(--serif);font-size:15px;margin-bottom:6px;color:#5a4818}
.extra-box ol,.extra-box ul{margin:4px 0 0 18px;line-height:1.8}
.extra-box li{margin:2px 0}
.news h3{font-family:var(--serif);font-size:19px;line-height:1.5;font-weight:700;margin:8px 0 6px}
.news p{font-size:14px;color:var(--ink-2);line-height:1.8}
.news .foot{margin-top:9px;display:flex;align-items:center;gap:9px;flex-wrap:wrap;font-size:11.5px;color:var(--ink-3)}
.news .foot .tag{background:var(--paper);border:1px solid var(--line);border-radius:20px;padding:1px 9px}
.qa-wrap{background:var(--surface);border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);padding:18px 22px}
.qa-wrap h2{font-family:var(--serif);font-size:22px;margin-bottom:4px}
.qa-tip{font-size:12px;color:var(--ink-3);margin-bottom:16px}
.qa-item{padding:14px 0;border-top:1px dashed var(--line)}
.qa-q{font-weight:600;font-size:15px;display:flex;gap:10px;align-items:flex-start}
.qn{color:var(--accent);font-size:12px;flex:0 0 auto;margin-top:3px}
.qa-a{display:flex;gap:10px;margin-top:8px;color:var(--ink-2);font-size:14px;line-height:1.8}
.an{flex:0 0 auto;width:20px;height:20px;border-radius:5px;background:var(--accent);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;margin-top:2px}
.arch-head{padding:22px 0 8px}
.arch-head h2{font-family:var(--serif);font-size:27px}
.arch-head p{font-size:12px;color:var(--ink-3);margin-top:4px}
.arch-item{background:var(--surface);border:1px solid var(--line);border-radius:6px;padding:16px 18px;margin:12px 0;box-shadow:var(--shadow)}
.arch-item .arch-date{font-family:var(--serif);font-size:19px;font-weight:700;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.arch-item .arch-date a:hover{color:var(--accent)}
.arch-item .arch-date small{font-family:var(--sans);font-size:12px;color:var(--ink-3);font-weight:400}
.badge-new{font-family:var(--sans);font-size:10px;background:var(--accent);color:#fff;border-radius:20px;padding:2px 8px;font-weight:600;letter-spacing:.05em}
.arch-item .arch-sum{font-size:13.5px;color:var(--ink-2);line-height:1.75;margin:8px 0 10px}
.arch-item .arch-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--ink-3)}
.arch-item .arch-links{margin-left:auto;display:flex;gap:12px}
.arch-item .arch-links a{color:var(--blue);border-bottom:1px dashed var(--line)}
.arch-item .arch-links a:hover{border-color:var(--blue)}
.empty{text-align:center;color:var(--ink-3);padding:40px 0}
footer{margin-top:50px;padding:24px 0 40px;border-top:3px double var(--ink);font-size:12px;color:var(--ink-3);line-height:1.9}
footer .row{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
@media(max-width:640px){.brand h1{font-size:34px}.news{grid-template-columns:26px 1fr;gap:10px;padding:14px 2px}.news .idx{font-size:21px}.news h3{font-size:17px}.tab{padding:10px 12px;font-size:14px}.qa-wrap{padding:14px}.arch-item .arch-links{margin-left:0}}
`;

const TAB_JS = `
(function(){
  var tabs=[].slice.call(document.querySelectorAll('.tab'));
  var panels=[].slice.call(document.querySelectorAll('.panel'));
  function show(name){
    tabs.forEach(function(t){t.classList.toggle('active',t.getAttribute('data-panel')===name);});
    panels.forEach(function(p){p.classList.toggle('active',p.id==='panel-'+name);});
  }
  tabs.forEach(function(t){t.addEventListener('click',function(){show(t.getAttribute('data-panel'));});});
  var h=(location.hash||'').replace('#','');
  if(h==='morning'||h==='evening'||h==='qa'||h==='verify') show(h);
})();
`;

/* ---------- 内容片段 ---------- */
function srcBlock(n) {
  if (n.sources && n.sources.length) {
    return `<span class="src-links"><span class="src">来源 ·</span> ${n.sources.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>`).join('、')}</span>`;
  }
  return `<span class="src">来源 · ${esc(n.source || '公开报道')}</span>`;
}
function newsList(list) {
  if (!list || !list.length) return '<div class="empty">这一栏暂无内容（该时段简报尚未生成）</div>';
  return list.map((n, i) => `
    <article class="news">
      <div class="idx">${String(i + 1).padStart(2, '0')}</div>
      <div>
        <span class="cat cat-${esc(n.category)}">${esc(n.rawCategory || n.category)}</span>
        ${n.time ? `<span style="font-size:11px;color:var(--ink-3);margin-left:8px">${esc(n.time)}</span>` : ''}
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.desc)}</p>
        <div class="foot">${srcBlock(n)}${(n.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
      </div>
    </article>`).join('');
}
function extraList(title, arr) {
  if (!arr || !arr.length) return '';
  return `<div class="extra-box"><h4>${esc(title)}</h4><ol>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ol></div>`;
}
function qaList(qa) {
  if (!qa || !qa.length) return '<div class="empty">这一栏暂无内容</div>';
  return `<div class="qa-wrap"><h2>热点问答</h2><div class="qa-tip">以下问答根据当日收录的内容整理。</div>${qa.map((x, i) => `
    <div class="qa-item">
      <div class="qa-q"><span class="qn">Q${i + 1}</span>${esc(x.q)}</div>
      <div class="qa-a"><span class="an">A</span><div>${esc(x.a)}</div></div>
    </div>`).join('')}</div>`;
}

/* ---------- 单期页（独立日期页 + 主页共用） ---------- */
function renderDayPage(d, opts) {
  const opts2 = opts || {};
  const isHome = !!opts2.isHome;
  const idx = manifest.days.findIndex(x => x.date === d.date);
  const newer = idx > 0 ? manifest.days[idx - 1] : null;
  const older = idx >= 0 && idx < manifest.days.length - 1 ? manifest.days[idx + 1] : null;
  const mCount = (d.morning || []).length;
  const eCount = (d.evening || []).length;
  const qCount = (d.qa || []).length;
  const allTags = (d.morning || []).concat(d.evening || []);
  const tags = [];
  allTags.forEach(n => (n.tags || []).forEach(t => { if (tags.indexOf(t) < 0) tags.push(t); }));
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>具身热点早晚报 · ${esc(d.date)} · 早班/晚班</title>
<meta name="description" content="${esc(d.date)} 人形机器人与具身智能简报，早班快讯 ${mCount} 条、晚班全景 ${eCount} 条，附原始新闻链接。">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <div class="topline"><span>每日热点 · 早晚上新</span><span>${isHome ? '最新一期' : '往期回顾'} · 第 ${String(manifest.days.length).padStart(3, '0')} 期</span></div>
    <div class="brand">
      <h1><a href="index.html">热点早晚报</a></h1>
      <div class="en">Morning &amp; Evening Brief</div>
      <div class="tagline">${esc(data.site.tagline || '')}</div>
    </div>
    <div class="metaline">
      <span class="live"><i></i>每日更新</span>
      <span>最近更新：${fmtTime(data.site && data.site.updatedAt)}</span>
      <span>已收录 ${manifest.days.length} 天</span>
      <span class="navlinks"><a href="index.html">首页</a><a href="archive.html">目录</a></span>
    </div>
  </header>

  <nav class="pagenav">
    <div class="datechip">${fmtDate(d.date)}<small>${esc(d.weekday || '')}</small></div>
    <div class="pn-right">
      ${older ? `<a href="${esc(older.file)}">← 更早一期 · ${esc(shortDate(older.date))}</a>` : '<span class="disabled">← 已是最早</span>'}
      ${newer ? `<a href="${esc(newer.file)}">更新一期 · ${esc(shortDate(newer.date))} →</a>` : '<span class="disabled">已是最新 →</span>'}
      <a href="archive.html">全部期数 →</a>
    </div>
  </nav>

  ${isHome ? `<div class="homebar"><span>这里展示<strong>最新一期</strong>（${esc(d.date)}）的早班快讯与晚班全景，与当日独立页内容一致。</span><a href="archive.html">查看全部历史期数 →</a></div>` : ''}

  <section class="summary">
    <div class="label">今 日 速 览</div>
    <p>${esc(d.summary || '')}</p>
    ${tags.length ? `<div style="margin-top:10px;font-size:11.5px;color:var(--ink-3)">关键词 · ${tags.slice(0, 6).map(esc).join(' · ')}</div>` : ''}
  </section>

  <div class="tabs" role="tablist">
    <button class="tab active" data-panel="morning" role="tab">早班快讯<span class="num">${mCount}</span></button>
    <button class="tab" data-panel="evening" role="tab">晚班全景<span class="num">${eCount}</span></button>
    <button class="tab" data-panel="qa" role="tab">热点问答<span class="num">${qCount}</span></button>
    <button class="tab" data-panel="verify" role="tab">核实与跟踪<span class="num">${((d.verify || []).length + (d.watch || []).length)}</span></button>
  </div>

  <section class="panel active" id="panel-morning">
    <div class="sec-intro"><span class="big">早班快讯</span><span class="sub">具身智能领域，隔夜与今晨的重要动态</span><span class="rule"></span></div>
    ${newsList(d.morning)}
  </section>

  <section class="panel" id="panel-evening">
    <div class="sec-intro"><span class="big">晚班全景</span><span class="sub">当日全天新增披露与趋势观察</span><span class="rule"></span></div>
    ${newsList(d.evening)}
  </section>

  <section class="panel" id="panel-qa">
    ${qaList(d.qa)}
  </section>

  <section class="panel" id="panel-verify">
    ${extraList('待核实区（单一来源 / 口径未明）', d.verify)}
    ${extraList('明日关注', d.watch)}
  </section>

  <footer>
    <div class="row"><span>具身热点早晚报 · 内容摘编自公开媒体报道，来源可点击查看原文</span><span>${fmtDate(d.date)}</span></div>
    <div class="row"><span>早班快讯 / 晚班全景每日自动更新 · 限定词按原文保留</span><span><a href="archive.html">历史目录</a> · 如有出入，以官方发布为准</span></div>
  </footer>
</div>
<script>${TAB_JS}</script>
</body>
</html>`;
}

/* ---------- 目录页 ---------- */
function renderArchive() {
  const items = manifest.days.map((x, i) => {
    const f = esc(x.file);
    const exists = fs.existsSync(path.join(ROOT, x.file));
    return `
    <article class="arch-item">
      <div class="arch-date"><a href="${f}">${fmtDate(x.date)}</a><small>${esc(x.weekday || '')}</small>${i === 0 ? '<span class="badge-new">最新</span>' : ''}</div>
      <div class="arch-sum">${esc(x.summary || '')}</div>
      <div class="arch-meta">
        <span>早班 ${x.morningCount} 条</span><span>晚班 ${x.eveningCount} 条</span><span>问答 ${x.qaCount} 条</span>
        <span class="arch-links">
          ${exists ? `<a href="${f}#morning">早班</a><a href="${f}#evening">晚班</a><a href="${f}#qa">问答</a><a href="${f}#verify">核实跟踪</a><a href="${f}">整期</a>` : '<span>页面生成中</span>'}
        </span>
      </div>
    </article>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>历史目录 · 具身热点早晚报</title>
<meta name="description" content="具身热点早晚报历史目录，按日期索引每一期的早班快讯、晚班全景与核实跟踪，每日更新。">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <div class="topline"><span>每日热点 · 早晚上新</span><span>第 ${String(manifest.days.length).padStart(3, '0')} 期</span></div>
    <div class="brand">
      <h1><a href="index.html">热点早晚报</a></h1>
      <div class="en">Morning &amp; Evening Brief</div>
      <div class="tagline">${esc(data.site.tagline || '')}</div>
    </div>
    <div class="metaline">
      <span class="live"><i></i>每日更新</span>
      <span>最近更新：${fmtTime(data.site && data.site.updatedAt)}</span>
      <span>已收录 ${manifest.days.length} 天</span>
      <span class="navlinks"><a href="index.html">返回首页</a></span>
    </div>
  </header>

  <section class="arch-head">
    <h2>历史目录</h2>
    <p>按日期倒序索引每一期，点击进入可切换查看早班快讯 / 晚班全景 / 核实与跟踪。目录每日更新。</p>
  </section>

  <div class="arch-list">${items || '<div class="empty">暂无历史期数</div>'}</div>

  <footer>
    <div class="row"><span>具身热点早晚报 · 内容摘编自公开媒体报道，来源可点击查看原文</span><span><a href="index.html">返回首页</a></span></div>
    <div class="row"><span>早班快讯 / 晚班全景每日自动更新</span><span>如有出入，以官方发布为准</span></div>
  </footer>
</div>
</body>
</html>`;
}

/* ---------- 输出 ---------- */
// 1) 数据中每一天各生成一个独立页
days.forEach(d => fs.writeFileSync(path.join(ROOT, fileOf(d.date)), renderDayPage(d, { isHome: false }), 'utf8'));
// 2) 目录页（累积全部历史期数，每日更新）
fs.writeFileSync(OUT_ARCHIVE, renderArchive(), 'utf8');
// 3) 主页 = 最新一期（与当日独立页一致，仅多一条最新提示）
fs.writeFileSync(OUT_INDEX, renderDayPage(day, { isHome: true }), 'utf8');

console.log('Built index:', OUT_INDEX);
console.log('Built archive:', OUT_ARCHIVE, '| days in catalog:', manifest.days.length);
console.log('Built date pages:', days.map(d => fileOf(d.date)).join(', '));
console.log('Date:', day.date, '| morning:', (day.morning || []).length, '| evening:', (day.evening || []).length, '| qa:', (day.qa || []).length);

/* ---------- 可选：构建后自动发布到 GitHub ---------- */
// 由 data/deploy.json 的 enabled 控制；未启用时 deploy.cjs 会安全跳过。
try {
  require(path.join(ROOT, 'deploy.cjs'));
} catch (e) {
  console.warn('[deploy] 自动发布环节异常（不影响本地构建）:', e.message);
}
