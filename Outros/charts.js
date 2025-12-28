// charts.js — UI modernizada + filtros, exportação e detalhes
// 100% client-side, sem tema escuro, cores integradas ao styles.css

const DB_NAME = 'StudyTrackerDB';
const DB_VERSION = 2;
const STORE_SUBJECTS = 'subjects';
const STORE_SHEETS = 'sheets';

// Coluna "Estudada?" (0-based)
const STUDIED_COL = 3;

// ---- Estado global ----
let db = null;
let debounceTimer = null;
let lastResults = []; // agregados por matéria
let uiState = {
  search: '',
  sort: 'pctDesc',
  minPct: 0,
  hideEmpty: false
};

// ---- Utilidades ----
function normalizeString(s){ 
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); 
}
function clamp(n, min, max){ return Math.min(max, Math.max(min, n)); }
function downloadBlob(filename, mime, text){
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=> URL.revokeObjectURL(url), 1000);
}
function getCssVar(name, fallback){ 
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; 
}

// ---- IndexedDB ----
function initDB() {
  return new Promise((res, rej)=>{
    const rq = indexedDB.open(DB_NAME, DB_VERSION);
    rq.onerror = e=> rej(e.target.error);
    rq.onsuccess = e=> { db = e.target.result; res(db); };
  });
}
function dbGetAll(storeName){
  return new Promise((res, rej)=>{
    try {
      const tx = db.transaction([storeName],'readonly');
      const st = tx.objectStore(storeName);
      const rq = st.getAll();
      rq.onsuccess = ()=> res(rq.result || []);
      rq.onerror = e=> rej(e.target.error);
    } catch(err){ res([]); }
  });
}

// ---- Pies ----
function makePieSVG(values, colors, size=120){
  const total = values.reduce((a,b)=>a+b,0) || 1;
  let acc = 0;
  const cx = size/2, cy = size/2, r = size/2 - 4;
  const paths = values.map((v, idx) => {
    const start = acc / total * Math.PI * 2 - Math.PI/2;
    acc += v;
    const end = acc / total * Math.PI * 2 - Math.PI/2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    return `<path d="${d}" fill="${colors[idx]||'#ccc'}"></path>`;
  });
  return `<svg class="pie-svg" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${paths.join('')}</svg>`;
}

// ---- Construção principal ----
async function computeAggregates(){
  const subs = await dbGetAll(STORE_SUBJECTS);
  const sheets = await dbGetAll(STORE_SHEETS);

  const results = [];
  for (const s of subs){
    const name = s.name;
    const rec = sheets.find(x => x.subject === name);
    const data = rec && rec.data ? rec.data : {};
    const rows = Array.isArray(data._rows) ? data._rows : [];
    const total = rows.length;
    let studiedCount = 0;
    for (let i=0;i<total;i++){
      const key = `r${i}_c${STUDIED_COL}`;
      const raw = String(data[key] || '').trim();
      const norm = normalizeString(raw);
      if (norm === 'sim') studiedCount++;
    }
    const pct = total ? Math.round(100 * studiedCount / total) : 0;
    results.push({ name, pct, total, studiedCount, rawData: data });
  }
  return results;
}

function applyFiltersAndSort(results){
  const q = normalizeString(uiState.search);
  let list = results.filter(r=>{
    if (uiState.hideEmpty && r.total === 0) return false;
    if (r.pct < uiState.minPct) return false;
    if (!q) return true;
    return normalizeString(r.name).includes(q);
  });

  const by = uiState.sort;
  list.sort((a,b)=>{
    if (by === 'pctDesc') return (b.total===0)-(a.total===0) || b.pct - a.pct || a.name.localeCompare(b.name);
    if (by === 'pctAsc')  return (a.total===0)-(b.total===0) || a.pct - b.pct || a.name.localeCompare(b.name);
    if (by === 'nameAsc') return a.name.localeCompare(b.name);
    if (by === 'nameDesc')return b.name.localeCompare(a.name);
    if (by === 'totalDesc')return b.total - a.total || a.name.localeCompare(b.name);
    if (by === 'totalAsc') return a.total - b.total || a.name.localeCompare(b.name);
    return 0;
  });
  return list;
}

