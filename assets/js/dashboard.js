/**
 * 生猪行业供需联动数据看板 - 主逻辑
 * 启动时 fetch data/latest.json，失败用 mock 兜底
 */

// ===== 配置 =====
const DATA_URL = 'data/latest.json';
const WEBHOOK_URL = window.WEWORK_WEBHOOK || ''; // 企微webhook由GitHub Actions调用，前端不写明文

// ===== 全局状态 =====
let rawData = null;

// ===== 工具函数 =====

/** 格式化百分比 */
function fmtPct(val, sign = true) {
  if (val === null || val === undefined) return '—';
  const abs = Math.abs(val).toFixed(1);
  return (sign && val > 0 ? '+' : '') + abs + '%';
}

/** 获取方向中文 */
function dirLabel(dir) {
  const map = { rising: '↑ 上升', falling: '↓ 下降', neutral: '→ 持平' };
  return map[dir] || dir;
}

/** 获取方向CSS类 */
function dirClass(dir) {
  const map = { rising: 'dir-up', falling: 'dir-down', neutral: 'dir-neutral' };
  return map[dir] || 'dir-neutral';
}

/** 获取变化CSS类 */
function changeClass(pct) {
  if (pct > 0.1) return 'up';
  if (pct < -0.1) return 'down';
  return 'neutral';
}

/** 计算历史百分位 */
function calcPercentile(value, history) {
  if (!history || history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a - b);
  let count = 0;
  for (let v of sorted) {
    if (v <= value) count++;
  }
  return Math.round((count / sorted.length) * 100);
}

// ===== 数据加载 =====

async function loadData() {
  try {
    const resp = await fetch(DATA_URL + '?t=' + Date.now());
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    rawData = await resp.json();
    return rawData;
  } catch (err) {
    console.warn('[Dashboard] fetch failed, using embedded mock:', err.message);
    return getEmbeddedMock();
  }
}

function getEmbeddedMock() {
  // 最简化的内嵌mock兜底
  return {
    update_date: 'N/A(fetch failed)',
    update_time: '',
    data_source: 'embedded_mock',
    breeding_chain: { label: '养殖链', indicators: [] },
    frozen_chain: { label: '冻品链', indicators: [] },
    linkage_matrix: { breeding_direction: 'rising', frozen_direction: 'falling', quadrant: 'topping', quadrant_label: '顶部区间', breeding_direction_label: '养殖链：补栏加速↑', frozen_direction_label: '冻品链：需求走弱↓', quadrant_note: '数据加载失败，请检查 data/latest.json' },
    cycle_position: { phase: 'topping', phase_label: '顶部区间', phase_description: '无法加载数据' },
    alert_level: { level: 'yellow', level_label: '黄色预警', summary: '数据加载失败' },
    action_suggestions: []
  };
}

// ===== 渲染：预警条 =====

function renderAlertBar(data) {
  const bar = document.getElementById('alertBar');
  if (!bar) return;

  const { level, level_label, summary } = data.alert_level || {};
  bar.className = 'alert-bar alert-' + (level || 'green');
  bar.innerHTML = `
    <span class="alert-dot"></span>
    <span class="alert-status">${level_label || '绿色正常'}</span>
    <span class="alert-text">${summary || '各指标运行正常'}</span>
    <span class="alert-time">${data.update_date || ''} ${data.update_time || ''}</span>
  `;
}

// ===== 渲染：养殖链 + 冻品链 =====

