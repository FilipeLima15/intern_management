// charts.js — Dashboard Executivo Premium (Completo & Corrigido)
// Inclui: Gráficos, Modal, Previsão e Lógica de Heatmap

// --- FIREBASE IMPORTS ---
import { db, auth } from "./firebase-config.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Coluna "Estudada?" (no script.js é MaterialsStart(0) + 3 = 3)
const STUDIED_COL = 3;

// ---- Estado global ----
let currentUserUID = null;
let debounceTimer = null;
let lastResults = []; // Dados processados
let activeChartInstances = []; // Para destruir gráficos antigos antes de criar novos

// NOVO: Data base para navegação do Heatmap (começa hoje)
let heatmapDate = new Date();

let uiState = {
  search: '',
  sort: 'pctDesc',
  minPct: 0,
  hideEmpty: false,
  heatmapView: 'year' // 'year' ou 'month'
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

// ---- LÓGICA DE DADOS ----

// 1. Busca histórico para calcular ritmo (Previsão e Heatmap)
async function getHistory() {
  try {
    const historyRef = ref(db, `users/${currentUserUID}/changeLogs`);
    const snapshot = await get(historyRef);
    if (!snapshot.exists()) return [];
    return Object.values(snapshot.val());
  } catch (e) {
    console.error("Erro ao ler histórico:", e);
    return [];
  }
}

// 2. Busca e processa dados das matérias
async function computeAggregates(){
  if (!currentUserUID) return [];

  const results = [];
  try {
    const userRef = ref(db, `users/${currentUserUID}`);
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
        const userData = snapshot.val();
        const subjectsMap = userData.subjects || {}; 
        const sheetsMap = userData.sheets || {};     

        Object.keys(subjectsMap).forEach(subjectName => {
            const defaultRows = subjectsMap[subjectName] || [];
            const sheetData = sheetsMap[subjectName] || {};

            // Prioriza linhas salvas na sheet, senão usa o default
            const rows = (Array.isArray(sheetData._rows)) ? sheetData._rows : defaultRows;
            
            const total = rows.length;
            let studiedCount = 0;

            for (let i = 0; i < total; i++) {
                const key = `r${i}_c${STUDIED_COL}`; 
                let raw = String(sheetData[key] || '').trim().toLowerCase();
                if (raw === 'sim' || raw === 'done' || raw === 'ok' || raw === 'concluído') {
                    studiedCount++;
                }
            }

            const pct = total ? Math.round(100 * studiedCount / total) : 0;
            
            results.push({ 
                name: subjectName, 
                pct, 
                total, 
                studiedCount, 
                rawData: sheetData,
                realRows: rows 
            });
        });
    }
  } catch (error) {
    console.error("Erro no Firebase:", error);
  }
  return results;
}

// ---- FILTROS E ORDENAÇÃO ----
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
    if (by === 'pctDesc') return b.pct - a.pct || a.name.localeCompare(b.name);
    if (by === 'pctAsc')  return a.pct - b.pct || a.name.localeCompare(b.name);
    if (by === 'nameAsc') return a.name.localeCompare(b.name);
    if (by === 'totalDesc')return b.total - a.total;
    return 0;
  });
  return list;
}

// ---- RENDERIZAÇÃO ----

function renderKPIs(results){
  const totalSubjects = results.length;
  const overallAvg = Math.round(results.reduce((acc,r)=>acc + (r.pct||0),0) / (totalSubjects||1));
  const high = results.filter(r=>r.pct>=70).length;
  const pending = results.filter(r=>r.pct<70 && r.total>0).length;

  const setVal = (id, val) => { const el = document.getElementById(id); if(el) el.innerText = val; };
  
  setVal('statAvg', overallAvg + '%');
  setVal('statHigh', high);
  setVal('statPending', pending);
  setVal('statSubjects', totalSubjects);

  const summaryEl = document.getElementById('summary');
  if(summaryEl) {
      if(results.length === 0) summaryEl.style.display = 'none';
      else {
          summaryEl.style.display = 'block';
          summaryEl.innerHTML = `Mostrando <strong>${results.length}</strong> matérias. Média global: <strong>${overallAvg}%</strong>.`;
      }
  }
}