function renderSummaryNumbers(results){
  const totalSubjects = results.length;
  const overallAvg = Math.round(results.reduce((acc,r)=>acc + (r.pct||0),0) / (totalSubjects||1));
  const high = results.filter(r=>r.pct>=70).length;
  const pending = results.filter(r=>r.pct<70 && r.total>0).length;

  const $ = id => document.getElementById(id);
  const stat = (id,k,v)=>{ const el=$(id); if(!el) return; el.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`; };
  stat('statAvg','Média geral', overallAvg + '%');
  stat('statHigh','≥ 70% concluído', high);
  stat('statPending','Pendências (< 70%)', pending);
  stat('statSubjects','Matérias', totalSubjects);

  const summaryEl = document.getElementById('summary');
  summaryEl.innerHTML = `<div>Média geral considerando <strong>${totalSubjects}</strong> matérias: <strong>${overallAvg}%</strong></div>`;
}

function barColorFor(pct){
  if (pct >= 70) return getCssVar('--ok','#77b23e');
  if (pct >= 40) return getCssVar('--accent','#2e6fb3');
  return getCssVar('--low','#c62828');
}

function renderBars(results){
  const barsEl = document.getElementById('bars');
  barsEl.innerHTML = '';
  for (const r of results){
    const row = document.createElement('div');
    row.className = 'row' + (r.total === 0 ? ' no-items' : '');
    row.style.cursor = 'default';
    row.setAttribute('role','listitem');

    const labelWrap = document.createElement('div'); labelWrap.className = 'labelWrap';
    const label = document.createElement('div'); label.className = 'label'; label.textContent = r.name;
    labelWrap.appendChild(label);

    if (r.total === 0){
      const badge = document.createElement('div'); badge.className = 'badge-zero'; badge.textContent = 'SEM ITENS';
      labelWrap.appendChild(badge);
    } else {
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = `${r.pct}%`;
      labelWrap.appendChild(meta);
    }
    row.appendChild(labelWrap);

    const wrap = document.createElement('div'); wrap.className = 'barWrap';
    const bar = document.createElement('div'); bar.className = 'bar';
    bar.style.background = barColorFor(r.pct);
    bar.textContent = r.total ? (r.pct + '%') : '0%';
    wrap.appendChild(bar);
    row.appendChild(wrap);

    const counts = document.createElement('div'); counts.className = 'counts';
    counts.textContent = `${r.studiedCount}/${r.total}`;
    row.appendChild(counts);

    const actions = document.createElement('div'); actions.className = 'actions';
    const infoBtn = document.createElement('button'); infoBtn.className = 'infoBtn'; infoBtn.title = 'Detalhes da matéria'; infoBtn.setAttribute('aria-label','Abrir detalhes');
    infoBtn.innerHTML = 'ℹ️';
    actions.appendChild(infoBtn);
    row.appendChild(actions);

    barsEl.appendChild(row);

    requestAnimationFrame(()=> {
      bar.style.transition = 'width 600ms ease';
      bar.style.width = (r.pct || 0) + '%';
    });

    row.title = `${r.studiedCount} de ${r.total} itens estudados`;

    row.addEventListener('click', (ev)=>{
      if (ev.target === infoBtn || ev.target.closest('.infoBtn')) return;
      try { parent.postMessage({ action:'openSubject', subject: r.name }, '*'); }
      catch(e){ console.error(e); }
    });

    infoBtn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      openDetailModal(r.name, r.rawData || {}, r.total);
    });
  }
}

async function buildCharts() {
  const summaryEl = document.getElementById('summary');
  const barsEl = document.getElementById('bars');
  if (!summaryEl || !barsEl) return;
  summaryEl.innerHTML = 'Carregando…';
  barsEl.innerHTML = '';

  const results = await computeAggregates();
  lastResults = results.slice();

  renderSummaryNumbers(results);

  const filtered = applyFiltersAndSort(results);
  renderBars(filtered);
}

// ---- Modal de detalhes premium ----
function openDetailModal(subjectName, data, totalRows) {
  const modal = document.getElementById('detailModal');
  const body = document.getElementById('detailBody');
  const title = document.getElementById('detailTitle');
  if (!modal || !body || !title) return;
  
  // Limpar e preparar o modal
  body.innerHTML = '';
  title.textContent = subjectName;
  
  // Efeito de vidro no modal
  const detailWrap = modal.querySelector('.detail-wrap');
  detailWrap.style.background = 'rgba(255, 255, 255, 0.85)';
  detailWrap.style.backdropFilter = 'blur(12px)';
  detailWrap.style.border = '1px solid rgba(255, 255, 255, 0.5)';
  detailWrap.style.boxShadow = '0 8px 32px rgba(31, 38, 135, 0.15)';
  
  // Cálculos de materiais, revisões e exercícios
  const num = s => {
    const t = String(s||'').replace(',','.');
    const n = Number(t);
    return isFinite(n) ? n : 0;
  };

  // ---- Cálculo de materiais ----
  const materialCols = [0,1,2];
  const materialNames = ['Videoaula','Livro Digital','Lei'];
  const matCounts = [0,0,0];
  const matNA = [0,0,0];
  const rowsArr = Array.isArray(data._rows) ? data._rows : [];
  for (let i=0;i<rowsArr.length;i++){
    for (let j=0;j<materialCols.length;j++){
      const key = `r${i}_c${materialCols[j]}`;
      const raw = String(data[key] || '').trim();
      const norm = normalizeString(raw);
      if (norm === 'ok') matCounts[j]++;
      else if (norm === 'na' || norm === 'n/a') matNA[j]++;
    }
  }
  const pieColors = [getCssVar('--accent'), getCssVar('--ok'), getCssVar('--low')];

  // ---- Cálculo de revisões ----
  const revCols = [4,5,6,7];
  const revNames = ['24h','7 dias','15 dias','30 dias'];
  const revCounts = [0,0,0,0];
  const revNA = [0,0,0,0];
  for (let i=0;i<rowsArr.length;i++){
    for (let j=0;j<revCols.length;j++){
      const key = `r${i}_c${revCols[j]}`;
      const raw = String(data[key] || '').trim();
      const norm = normalizeString(raw);
      if (norm === 'ok') revCounts[j]++;
      else if (norm === 'na' || norm === 'n/a') revNA[j]++;
    }
  }

  // ---- Cálculo de exercícios ----
  function aggregateExercises(groupStart){
    let totalQ = 0, totalA = 0, totalE = 0;
    for (let i=0;i<rowsArr.length;i++){
      const q = num(data[`r${i}_c${groupStart}`]);
      const a = num(data[`r${i}_c${groupStart+1}`]);
      const e = num(data[`r${i}_c${groupStart+2}`]);
      totalQ += q; totalA += a; totalE += e;
    }
    const totalBlank = Math.max(0, totalQ - (totalA + totalE));
    return { totalQ, totalA, totalE, totalBlank };
  }
  const ex1 = aggregateExercises(8);
  const ex2 = aggregateExercises(12);

  // Função auxiliar para criar HTML de bloco de exercícios
  function createExerciseBlockHTML(title, stats) {
    const percA = stats.totalQ ? Math.round(100 * stats.totalA / stats.totalQ) : 0;
    const percE = stats.totalQ ? Math.round(100 * stats.totalE / stats.totalQ) : 0;
    const percB = stats.totalQ ? Math.round(100 * stats.totalBlank / stats.totalQ) : 0;
    
    const colors = [getCssVar('--ok'), getCssVar('--low'), getCssVar('--muted')];
    const pieHtml = makePieSVG([stats.totalA, stats.totalE, stats.totalBlank], colors, 70);
    
    return `
      <div class="detail-section glass-card">
        <div class="section-title">${title}</div>
        <div class="exercise-grid">
          <div class="small-stat">
            <div class="stat-label">Desempenho</div>
            <div class="stat-value">${percA}%</div>
            <div>Acertos: ${stats.totalA}</div>
            <div>Erros: ${stats.totalE}</div>
            <div>Em branco: ${stats.totalBlank}</div>
          </div>
          
          <div class="small-stat">
            <div class="stat-label">Distribuição</div>
            <div style="display:flex; justify-content:center; margin:10px 0">
              ${pieHtml}
            </div>
            <div class="pie-legend" style="margin-top:12px">
              <div class="legend-item">
                <span class="legend-color" style="background:${colors[0]}"></span>
                Acertos - ${stats.totalA} (${percA}%)
              </div>
              <div class="legend-item">
                <span class="legend-color" style="background:${colors[1]}"></span>
                Erros - ${stats.totalE} (${percE}%)
              </div>
              <div class="legend-item">
                <span class="legend-color" style="background:${colors[2]}"></span>
                Branco - ${stats.totalBlank} (${percB}%)
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Criar sistema de abas
  const tabsContainer = document.createElement('div');
  tabsContainer.className = 'tabs-container';
  
  const tabs = [
    { id: 'materials', name: '📚 Materiais', icon: 'book' },
    { id: 'revisions', name: '🔄 Revisões', icon: 'refresh' },
    { id: 'exercises', name: '📝 Exercícios', icon: 'edit' },
    { id: 'progress', name: '📈 Progresso', icon: 'trending-up' }
  ];
  
  const tabButtons = document.createElement('div');
  tabButtons.className = 'tab-buttons';
  
  const tabContents = document.createElement('div');
  tabContents.className = 'tab-contents';
  
  tabs.forEach(tab => {
    const button = document.createElement('button');
    button.className = 'tab-button';
    button.dataset.tab = tab.id;
    button.innerHTML = `${tab.name}`;
    
    button.addEventListener('click', () => {
      // Ativar aba clicada
      tabButtons.querySelectorAll('.tab-button').forEach(btn => 
        btn.classList.remove('active'));
      button.classList.add('active');
      
      // Mostrar conteúdo correspondente
      tabContents.querySelectorAll('.tab-content').forEach(content => 
        content.style.display = 'none');
      tabContents.querySelector(`#${tab.id}`).style.display = 'block';
    });
    
    tabButtons.appendChild(button);
    
    const content = document.createElement('div');
    content.id = tab.id;
    content.className = 'tab-content';
    content.style.display = 'none';
    tabContents.appendChild(content);
  });
  
  // Ativar primeira aba
  tabButtons.querySelector('.tab-button').classList.add('active');
  tabContents.querySelector(`#${tabs[0].id}`).style.display = 'block';
  
  body.appendChild(tabsContainer);
  tabsContainer.appendChild(tabButtons);
  tabsContainer.appendChild(tabContents);

  // Conteúdo para aba de Materiais
  const materialsContent = tabContents.querySelector('#materials');
  materialsContent.innerHTML = `
    <div class="detail-grid">
      ${materialNames.map((name, j) => {
        const denom = (totalRows || 0) - matNA[j];
        const pct = denom > 0 ? Math.round(100 * matCounts[j] / denom) : 0;
        const colors = [getCssVar('--accent'), getCssVar('--ok'), getCssVar('--low')];
        
        return `
        <div class="small-stat glass-card">
          <div class="stat-label">${name}</div>
          <div class="stat-value">${pct}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${denom?pct:0}%; background:${colors[j]}; animation: growWidth 0.8s ease-out;"></div>
          </div>
          <div class="stat-meta">
            <div>✅ ${matCounts[j]} OK</div>
            <div>⏩ ${matNA[j]} NA</div>
            <div>📊 ${denom} considerados</div>
          </div>
        </div>
        `;
      }).join('')}
    </div>
    <div class="chart-container">
      <div class="chart-title">Distribuição por tipo</div>
      <div class="pie-container">
        <div class="pie-animation">${makePieSVG([matCounts[0], matCounts[1], matCounts[2]], pieColors, 120)}</div>
        <div class="pie-legend">
          ${materialNames.map((name, idx) => `
            <div class="legend-item">
              <span class="legend-color" style="background:${pieColors[idx]}"></span>
              ${name} - ${matCounts[idx]}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Conteúdo para aba de Revisões
  const revisionsContent = tabContents.querySelector('#revisions');
  revisionsContent.innerHTML = `
    <div class="detail-grid">
      ${revNames.map((name, j) => {
        const denom = (totalRows || 0) - revNA[j];
        const pct = denom > 0 ? Math.round(100 * revCounts[j] / denom) : 0;
        
        return `
        <div class="small-stat glass-card">
          <div class="stat-label">${name}</div>
          <div class="stat-value">${pct}%</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${denom?pct:0}%; background:${getCssVar('--accent')}; animation: growWidth 0.8s ease-out;"></div>
          </div>
          <div class="stat-meta">
            <div>✅ ${revCounts[j]} OK</div>
            <div>⏩ ${revNA[j]} NA</div>
            <div>📊 ${denom} considerados</div>
          </div>
        </div>
        `;
      }).join('')}
    </div>
    <div class="chart-container">
      <div class="chart-title">Eficiência de Revisão</div>
      <div class="bar-chart">
        ${revNames.map((name, j) => {
          const denom = (totalRows || 0) - revNA[j];
          const pct = denom > 0 ? Math.round(100 * revCounts[j] / denom) : 0;
          return `
          <div class="bar-row">
            <div class="bar-label">${name}</div>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${pct}%; background: ${getCssVar('--accent')}; animation: growWidth 0.8s ${j * 0.2}s ease-out;"></div>
              <div class="bar-value">${pct}%</div>
            </div>
          </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Conteúdo para aba de Exercícios (MODIFICADO)
  const exercisesContent = tabContents.querySelector('#exercises');
  exercisesContent.innerHTML = `
    ${createExerciseBlockHTML('Exercícios (Multiplaescolha)', ex1)}
    ${createExerciseBlockHTML('Exercícios (Certo/errado)', ex2)}
  `;

  // Conteúdo para aba de Progresso (NOVO)
  const progressContent = tabContents.querySelector('#progress');
  progressContent.innerHTML = `
    <div class="progress-container">
      <div class="progress-card glass-card">
        <div class="progress-header">
          <div class="progress-title">Evolução Semanal</div>
          <div class="progress-actions">
            <button class="progress-action-btn">7d</button>
            <button class="progress-action-btn active">30d</button>
            <button class="progress-action-btn">90d</button>
          </div>
        </div>
        <div class="progress-chart">
          <canvas id="progressChart" width="400" height="200"></canvas>
        </div>
      </div>
      
      <div class="goals-container">
        <div class="goal-card glass-card">
          <div class="goal-header">
            <div class="goal-title">Metas de Estudo</div>
            <div class="goal-edit">✏️</div>
          </div>
          <div class="goal-content">
            <div class="goal-item">
              <div class="goal-label">Videoaulas</div>
              <div class="goal-progress">
                <div class="goal-track">
                  <div class="goal-fill" style="width: 65%"></div>
                </div>
                <div class="goal-value">65%</div>
              </div>
            </div>
            <div class="goal-item">
              <div class="goal-label">Exercícios</div>
              <div class="goal-progress">
                <div class="goal-track">
                  <div class="goal-fill" style="width: 42%"></div>
                </div>
                <div class="goal-value">42%</div>
              </div>
            </div>
            <div class="goal-item">
              <div class="goal-label">Revisões</div>
              <div class="goal-progress">
                <div class="goal-track">
                  <div class="goal-fill" style="width: 28%"></div>
                </div>
                <div class="goal-value">28%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Mostrar modal
  modal.classList.add('show');
  modal.setAttribute('aria-hidden','false');

  // Configurar fechamento do modal
  const closeBtn = document.getElementById('detailClose');
  const close = () => { 
    modal.classList.remove('show'); 
    modal.setAttribute('aria-hidden','true');
    window.removeEventListener('keydown', escHandler);
  };
  
  closeBtn.onclick = close;
  modal.addEventListener('click', (e) => { 
    if (e.target === modal) close();
  });
  
  function escHandler(ev){ 
    if (ev.key === 'Escape') close();
  }
  
  window.addEventListener('keydown', escHandler);
  
  // Inicializar gráfico de progresso
  setTimeout(() => {
    const ctx = document.getElementById('progressChart')?.getContext('2d');
    if (ctx) {
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'],
          datasets: [{
            label: 'Progresso',
            data: [25, 40, 60, 75],
            borderColor: getCssVar('--accent'),
            backgroundColor: 'rgba(46, 111, 179, 0.1)',
            tension: 0.3,
            fill: true
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: { callback: value => value + '%' }
            }
          }
        }
      });
    }
  }, 500);
}

// ---- Debounce/rebuild ----
function buildChartsDebounced(delay = 120){
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(()=> { buildCharts().catch(()=>{}); }, delay);
}

// ---- Mensagens do parent ----
window.addEventListener('message', (ev) => {
  const data = ev.data || {};
  if (!data || typeof data !== 'object') return;
  if (data.action === 'dataChanged' || data.action === 'parentReady' || data.action === 'requestDataRefresh') {
    buildChartsDebounced(50);
  }
}, false);

// ---- Persistência da UI ----
function loadUIState(){
  uiState.search   = localStorage.getItem('charts.search')   || '';
  uiState.sort     = localStorage.getItem('charts.sort')     || 'pctDesc';
  uiState.minPct   = clamp(Number(localStorage.getItem('charts.minPct')||0), 0, 100);
  uiState.hideEmpty= localStorage.getItem('charts.hideEmpty') === '1';
}
function syncControlsFromState(){
  const $ = id => document.getElementById(id);
  if ($('searchInput')) $('searchInput').value = uiState.search;
  if ($('sortSelect')) $('sortSelect').value = uiState.sort;
  if ($('minPct')) $('minPct').value = uiState.minPct;
  if ($('hideEmpty')) $('hideEmpty').checked = uiState.hideEmpty;
}

// ---- Exportações ----
function exportJSON(){
  const exportObj = {
    generatedAt: new Date().toISOString(),
    totals: {
      subjects: lastResults.length,
      avg: Math.round(lastResults.reduce((a,r)=>a+r.pct,0) / (lastResults.length||1))
    },
    subjects: lastResults.map(r=>({ name:r.name, pct:r.pct, total:r.total, studied:r.studiedCount }))
  };
  downloadBlob('estatisticas.json','application/json', JSON.stringify(exportObj, null, 2));
}
function exportCSV(){
  const rows = [['Materia','Pct','Estudados','Total']];
  lastResults.forEach(r=> rows.push([r.name, r.pct, r.studiedCount, r.total]));
  const csv = rows.map(r=> r.map(v=> `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  downloadBlob('estatisticas.csv','text/csv;charset=utf-8', csv);
}

// ---- Inicialização ----
async function init(){
  const $ = id => document.getElementById(id);
  loadUIState();
  syncControlsFromState();

  $('searchInput')?.addEventListener('input', e=>{
    uiState.search = e.target.value || '';
    localStorage.setItem('charts.search', uiState.search);
    buildChartsDebounced(50);
  });
  $('sortSelect')?.addEventListener('change', e=>{
    uiState.sort = e.target.value;
    localStorage.setItem('charts.sort', uiState.sort);
    buildChartsDebounced(0);
  });
  $('minPct')?.addEventListener('input', e=>{
    uiState.minPct = clamp(Number(e.target.value||0),0,100);
    localStorage.setItem('charts.minPct', uiState.minPct);
    buildChartsDebounced(80);
  });
  $('hideEmpty')?.addEventListener('change', e=>{
    uiState.hideEmpty = !!e.target.checked;
    localStorage.setItem('charts.hideEmpty', uiState.hideEmpty ? '1':'0');
    buildChartsDebounced(0);
  });

  $('exportJSON')?.addEventListener('click', exportJSON);
  $('exportCSV')?.addEventListener('click', exportCSV);
  $('refreshCharts')?.addEventListener('click', ()=> buildCharts());
  $('closeBtn')?.addEventListener('click', ()=>{ try { parent.postMessage({ action:'closeChartsOverlay' }, '*'); } catch(e){} });

  // Atalhos
  window.addEventListener('keydown', (e)=>{
    if (e.key === '/' && !e.ctrlKey && !e.metaKey){
      e.preventDefault();
      $('searchInput')?.focus();
    } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey){
      e.preventDefault();
      buildCharts();
    } else if (e.key === 'Escape'){
      const modal = document.getElementById('detailModal');
      if (modal && modal.classList.contains('show')){
        modal.classList.remove('show'); modal.setAttribute('aria-hidden','true');
      } else {
        try { parent.postMessage({ action:'closeChartsOverlay' }, '*'); } catch(e){}
      }
    }
  });

  try {
    await initDB();
    await buildCharts();
  } catch(e){
    const summaryEl = document.getElementById('summary');
    if (summaryEl) summaryEl.innerText = 'Erro ao carregar dados: ' + (e && e.message || e);
    console.error(e);
  }
}

// Start
init();