function renderChainIndicators(chainData, containerId) {
  const container = document.getElementById(containerId);
  if (!container || !chainData || !chainData.indicators) return;

  container.innerHTML = '';

  for (const ind of chainData.indicators) {
    const interp = INTERPRETATIONS[ind.key] || {};

    // 方向箭头
    const dir = ind.direction || 'neutral';
    const dirText = dirLabel(dir);
    const dirCls = dirClass(dir);

    // 变化百分比
    const momPct = ind.mom_pct || 0;
    const changeCls = changeClass(momPct);

    // 百分位
    const pct = calcPercentile(ind.current, ind.history);

    const card = document.createElement('div');
    card.className = 'indicator-card';
    card.dataset.key = ind.key;

    card.innerHTML = `
      <div class="card-header">
        <span class="indicator-label">${ind.label}</span>
        <button class="info-btn" data-key="${ind.key}" title="查看解读">?</button>
      </div>
      <div class="indicator-value">
        ${typeof ind.current === 'number' ? ind.current.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : ind.current}
        <span class="indicator-unit">${ind.unit}</span>
      </div>
      <div class="indicator-change ${changeCls}">
        ${changeCls === 'up' ? '▲' : changeCls === 'down' ? '▼' : '―'} ${fmtPct(momPct)}
      </div>
      <div class="indicator-direction">
        <span class="dir-arrow ${dirCls}">${dirText}</span>
      </div>
      <div class="chart-container" id="chart-${ind.key}"></div>
      <div class="interpretation-panel" id="interp-${ind.key}"></div>
    `;

    container.appendChild(card);

    // 绘制迷你折线图
    renderMiniChart(ind, `chart-${ind.key}`);

    // 绑定解读按钮
    const infoBtn = card.querySelector('.info-btn');
    infoBtn.addEventListener('click', () => toggleInterpretation(ind.key));
  }
}

function renderMiniChart(ind, containerId) {
  const el = document.getElementById(containerId);
  if (!el || !ind.history || ind.history.length < 2) return;

  const data = ind.history;
  const w = el.clientWidth || 200;
  const h = el.clientHeight || 90;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return [x, y];
  });

  // 阈值线
  const threshH = [];
  if (ind.threshold_high) {
    const yh = h - ((ind.threshold_high - min) / range) * (h - 8) - 4;
    threshH.push(`<line x1="0" y1="${Math.max(0, Math.min(h, yh))}" x2="${w}" y2="${Math.max(0, Math.min(h, yh))}" stroke="#FCA5A5" stroke-width="1" stroke-dasharray="3,3"/>`);
  }
  if (ind.threshold_low) {
    const yl = h - ((ind.threshold_low - min) / range) * (h - 8) - 4;
    threshH.push(`<line x1="0" y1="${Math.max(0, Math.min(h, yl))}" x2="${w}" y2="${Math.max(0, Math.min(h, yl))}" stroke="#93C5FD" stroke-width="1" stroke-dasharray="3,3"/>`);
  }

  // 路径
  const pathD = pts.map((p, i) => (i === 0 ? 'M' + p[0] + ',' + p[1] : 'L' + p[0] + ',' + p[1])).join(' ');
  const areaD = pathD + ` L${pts[pts.length - 1][0]},${h} L0,${h} Z`;

  // 当前点高亮
  const lastPt = pts[pts.length - 1];
  const isUp = ind.direction === 'rising';
  const dotColor = isUp ? '#DC2626' : ind.direction === 'falling' ? '#2563EB' : '#6B7280';

  el.innerHTML = `
    <svg width="${w}" height="${h}" style="display:block">
      <defs>
        <linearGradient id="areaGrad${ind.key}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${dotColor}" stop-opacity="0.15"/>
          <stop offset="100%" stop-color="${dotColor}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${threshH.join('')}
      <path d="${areaD}" fill="url(#areaGrad${ind.key})"/>
      <path d="${pathD}" fill="none" stroke="${dotColor}" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="4" fill="${dotColor}" stroke="#fff" stroke-width="1.5"/>
      ${data.length > 1 ? `
        <circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="2.5" fill="${dotColor}" opacity="0.5"/>
      ` : ''}
    </svg>
  `;
}

// ===== 解读层 =====

function toggleInterpretation(key) {
  const panel = document.getElementById('interp-' + key);
  if (!panel) return;

  if (panel.classList.contains('active')) {
    panel.classList.remove('active');
    return;
  }

  // 关闭其他已打开的
  document.querySelectorAll('.interpretation-panel.active').forEach(p => p.classList.remove('active'));

  renderInterpretation(key, panel);
  panel.classList.add('active');
}