// Calcula e exibe a previsão (Strategy Banner)
async function updatePredictionBanner(results) {
  const predText = document.getElementById('predictionText');
  const predDate = document.getElementById('predictionDate');
  if(!predText || !predDate) return;

  // Total pendente
  const totalItems = results.reduce((acc, r) => acc + r.total, 0);
  const totalDone = results.reduce((acc, r) => acc + r.studiedCount, 0);
  const remaining = totalItems - totalDone;

  if (remaining <= 0) {
      predText.innerText = "Parabéns! Edital Zerado.";
      predDate.innerText = "CONCLUÍDO";
      predDate.style.color = "#10b981";
      return;
  }

  // Busca histórico dos últimos 30 dias
  const logs = await getHistory();
  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);

  // Filtra logs de "conclusão" (checks ou status done)
  const recentDone = logs.filter(l => {
      const logDate = new Date(l.time);
      const isRecent = logDate >= thirtyDaysAgo;
      const isDoneAction = (
          (l.newValue === 'ok' || l.newValue === 'done' || l.newValue === 'concluído' || l.newValue === 'sim') &&
          (l.oldValue !== 'ok' && l.oldValue !== 'done' && l.oldValue !== 'concluído' && l.oldValue !== 'sim')
      );
      return isRecent && isDoneAction;
  });

  const itemsDoneIn30Days = recentDone.length;
  
  // Cálculo da velocidade (itens por dia)
  const dailyPace = itemsDoneIn30Days / 30;

  if (dailyPace <= 0.1) {
      predText.innerHTML = `Faltam <strong>${remaining}</strong> tópicos. <br>Estude mais alguns dias para gerar a previsão.`;
      predDate.innerText = "--/--/----";
      predDate.style.color = "#9ca3af";
  } else {
      const daysToFinish = Math.ceil(remaining / dailyPace);
      const finishDate = new Date();
      finishDate.setDate(now.getDate() + daysToFinish);
      
      const day = String(finishDate.getDate()).padStart(2, '0');
      const month = String(finishDate.getMonth() + 1).padStart(2, '0');
      const year = finishDate.getFullYear();

      predText.innerHTML = `Ritmo atual: ~<strong>${itemsDoneIn30Days}</strong> tópicos/mês (${remaining} restantes).`;
      predDate.innerText = `${day}/${month}/${year}`;
      predDate.style.color = "#7c3aed";
  }
}

// ---- LÓGICA DO HEATMAP (HÍBRIDO: ANO/MÊS) ----
async function renderHeatmap() {
  const container = document.getElementById('heatmapGrid');
  const monthContainer = document.getElementById('heatmapMonths');
  const labelPeriod = document.getElementById('hmPeriodLabel');
  
  if(!container) return;

  // 1. Busca Histórico
  const logs = await getHistory(); 
  const counts = {};
  logs.forEach(l => {
      const dateKey = new Date(l.time).toISOString().split('T')[0];
      counts[dateKey] = (counts[dateKey] || 0) + 1;
  });

  // Limpa containers
  container.innerHTML = '';
  if(monthContainer) monthContainer.innerHTML = '';

  // --- MODO DE VISUALIZAÇÃO ---
  
  if (uiState.heatmapView === 'month') {
      // === MODO MÊS (CALENDÁRIO) ===
      container.className = 'heatmap-grid view-month'; // Ativa CSS de grade 7 colunas
      if(monthContainer) monthContainer.style.display = 'none'; // Esconde barra de meses do topo

      // Atualiza Label (Ex: Janeiro 2026)
      const monthName = heatmapDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      if(labelPeriod) labelPeriod.innerText = monthName.charAt(0).toUpperCase() + monthName.slice(1);

      // Lógica de Calendário
      const year = heatmapDate.getFullYear();
      const month = heatmapDate.getMonth();
      
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      
      // Preencher dias vazios antes do dia 1 (para alinhar Domingo=0)
      const startDayOfWeek = firstDay.getDay(); 
      let html = '';

      // Células vazias iniciais
      for(let i=0; i<startDayOfWeek; i++) {
          html += `<div class="day-square level-0" style="opacity:0; pointer-events:none;"></div>`;
      }

      // Dias do mês
      for(let d=1; d<=lastDay.getDate(); d++) {
          const current = new Date(year, month, d);
          const dateKey = current.toISOString().split('T')[0];
          const count = counts[dateKey] || 0;
          
          let level = 0;
          if (count > 0) level = 1; if (count >= 3) level = 2; if (count >= 6) level = 3; if (count >= 10) level = 4;
          
          // No modo mês, mostramos o número do dia dentro do quadrado
          html += `<div class="day-square level-${level}" data-title="${count} atividades em ${d}/${month+1}">${d}</div>`;
      }
      container.innerHTML = html;

  } else {
      // === MODO ANO (GITHUB STYLE) ===
      container.className = 'heatmap-grid'; // Volta para CSS padrão
      if(monthContainer) monthContainer.style.display = 'flex';
      if(labelPeriod) labelPeriod.innerText = "Últimos 12 Meses";

      const today = new Date();
      const dayOfWeek = today.getDay(); 
      const startDate = new Date(today);
      startDate.setDate(today.getDate() - 364 - dayOfWeek);

      let htmlSquares = '';
      let htmlMonths = '';
      
      const current = new Date(startDate);
      const limitDate = new Date(today);
      limitDate.setHours(23, 59, 59, 999);

      let weekIndex = 0;
      let lastMonth = -1;

      while (current <= limitDate) {
          const dateKey = current.toISOString().split('T')[0];
          const count = counts[dateKey] || 0;
          let level = 0;
          if (count > 0) level = 1; if (count >= 3) level = 2; if (count >= 6) level = 3; if (count >= 10) level = 4;
          const dateStr = current.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
          
          htmlSquares += `<div class="day-square level-${level}" data-title="${count} ativ. em ${dateStr}"></div>`;

          // Rótulos dos meses
          const currentMonth = current.getMonth();
          const currentDay = current.getDay(); 
          if (currentDay === 0) { 
              if (currentMonth !== lastMonth) {
                  const leftPos = weekIndex * 16;
                  const mName = current.toLocaleDateString('pt-BR', { month: 'short' }).replace('.','');
                  htmlMonths += `<div class="month-label" style="left: ${leftPos}px">${mName}</div>`;
                  lastMonth = currentMonth;
              }
              weekIndex++;
          }
          current.setDate(current.getDate() + 1);
      }
      
      container.innerHTML = htmlSquares;
      if(monthContainer) monthContainer.innerHTML = htmlMonths;
      
      // Scroll para o fim (data atual)
      setTimeout(() => {
          const scrollWrapper = document.getElementById('heatmapScroll');
          if(scrollWrapper) scrollWrapper.scrollLeft = scrollWrapper.scrollWidth;
      }, 100);
  }
}