function renderInterpretation(key, panel) {
  const ind = findIndicator(key);
  const interp = INTERPRETATIONS[key];
  if (!interp || !ind) {
    panel.innerHTML = '<p style="color:#999">暂无解读数据</p>';
    return;
  }

  // 历史对照
  const histHtml = (interp.historical_similar || []).map(h => `
    <div class="historical-item">
      <strong>${h.period}</strong>：${h.data}
      <br><em style="color:#8B7355;font-size:0.72rem">→ ${h.lesson}</em>
    </div>
  `).join('');

  // 当前解读
  const dir = ind.direction || 'neutral';
  const change = interp.change_meaning || {};
  const changeInfo = change[dir] || {};

  // 历史百分位
  const pct = calcPercentile(ind.current, ind.history);

  panel.innerHTML = `
    <button class="close-btn" onclick="this.closest('.interpretation-panel').classList.remove('active')">✕</button>
    <h4>📖 什么是"${ind.label}"？</h4>
    <p>${interp.what || ''}</p>
    <p style="margin-top:4px;color:#8B7355;font-size:0.75rem"><strong>为什么重要：</strong>${interp.why || ''}</p>

    <h4>📊 当前值位置</h4>
    <p>${interp.position?.description || ''}</p>
    ${pct ? `<p style="font-size:0.75rem;color:#8B7355">历史百分位约<strong>${pct}%</strong></p>` : ''}
    ${interp.position?.interpretation ? `<div class="signal-box">💡 ${interp.position.interpretation}</div>` : ''}

    <h4>${dir === 'rising' ? '📈' : dir === 'falling' ? '📉' : '➡️'} 当前走势解读</h4>
    <p>${changeInfo.text || '暂无解读'}</p>
    ${changeInfo.signal ? `<div class="signal-box">${changeInfo.signal}</div>` : ''}
    ${changeInfo.action ? `<p style="font-size:0.75rem;color:#8B7355">→ ${changeInfo.action}</p>` : ''}

    ${histHtml ? `<h4>🔍 历史相似情形</h4>${histHtml}` : ''}

    <h4>🔗 联动传导</h4>
    <p style="font-size:0.78rem;color:#8B7355">${interp.linkage || ''}</p>
  `;
}

function findIndicator(key) {
  if (!rawData) return null;
  const chains = [rawData.breeding_chain, rawData.frozen_chain];
  for (const chain of chains) {
    if (chain && chain.indicators) {
      const found = chain.indicators.find(i => i.key === key);
      if (found) return found;
    }
  }
  return null;
}

// ===== 渲染：联动矩阵 =====

const MATRIX_COLS = {
  rising: '上升 ↑',
  neutral: '持平 →',
  falling: '下降 ↓'
};

function buildMatrixKey(breedDir, frozenDir) {
  return breedDir + '+' + frozenDir;
}

function renderLinkageMatrix(data) {
  const { breeding_direction, frozen_direction } = data.linkage_matrix || {};
  const directions = ['rising', 'neutral', 'falling'];

  const grid = document.getElementById('matrixGrid');
  if (!grid) return;

  // 清空并重建
  grid.innerHTML = '';

  // 列头（冻品链方向）
  const corner = document.createElement('div');
  corner.className = 'matrix-header corner';
  grid.appendChild(corner);

  for (const fd of directions) {
    const h = document.createElement('div');
    h.className = 'matrix-header col-header';
    h.textContent = '冻品' + MATRIX_COLS[fd];
    grid.appendChild(h);
  }

  // 行+格子
  for (const bd of directions) {
    const rh = document.createElement('div');
    rh.className = 'matrix-header row-header';
    rh.textContent = '养殖' + MATRIX_COLS[bd];
    grid.appendChild(rh);

    for (const fd of directions) {
      const key = buildMatrixKey(bd, fd);
      const interp = INTERPRETATIONS.linkage_matrix?.[key] || {};
      const isCurrent = bd === breeding_direction && fd === frozen_direction;

      const cell = document.createElement('div');
      cell.className = 'matrix-cell' + (isCurrent ? ' current' : '');
      cell.dataset.breedDir = bd;
      cell.dataset.frozenDir = fd;
      cell.dataset.key = key;

      cell.innerHTML = `
        <div class="cell-direction">${interp.title || key}</div>
        <div class="cell-note">${isCurrent ? interp.signal || '' : interp.signal || ''}</div>
      `;

      cell.addEventListener('click', () => showMatrixDetail(key, cell));
      grid.appendChild(cell);
    }
  }

  // 渲染当前格子详情
  const currentKey = buildMatrixKey(breeding_direction, frozen_direction);
  showMatrixDetail(currentKey, null, true);
}

function showMatrixDetail(key, cellEl, isInitial = false) {
  const interp = INTERPRETATIONS.linkage_matrix?.[key] || {};
  const detailEl = document.getElementById('matrixDetail');

  if (!detailEl) return;

  // 高亮当前格子
  document.querySelectorAll('.matrix-cell').forEach(c => c.classList.remove('current'));
  if (cellEl) cellEl.classList.add('current');
  if (isInitial) {
    const initCell = document.querySelector('.matrix-cell.current');
    if (initCell) initCell.classList.add('current');
  }

  detailEl.innerHTML = `
    <div class="current-title">
      ${interp.title || key}
      ${interp.current ? `<span class="current-signal">${interp.signal || '当前'}</span>` : ''}
    </div>
    <p class="meaning-text">${interp.meaning || '暂无解读'}</p>
    ${interp.historical ? `
      <div class="historical-hint">📅 历史对照：${interp.historical}</div>
    ` : ''}
    <p class="matrix-nav-hint">💡 点击矩阵中任意格子可查看对应解读</p>
  `;
}

// ===== 渲染：周期位置 =====

function renderCyclePosition(data) {
  const phases = ['bottoming', 'rising', 'topping', 'falling'];
  const container = document.getElementById('cyclePhaseGrid');
  if (!container) return;

  const currentPhase = data.cycle_position?.phase || 'topping';

  container.innerHTML = phases.map(phase => {
    const interp = INTERPRETATIONS.cycle_phases?.[phase] || {};
    const isActive = phase === currentPhase;
    return `
      <div class="cycle-phase-item phase-${phase} ${isActive ? 'active-phase' : ''}" data-phase="${phase}">
        <div class="phase-name">${interp.name || phase}</div>
        <div style="font-size:0.72rem;opacity:0.8">${isActive ? '◀ 当前' : ''}</div>
      </div>
    `;
  }).join('');

  // 周期详情
  const pos = data.cycle_position || {};
  const detailContainer = document.getElementById('cycleDetail');
  if (detailContainer) {
    detailContainer.innerHTML = `
      <div class="cycle-detail-item">
        <div class="cycle-detail-label">当前阶段</div>
        <div class="cycle-detail-value">${pos.phase_label || '—'}</div>
      </div>
      <div class="cycle-detail-item">
        <div class="cycle-detail-label">触发信号</div>
        <div class="cycle-detail-value">${pos.signal_count || 0}/${pos.signal_count_total || 0}个</div>
      </div>
      <div class="cycle-detail-item">
        <div class="cycle-detail-label">距上轮底部</div>
        <div class="cycle-detail-value">${pos.days_since_bottom || 0}天</div>
      </div>
      <div class="cycle-detail-item">
        <div class="cycle-detail-label">上轮底部</div>
        <div class="cycle-detail-value">${pos.historical_cycle_bottom || '—'}</div>
      </div>
      <div class="cycle-detail-item">
        <div class="cycle-detail-label">上轮顶部</div>
        <div class="cycle-detail-value">${pos.historical_cycle_peak || '—'}</div>
      </div>
      <div class="cycle-detail-item">
        <div class="cycle-detail-label">恢复节奏</div>
        <div class="cycle-detail-value">${pos.recovery_pace === 'normal' ? '正常' : pos.recovery_pace === 'fast' ? '偏快' : '偏慢'}</div>
      </div>
    `;
  }

  // 阶段描述
  const descEl = document.getElementById('cycleDesc');
  if (descEl) {
    descEl.textContent = data.cycle_position?.phase_description || '';
  }
}

// ===== 渲染：操作建议 =====