function renderList(results){
  const container = document.getElementById('bars');
  if(!container) return;
  container.innerHTML = '';

  if (results.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
            <i class="fa-regular fa-folder-open"></i>
            <p>Nenhuma matéria encontrada com os filtros atuais.</p>
        </div>`;
      return;
  }

  results.forEach(r => {
    let barClass = 'med';
    if(r.pct >= 70) barClass = 'high';
    else if(r.pct < 40) barClass = 'low';

    const div = document.createElement('div');
    div.className = 'subject-row';
    div.innerHTML = `
        <div class="subject-info">
            <div class="subject-name">${r.name}</div>
            <div class="subject-meta">
                <span class="badge">Total: ${r.total}</span>
                <span>Concluídos: ${r.studiedCount}</span>
            </div>
        </div>
        
        <div class="bar-container">
            <div class="bar-fill ${barClass}" style="width: ${r.pct}%"></div>
        </div>

        <div class="stats-numbers">
            <div class="percentage">${r.pct}%</div>
        </div>

        <button class="btn-detail" title="Abrir Detalhes"><i class="fa-solid fa-chevron-right"></i></button>
    `;

    div.addEventListener('click', () => openDetailModal(r));
    container.appendChild(div);
  });
}

// ---- MODAL DE DETALHES (PREMIUM) ----
function openDetailModal(subjectData) {
    const modal = document.getElementById('detailModal');
    const title = document.getElementById('detailTitle');
    const body = document.getElementById('detailBody');
    
    if(!modal || !body) return;

    title.innerText = subjectData.name;
    body.innerHTML = ''; // Limpa conteúdo anterior

    // 1. Cria abas
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'modal-tabs';
    tabsContainer.innerHTML = `
        <button class="modal-tab-btn active" data-target="tab-materials">Materiais</button>
        <button class="modal-tab-btn" data-target="tab-revisions">Revisões</button>
        <button class="modal-tab-btn" data-target="tab-exercises">Exercícios</button>
        <button class="modal-tab-btn" data-target="tab-progress">Progresso</button>
    `;
    body.appendChild(tabsContainer);

    // 2. Cria containers de conteúdo
    const contentContainer = document.createElement('div');
    const tabMat = document.createElement('div'); tabMat.id = 'tab-materials'; tabMat.className = 'tab-pane active'; contentContainer.appendChild(tabMat);
    const tabRev = document.createElement('div'); tabRev.id = 'tab-revisions'; tabRev.className = 'tab-pane'; contentContainer.appendChild(tabRev);
    const tabExe = document.createElement('div'); tabExe.id = 'tab-exercises'; tabExe.className = 'tab-pane'; contentContainer.appendChild(tabExe);
    const tabPrg = document.createElement('div'); tabPrg.id = 'tab-progress'; tabPrg.className = 'tab-pane'; contentContainer.appendChild(tabPrg);
    body.appendChild(contentContainer);

    // 3. Processa dados
    const data = subjectData.rawData || {};
    const totalRows = subjectData.realRows.length;
    const num = (v) => Number(String(v||'').replace(',','.')) || 0;
    
    // -- Materiais --
    const matCounts = [0,0,0]; 
    const matCols = [0,1,2];
    for(let i=0; i<totalRows; i++){
        matCols.forEach((c, idx) => {
            if(String(data[`r${i}_c${c}`]||'').toLowerCase().trim() === 'ok') matCounts[idx]++;
        });
    }

    // -- Revisões --
    const revCounts = [0,0,0,0];
    const revCols = [4,5,6,7];
    for(let i=0; i<totalRows; i++){
        revCols.forEach((c, idx) => {
            if(String(data[`r${i}_c${c}`]||'').toLowerCase().trim() === 'ok') revCounts[idx]++;
        });
    }

// -- Exercícios --
    function calcExStats(startCol, isCespe = false) {
        let tQ=0, tA=0, tE=0, tB=0;
        
        for(let i=0; i<totalRows; i++){
            tQ += num(data[`r${i}_c${startCol}`]);     // Qtd
            tA += num(data[`r${i}_c${startCol+1}`]);   // Acertos
            
            if (isCespe) {
                // CESPE: Qtd(0) | Acertos(1) | Brancas(2) | Erros(3)
                // O erro está na coluna start+3
                tE += num(data[`r${i}_c${startCol+3}`]);
                
                // Brancas podem ser lidas da coluna 2 ou calculadas
                // Vamos calcular para garantir consistência
            } else {
                // MULT: Qtd(0) | Acertos(1) | Erros(2)
                tE += num(data[`r${i}_c${startCol+2}`]);
            }
        }
        
        // Calcula Brancas Automaticamente para ambos (Q - (A + E))
        tB = Math.max(0, tQ - (tA + tE));
        
        return { totalQ: tQ, totalA: tA, totalE: tE, totalBlank: tB };
    }

    // Grupo 1: Múltipla Escolha (Começa na col 8)
    const ex1 = calcExStats(8, false); 
    const pctAcertosEx1 = ex1.totalQ ? Math.round((ex1.totalA / ex1.totalQ) * 100) : 0;

    // Grupo 2: Cespe (Começa na col 12)
    const ex2 = calcExStats(12, true); // Passamos true para ativar lógica Cespe
    const scoreLiquido = ex2.totalA - ex2.totalE; 
    
    // Cálculo da porcentagem líquida
    const pctLiquido = ex2.totalQ ? Math.round((scoreLiquido / ex2.totalQ) * 100) : 0;
    
    let scoreColor = 'text-gray-500';
    if(pctLiquido >= 60) scoreColor = 'text-green-600';
    else if(pctLiquido > 0) scoreColor = 'text-blue-600';
    else if(pctLiquido < 0) scoreColor = 'text-red-600';

    // 4. Renderiza Conteúdo
    tabMat.innerHTML = `<div class="chart-wrapper"><canvas id="chartMaterials"></canvas></div>`;
    tabRev.innerHTML = `<div class="chart-wrapper"><canvas id="chartRevisions"></canvas></div>`;
    
    tabExe.innerHTML = `
        <div class="glass-panel" style="padding:15px; margin-bottom:20px; border-left: 4px solid #3b82f6;">
            <h4 style="margin:0 0 10px 0; color:#1e293b; font-weight:700;">Múltipla Escolha</h4>
            <div class="stats-grid">
                <div class="mini-stat-card"><span class="mini-stat-value text-slate-700">${ex1.totalQ}</span><span class="mini-stat-label">Questões</span></div>
                <div class="mini-stat-card"><span class="mini-stat-value text-green-600">${pctAcertosEx1}%</span><span class="mini-stat-label">Aproveitamento</span></div>
            </div>
            <div class="chart-wrapper" style="height:250px; margin-top:10px;"><canvas id="chartEx1"></canvas></div>
        </div>
        <div class="glass-panel" style="padding:15px; border-left: 4px solid #f59e0b;">
            <h4 style="margin:0 0 10px 0; color:#1e293b; font-weight:700;">Certo / Errado (Método Líquido)</h4>
            <div class="stats-grid">
                <div class="mini-stat-card"><span class="mini-stat-value ${scoreColor}">${scoreLiquido}</span><span class="mini-stat-label">Saldo Líquido</span></div>
                <div class="mini-stat-card"><span class="mini-stat-value ${scoreColor}">${pctLiquido}%</span><span class="mini-stat-label">Do Total (${ex2.totalQ})</span></div>
            </div>
            <div class="chart-wrapper" style="height:250px; margin-top:10px;"><canvas id="chartEx2"></canvas></div>
        </div>`;

    tabPrg.innerHTML = `
        <div class="chart-wrapper"><canvas id="chartProgress"></canvas></div>
        <p style="text-align:center; color:#94a3b8; font-size:12px; margin-top:10px;">Comparativo de pilares do estudo.</p>`;

    // 5. Inicializa Gráficos
    setTimeout(() => {
        activeChartInstances.forEach(c => c.destroy());
        activeChartInstances = [];

        const ctxMat = document.getElementById('chartMaterials').getContext('2d');
        activeChartInstances.push(new Chart(ctxMat, {
            type: 'bar',
            data: {
                labels: ['Videoaula', 'PDF/Livro', 'Lei Seca'],
                datasets: [{ label: 'Tópicos', data: matCounts, backgroundColor: ['#3b82f6', '#8b5cf6', '#ef4444'], borderRadius: 6, barThickness: 40 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: {display:false} } }
        }));

        const ctxRev = document.getElementById('chartRevisions').getContext('2d');
        activeChartInstances.push(new Chart(ctxRev, {
            type: 'line',
            data: {
                labels: ['24h', '7 Dias', '15 Dias', '30 Dias'],
                datasets: [{ label: 'Feitas', data: revCounts, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true, tension: 0.4 }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: {display:false} } }
        }));

        const ctxEx1 = document.getElementById('chartEx1').getContext('2d');
        activeChartInstances.push(new Chart(ctxEx1, {
            type: 'doughnut',
            data: { labels: ['Acertos', 'Erros', 'Branco'], datasets: [{ data: [ex1.totalA, ex1.totalE, ex1.totalBlank], backgroundColor: ['#10b981', '#ef4444', '#cbd5e1'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, cutout: '65%' }
        }));

        const ctxEx2 = document.getElementById('chartEx2').getContext('2d');
        activeChartInstances.push(new Chart(ctxEx2, {
            type: 'doughnut',
            data: { labels: ['Acertos', 'Erros', 'Branco'], datasets: [{ data: [ex2.totalA, ex2.totalE, ex2.totalBlank], backgroundColor: ['#10b981', '#ef4444', '#cbd5e1'], borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } }, cutout: '65%' }
        }));

        const ctxPrg = document.getElementById('chartProgress').getContext('2d');
        const total = totalRows || 1;
        const matPct = Math.round((matCounts.reduce((a,b)=>a+b,0) / (total*3)) * 100);
        const revPct = Math.round((revCounts.reduce((a,b)=>a+b,0) / (total*4)) * 100);
        
        activeChartInstances.push(new Chart(ctxPrg, {
            type: 'radar',
            data: {
                labels: ['Teoria', 'Revisão', 'Exercícios (M.E.)', 'Exercícios (C/E)'],
                datasets: [{ label: 'Balanço', data: [matPct, revPct, pctAcertosEx1, Math.max(0, pctLiquido)], backgroundColor: 'rgba(2, 132, 199, 0.2)', borderColor: '#0284c7', pointBackgroundColor: '#0284c7' }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { r: { suggestedMin: 0, suggestedMax: 100 } } }
        }));
    }, 100);

    // 6. Lógica de Troca de Abas
    const btns = tabsContainer.querySelectorAll('.modal-tab-btn');
    const panes = contentContainer.querySelectorAll('.tab-pane');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            btns.forEach(b => b.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
        });
    });

    modal.classList.add('active');
}

// ---- CONSTRUÇÃO PRINCIPAL (ATUALIZADA) ----
async function buildCharts() {
  const container = document.getElementById('bars');
  if(container) container.innerHTML = '<div style="text-align:center; padding:40px; color:#64748b"><i class="fa-solid fa-circle-notch fa-spin fa-2x"></i><p style="margin-top:10px">Analisando dados...</p></div>';

  if (!currentUserUID) return;

  // 1. Carrega dados das matérias
  const results = await computeAggregates();
  lastResults = results.slice();

  // 2. Renderiza KPIs (Cards do topo)
  renderKPIs(results);
  
  // 3. Renderiza Previsão (Bola de Cristal)
  await updatePredictionBanner(results);

  // 4. Renderiza Heatmap (NOVO)
  await renderHeatmap();
  
  // 5. Renderiza Lista de Matérias
  const filtered = applyFiltersAndSort(results);
  renderList(filtered);
}

// ---- INICIALIZAÇÃO ----
function init(){
  
  // Toggle Genérico (Previsão e Heatmap)
  const setupToggle = (headerId, contentId, arrowId, hintId) => {
      const header = document.getElementById(headerId);
      const content = document.getElementById(contentId);
      const arrow = document.getElementById(arrowId);
      const hint = document.getElementById(hintId);
      if(header && content) {
          header.addEventListener('click', () => {
              const isHidden = content.style.display === 'none';
              if(isHidden) {
                  content.style.display = 'block';
                  if(arrow) arrow.style.transform = 'rotate(180deg)';
                  if(hint) hint.innerText = 'Recolher';
              } else {
                  content.style.display = 'none';
                  if(arrow) arrow.style.transform = 'rotate(0deg)';
                  if(hint) hint.innerText = 'Expandir';
              }
          });
      }
  };
  setupToggle('strategyHeader', 'strategyContent', 'strategyArrow', 'strategyHint');
  setupToggle('heatmapHeader', 'heatmapContent', 'heatmapArrow', 'heatmapHint');

  // --- CONTROLES DO HEATMAP (NOVO) ---
  
  // Alternar Mês/Ano
  document.getElementById('hmViewMonth')?.addEventListener('click', (e) => {
      uiState.heatmapView = 'month';
      // Atualiza estilo dos botões
      document.getElementById('hmViewMonth').classList.add('active');
      document.getElementById('hmViewYear').classList.remove('active');
      renderHeatmap();
  });

  document.getElementById('hmViewYear')?.addEventListener('click', (e) => {
      uiState.heatmapView = 'year';
      document.getElementById('hmViewYear').classList.add('active');
      document.getElementById('hmViewMonth').classList.remove('active');
      renderHeatmap();
  });

  // Navegar (Voltar/Avançar)
  document.getElementById('hmBtnPrev')?.addEventListener('click', (e) => {
      e.stopPropagation(); // Evita fechar o accordion se clicar
      if (uiState.heatmapView === 'month') {
          // Volta 1 mês
          heatmapDate.setMonth(heatmapDate.getMonth() - 1);
          renderHeatmap();
      }
  });

  document.getElementById('hmBtnNext')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (uiState.heatmapView === 'month') {
          // Avança 1 mês
          heatmapDate.setMonth(heatmapDate.getMonth() + 1);
          renderHeatmap();
      }
  });


  // --- LISTENERS PADRÃO ---
  document.getElementById('searchInput')?.addEventListener('input', e => {
      uiState.search = e.target.value;
      if(debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(buildCharts, 300);
  });

  document.getElementById('sortSelect')?.addEventListener('change', e => {
      uiState.sort = e.target.value;
      buildCharts();
  });

  document.getElementById('hideEmpty')?.addEventListener('change', e => {
      uiState.hideEmpty = e.target.checked;
      buildCharts();
  });

  document.getElementById('refreshCharts')?.addEventListener('click', buildCharts);
  
  document.getElementById('exportJSON')?.addEventListener('click', () => {
      downloadBlob('estatisticas.json', 'application/json', JSON.stringify(lastResults, null, 2));
  });

  document.getElementById('closeBtn')?.addEventListener('click', () => {
      try { parent.postMessage({ action:'closeChartsOverlay' }, '*'); } catch(e){}
  });

  const modal = document.getElementById('detailModal');
  document.getElementById('detailClose')?.addEventListener('click', () => {
      if(modal) modal.classList.remove('active');
  });
  
  if(modal) {
      modal.addEventListener('click', (e) => {
          if(e.target === modal) modal.classList.remove('active');
      });
  }

  // Monitoramento de Auth
  onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUID = user.uid;
        buildCharts();
    } else {
        currentUserUID = null;
        renderKPIs([]);
        renderList([]);
    }
  });
}

// Start
init();