function renderSuggestions(data) {
  const container = document.getElementById('suggestionsList');
  if (!container || !data.action_suggestions) return;

  container.innerHTML = '';

  for (const sug of data.action_suggestions) {
    const deep = sug.deep_analysis || {};
    const sugId = 'suggestion-' + sug.priority;

    const card = document.createElement('div');
    card.className = 'suggestion-card';
    card.innerHTML = `
      <div class="suggestion-header">
        <span class="priority-badge priority-${sug.priority}">${sug.priority}</span>
        <span class="suggestion-action">${sug.action}</span>
      </div>
      <div class="suggestion-rationale">${sug.rationale || ''}</div>
      <div class="deep-analysis" id="${sugId}">
        <div class="deep-analysis-title">
          📊 深度分析
          <button class="toggle-btn" onclick="this.closest('.deep-analysis').classList.remove('active')">收起</button>
        </div>
        <div class="deep-analysis-content">
          ${deep.cycle_position_note ? `<dl><dt>周期位置</dt><dd>${deep.cycle_position_note}</dd></dl>` : ''}
          ${deep.target_price_range ? `<dl><dt>目标区间</dt><dd>${deep.target_price_range}</dd></dl>` : ''}
          ${deep.risk_points ? `<dl><dt>风险点</dt><dd>${deep.risk_points}</dd></dl>` : ''}
          ${deep.historical_comparison ? `<dl><dt>历史对照</dt><dd>${deep.historical_comparison}</dd></dl>` : ''}
          ${!deep.cycle_position_note && !deep.target_price_range && !deep.risk_points && !deep.historical_comparison
            ? '<p style="color:#999">暂无深度分析数据</p>' : ''}
        </div>
      </div>
      <div class="deep-analysis-toggle" style="text-align:right;margin-top:4px">
        <button class="toggle-btn" onclick="toggleDeepAnalysis('${sugId}')">展开深度分析 ▾</button>
      </div>
    `;

    container.appendChild(card);
  }
}

function toggleDeepAnalysis(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('active');
  const btn = el.parentElement.querySelector('.deep-analysis-toggle .toggle-btn');
  if (btn) {
    btn.textContent = el.classList.contains('active') ? '收起 ▲' : '展开深度分析 ▾';
  }
}

// ===== 渲染：知识库 =====

function renderKnowledgeBase() {
  const container = document.getElementById('kbTermsList');
  if (!container) return;

  const glossary = INTERPRETATIONS.glossary || {};
  const framework = INTERPRETATIONS.decision_framework || {};

  // 术语
  const termsHtml = Object.entries(glossary).map(([k, v]) => `
    <div class="kb-term-card">
      <div class="kb-term-name">${v.term || k}</div>
      <div class="kb-term-def">${v.definition || ''}</div>
      ${v.note ? `<div class="kb-term-note">💡 ${v.note}</div>` : ''}
    </div>
  `).join('');

  // 判断框架
  const fwHtml = Object.entries(framework).map(([k, v]) => `
    <div class="kb-framework-card">
      <div class="fw-label">${v.label || k}</div>
      <div class="fw-focus">重点：${v.focus || ''}</div>
      <div class="fw-output">输出：${v.output || ''}</div>
    </div>
  `).join('');

  document.getElementById('kbTermsList').innerHTML = termsHtml;
  document.getElementById('kbFrameworkList').innerHTML = fwHtml;
}

// 知识库折叠
function toggleKnowledgeBase() {
  const kb = document.querySelector('.knowledge-base');
  if (kb) kb.classList.toggle('open');
}

// ===== 数据来源标签 =====

function renderDataSource(data) {
  const el = document.getElementById('dataTimestamp');
  if (!el) return;
  const isMock = data.data_source === 'mock' || data.data_source === 'embedded_mock';
  el.innerHTML = `
    ${data.update_date || ''} ${data.update_time || ''}
    ${isMock ? '<span class="mock-badge">MOCK数据</span>' : ''}
  `;
}

// ===== 主入口 =====

async function init() {
  // 显示加载
  const mask = document.getElementById('loadingMask');
  if (mask) mask.classList.remove('hidden');

  const data = await loadData();
  rawData = data;

  // 渲染各模块
  renderDataSource(data);
  renderAlertBar(data);
  renderChainIndicators(data.breeding_chain, 'breedingIndicators');
  renderChainIndicators(data.frozen_chain, 'frozenIndicators');
  renderLinkageMatrix(data);
  renderCyclePosition(data);
  renderSuggestions(data);
  renderKnowledgeBase();

  // 隐藏加载
  if (mask) mask.classList.add('hidden');
}

// ===== 启动 =====
document.addEventListener('DOMContentLoaded', init);
