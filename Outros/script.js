// script.js (Versão Atualizada - Ícones e Popups)
// =========================================================================

import { db } from "./firebase-config.js";
import { currentUser } from "./auth.js";
import { 
    ref, set, get, remove, push, child, update 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

///////////////////////////
// DADOS INICIAIS
///////////////////////////

const DEFAULT_SUBJECTS = {
  "Matéria 1": [
    "1 - Conteúdo", "2 - Conteúdo", "3 - Conteúdo"
  ],
  "Matéria 2": [
    "1 - Conteúdo", "2 - Conteúdo", "3 - Conteúdo"
  ],
  "Matéria 3": [
    "1 - Conteúdo", "2 - Conteúdo", "3 - Conteúdo"
  ]
};

///////////////////////////
// HELPER: CAMINHO NO FIREBASE
///////////////////////////

// Garante que só acessamos dados do usuário logado
function getUserRef(path) {
    if(!currentUser) throw new Error("Usuário não logado");
    return ref(db, `users/${currentUser.uid}/${path}`);
}

function getRefPath(path) {
    if(!currentUser) return null;
    return `users/${currentUser.uid}/${path}`;
}

///////////////////////////
// CRUD FIREBASE
///////////////////////////

async function fbGet(path) {
    try {
        const snapshot = await get(getUserRef(path));
        if (snapshot.exists()) return snapshot.val();
        return null;
    } catch(e) { console.error("Erro leitura FB:", e); return null; }
}

async function fbSet(path, data) {
    try {
        await set(getUserRef(path), data);
    } catch(e) { console.error("Erro escrita FB:", e); }
}

async function fbRemove(path) {
    try {
        await remove(getUserRef(path));
    } catch(e) { console.error("Erro remoção FB:", e); }
}

async function fbPush(path, data) {
    try {
        const listRef = getUserRef(path);
        const newRef = push(listRef);
        await set(newRef, data);
    } catch(e) { console.error("Erro push FB:", e); }
}

///////////////////////////
// UTIL / NORMALIZAÇÃO
///////////////////////////

function normalizeString(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }

async function subjectExists(name){
  const map = await loadSubjectsMap();
  const norm = normalizeString(name);
  return Object.keys(map).some(k => normalizeString(k)===norm);
}

///////////////////////////
// ADAPTADORES
///////////////////////////

async function loadSubjectsMap() {
  try {
    if(!currentUser) return {};
    
    // Tenta carregar do Firebase
    const subjects = await fbGet('subjects');
    const initialized = await fbGet('appState/initialized');

    // Se vazio, inicializa com padrão
    if (!subjects) {
      if (initialized === true) return {}; // Já inicializou, mas deletou tudo
      
      // Primeira vez: Salva default no Firebase
      const initTasks = {};
      Object.entries(DEFAULT_SUBJECTS).forEach(([name, topics]) => {
          initTasks[`subjects/${name}`] = topics;
      });
      initTasks[`appState/subjectsOrder`] = Object.keys(DEFAULT_SUBJECTS);
      initTasks[`appState/initialized`] = true;
      
      await update(ref(db, `users/${currentUser.uid}`), initTasks);
      return JSON.parse(JSON.stringify(DEFAULT_SUBJECTS));
    }
    return subjects;
  } catch(e){
    console.error('Erro ao carregar matérias:', e);
    return JSON.parse(JSON.stringify(DEFAULT_SUBJECTS));
  }
}

async function loadSubjectsOrder(){
  try {
    const r = await fbGet('appState/subjectsOrder');
    return r || [];
  } catch(e){
    console.error('Erro ordem:', e);
    const keys = Object.keys(await loadSubjectsMap());
    await saveSubjectsOrder(keys);
    return keys;
  }
}

async function saveSubjectsOrder(arr){
  await fbSet('appState/subjectsOrder', arr);
}

async function loadSaved(subject){
  try {
    // No Firebase, salvamos em "sheets/NomeMateria"
    const data = await fbGet(`sheets/${subject}`);
    return data || {};
  } catch(e){ console.error(`Erro ao carregar ${subject}:`, e); return {}; }
}

async function saveSaved(subject, data, changeMeta=null){
  try {
    await fbSet(`sheets/${subject}`, data);
    if (changeMeta) await logChange(changeMeta);
    notifyCharts();
  } catch(e){ console.error(`Erro ao salvar ${subject}:`, e); }
}

///////////////////////////
// LOG / HISTÓRICO
///////////////////////////

async function logChange({subject, row, colLabel, oldValue, newValue}){
  try{
    const time = new Date().toISOString();
    await fbPush('changeLogs', { time, subject, row, colLabel, oldValue, newValue });
    // Logs atualizam em tempo real via listener no futuro, ou refresh manual agora
    renderLogs(); 
  }catch(e){ console.error('Falha ao registrar log', e); }
}

async function getLogs(){
  try {
      const logsObj = await fbGet('changeLogs');
      if(!logsObj) return [];
      // Converte objeto {key: val} para array
      return Object.values(logsObj);
  } catch(e){ console.error('Erro ao ler logs', e); return []; }
}

///////////////////////////
// DOM ELEMENTS
///////////////////////////

const subjectListEl = document.getElementById('subjectList');
const titleEl = document.getElementById('subjectTitle');
const tableContainer = document.getElementById('tableContainer');
const notesBox = document.getElementById('notesBox');
const notesPreview = document.getElementById('notesPreview');
const notesMarkdown = document.getElementById('notesMarkdown');
const previewFrame = document.getElementById('previewFrame');
const useIframe = document.getElementById('useIframe');
const newSubjectInput = document.getElementById('newSubjectInput');
const addSubjectBtn = document.getElementById('addSubjectBtn');

const subjectFilterInput = document.getElementById('subjectFilterInput');
const subjectSortSelect = document.getElementById('subjectSort');
const btnExportJSON = document.getElementById('btnExportJSON');
const btnExportCSV = document.getElementById('btnExportCSV');
const btnBackup = document.getElementById('btnBackup');

const openCharts = document.getElementById('openCharts');
const globalSearch = document.getElementById('globalSearch');
const globalResults = document.getElementById('globalResults');
const logSearch = document.getElementById('logSearch');
const logList = document.getElementById('logList');

const pomoTime = document.getElementById('pomoTime');
const pomoStart = document.getElementById('pomoStart');
const pomoReset = document.getElementById('pomoReset');
const pomoCfg = document.getElementById('pomoCfg');

///////////////////////////
// ESTADO
///////////////////////////

const COLS = {
  materialsStart: 0,
  revisionsStart: 4,
  ex1Start: 8,
  ex2Start: 12
};
const TOTAL_COLS = 16;

let subjects = {};
let subjectsOrder = [];
let subjectFilter = '';
let subjectSort = 'none';

///////////////////////////
// NOTIFICAÇÃO
///////////////////////////
function notifyCharts(){
  try {
    const iframe = document.getElementById('chartsIframe');
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ action: 'dataChanged' }, '*');
    }
  } catch (e) {}
}

///////////////////////////
// HELPERS DE ESTILO
///////////////////////////

function getProgressColorClass(percent) {
    if (percent >= 80) return 'perf-high';
    if (percent >= 60) return 'perf-med';
    return 'perf-low';
}

///////////////////////////
// LISTENERS BÁSICOS
///////////////////////////

if (subjectFilterInput) subjectFilterInput.addEventListener('input', ()=>{ subjectFilter = subjectFilterInput.value.trim(); renderSubjectList(); });
if (subjectSortSelect) subjectSortSelect.addEventListener('change', ()=>{ subjectSort = subjectSortSelect.value; renderSubjectList(); });

if (addSubjectBtn) {
  addSubjectBtn.addEventListener('click', addSubjectFlow);
  if (newSubjectInput) newSubjectInput.addEventListener('keydown', e=>{ if(e.key==='Enter') addSubjectFlow(); });
}

if (useIframe) useIframe.addEventListener('change', async ()=>{
  const active = document.querySelector('#subjectList li.active');
  if (active) await loadSubject(active.dataset.subject);
});

if (document.getElementById('notesClear')){
  document.getElementById('notesClear').addEventListener('click', async ()=>{ 
    const active = subjectListEl && subjectListEl.querySelector('li.active');
    if (!active) return;
    const name = active.dataset.subject;
    const saved = await loadSaved(name);
    saved._notes = '';
    await saveSaved(name, saved, {subject:name, row:null, colLabel:'Notas', oldValue:'(conteúdo anterior)', newValue:'(limpo)'});
    notesBox.innerHTML = '';
    notesPreview.innerHTML = '';
    notifyCharts();
  });
}

if (btnExportJSON) btnExportJSON.addEventListener('click', exportJSON);
if (btnExportCSV) btnExportCSV.addEventListener('click', exportCSV);
if (btnBackup) btnBackup.addEventListener('click', exportJSON); // Backup agora é o mesmo que export JSON

if (openCharts) openCharts.addEventListener('click', (e)=>{
  e.preventDefault();
  openChartsOverlay();
});

if (globalSearch) globalSearch.addEventListener('input', renderGlobalSearch);
if (logSearch) logSearch.addEventListener('input', renderLogs);

if (document.getElementById('deleteAllBtn')) {
  document.getElementById('deleteAllBtn').addEventListener('click', deleteAllSubjects);
}

///////////////////////////
// POMODORO
///////////////////////////
let pomoCfgState = { focus: 25, break: 5 };
let pomoState = { mode:'focus', secs: 25*60, ticking:false, timer:null };

function fmtTime(secs){ const m = Math.floor(secs/60); const s = secs%60; return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function updatePomoView(){ if (pomoTime) pomoTime.textContent = fmtTime(pomoState.secs); }
function tick(){
  if (!pomoState.ticking) return;
  if (pomoState.secs>0){ pomoState.secs--; updatePomoView(); return; }
  if (pomoState.mode==='focus'){ pomoState.mode='break'; pomoState.secs=pomoCfgState.break*60; alert('Intervalo!'); }
  else { pomoState.mode='focus'; pomoState.secs=pomoCfgState.focus*60; alert('Voltar ao foco!'); }
  updatePomoView();
}
if (pomoStart) pomoStart.addEventListener('click', ()=>{
  pomoState.ticking = !pomoState.ticking;
  pomoStart.textContent = pomoState.ticking? '⏸' : '▶';
  if (pomoState.ticking){
    if (pomoState.timer) clearInterval(pomoState.timer);
    pomoState.timer = setInterval(tick, 1000);
  } else {
    if (pomoState.timer) clearInterval(pomoState.timer);
  }
});
if (pomoReset) pomoReset.addEventListener('click', ()=>{
  pomoState.mode='focus'; pomoState.secs = pomoCfgState.focus*60; pomoState.ticking=false; updatePomoView(); if (pomoStart) pomoStart.textContent='▶';
});
if (pomoCfg) pomoCfg.addEventListener('click', ()=>{
  const f = prompt('Minutos de foco:', String(pomoCfgState.focus));
  const b = prompt('Minutos de pausa:', String(pomoCfgState.break));
  const nf = Math.max(1, Math.min(120, Number(f)||pomoCfgState.focus));
  const nb = Math.max(1, Math.min(60, Number(b)||pomoCfgState.break));
  pomoCfgState = { focus:nf, break:nb };
  if (pomoState.mode==='focus'){ pomoState.secs = nf*60; } else { pomoState.secs = nb*60; }
  updatePomoView();
});
updatePomoView();

///////////////////////////
// FUNÇÕES DE LISTA
///////////////////////////

async function renameSubject(oldName) {
  try {
    // TEXTO DO PROMPT ATUALIZADO
    const input = prompt('Alterar nome da matéria para:', oldName);
    if (input === null) return;
    const newName = (input || '').trim();
    if (!newName) return alert('Nome inválido.');
    if (normalizeString(newName) === normalizeString(oldName)) {
      if (newName === oldName) return;
      return alert('Já existe uma matéria com nome equivalente.');
    }
    const map = await loadSubjectsMap();
    if (Object.keys(map).some(k => normalizeString(k)===normalizeString(newName))) {
      return alert('Já existe uma matéria com esse nome.');
    }
    
    // Atualiza Firebase: Cria nova entrada, copia dados, deleta antiga
    const topics = map[oldName] || [];
    const sheetData = await loadSaved(oldName);
    
    const updates = {};
    updates[`subjects/${newName}`] = topics;
    updates[`subjects/${oldName}`] = null; // Delete
    updates[`sheets/${newName}`] = sheetData;
    updates[`sheets/${oldName}`] = null; // Delete
    
    await update(ref(db, `users/${currentUser.uid}`), updates);

    // Atualiza ordem
    let order = await loadSubjectsOrder();
    const idx = order.indexOf(oldName);
    if (idx!==-1) order[idx]=newName; else order.push(newName);
    await saveSubjectsOrder(order);

    subjects = await loadSubjectsMap();
    subjectsOrder = await loadSubjectsOrder();
    await renderSubjectList();
    const li = Array.from(subjectListEl.querySelectorAll('li')).find(x=>x.dataset.subject===newName);
    if (li) li.click();
    
    await logChange({subject:newName, row:null, colLabel:'Matéria', oldValue:oldName, newValue:newName});
    alert('Matéria renomeada com sucesso.');
  } catch(e){ console.error('Erro ao renomear', e); alert('Erro ao renomear (veja console).'); }
}

async function renderSubjectList() {
  if (!subjectListEl) return;
  subjects = await loadSubjectsMap();
  subjectsOrder = await loadSubjectsOrder();
  subjectListEl.innerHTML = '';

  let names = (subjectsOrder||[]).filter(name => name in subjects);

  if (subjectFilter) {
    const q = normalizeString(subjectFilter);
    names = names.filter(name => normalizeString(name).includes(q));
  }

  if (subjectSort==='asc') names.sort((a,b)=> a.localeCompare(b,'pt',{sensitivity:'base'}));
  else if (subjectSort==='desc') names.sort((a,b)=> b.localeCompare(a,'pt',{sensitivity:'base'}));

  names.forEach(name=>{
    const li = document.createElement('li');
    li.tabIndex = 0;
    
    // 1. Cria o Label (Nome da matéria)
    const label = document.createElement('span');
    label.className='label';
    label.textContent = name.toUpperCase();
    li.appendChild(label);

    // 2. Cria o Container de Ações (Botões)
    const actions = document.createElement('div');
    actions.className='li-actions';

    // Botão Editar (Lápis)
    const edit = document.createElement('button');
    edit.className='li-edit-btn'; 
    edit.title='Renomear'; 
    edit.innerHTML='<i class="fa-solid fa-pen"></i>'; 
    edit.addEventListener('click', (ev)=>{ ev.stopPropagation(); renameSubject(name); });
    actions.appendChild(edit);

    // Botão Excluir (Lixeira)
    const del = document.createElement('button');
    del.className='li-delete-btn'; 
    del.title='Excluir'; 
    del.innerHTML='<i class="fa-solid fa-trash"></i>'; 
    del.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      if (!confirm(`Quer excluir a matéria ${name}?`)) return;
      
      const updates = {};
      updates[`subjects/${name}`] = null;
      updates[`sheets/${name}`] = null;
      
      update(ref(db, `users/${currentUser.uid}`), updates).then(async () => {
          subjectsOrder = (subjectsOrder||[]).filter(x=>x!==name);
          await saveSubjectsOrder(subjectsOrder);
          
          delete subjects[name];
          await logChange({subject:name, row:null, colLabel:'Matéria', oldValue:name, newValue:'(excluída)'});
          await renderSubjectList();
          
          if (titleEl) titleEl.textContent = 'Selecione uma disciplina';
          if (tableContainer) tableContainer.innerHTML = '';
          notifyCharts();
      }).catch(e => console.error("Erro ao excluir:", e));
    });
    actions.appendChild(del);

    // --- A CORREÇÃO ESTÁ AQUI: ---
    // Adiciona o container de ações dentro do LI
    li.appendChild(actions); 
    // -----------------------------

    li.dataset.subject = name;
    li.addEventListener('click', async ()=>{
      subjectListEl.querySelectorAll('li').forEach(x=>x.classList.remove('active'));
      li.classList.add('active');
      await loadSubject(name);
    });
    
    subjectListEl.appendChild(li);
  });
}

// === FUNÇÃO DE ADICIONAR MATÉRIA ===
async function addSubjectFlow(){
  const v = (newSubjectInput && newSubjectInput.value || '').trim();
  if (!v) return alert('Digite o nome da matéria.');
  
  const exists = await subjectExists(v);
  if (exists) return alert('Matéria já existe.');

  // 1. Pergunta de Confirmação (Sim/Não)
  if (confirm(`Deseja criar a matéria "${v}"?`)) {
      // 2. Se SIM: Cria com um item vazio para garantir que o Firebase salve a chave
      try{
        await fbSet(`subjects/${v}`, ['']); 
        
        subjectsOrder = await loadSubjectsOrder();
        subjectsOrder.push(v);
        await saveSubjectsOrder(subjectsOrder);
        
        subjects = await loadSubjectsMap();
        newSubjectInput.value = ''; // Limpa Input
        await renderSubjectList();
        
        const li = Array.from(subjectListEl.querySelectorAll('li')).find(x=>x.dataset.subject===v);
        if (li) li.click();
        
        await logChange({subject:v, row:null, colLabel:'Matéria', oldValue:'(nova)', newValue:v});
        notifyCharts();
      } catch(e){ console.error('Erro add matéria:', e); }
  } else {
      // 3. Se NÃO: Limpa Input
      newSubjectInput.value = '';
  }
}

///////////////////////////
// TABELA / CÁLCULO
///////////////////////////

function getAllTopicsArray(name, topicsBase, saved){
  if (saved && saved._rows && Array.isArray(saved._rows)) return saved._rows.slice();
  const arr = (topicsBase||[]).slice();
  return arr;
}

async function addRow(subject){
  const saved = await loadSaved(subject);
  if (!saved._rows || !Array.isArray(saved._rows)){
    const base=(subjects[subject]||[]).slice();
    saved._rows = base;
  }
  saved._rows.push('');
  const newIdx = saved._rows.length - 1;
  const estudadaKey = `r${newIdx}_c${COLS.materialsStart + 3}`;
  saved[estudadaKey] = saved[estudadaKey] || 'todo';

  await saveSaved(subject, saved, {subject, row:saved._rows.length, colLabel:'Linha', oldValue:'(n/a)', newValue:'(adicionada)'});
  await loadSubject(subject);
  
  setTimeout(()=>{
      const lastInput = tableContainer.querySelector('.table-modern tbody tr:last-child .sticky-col-2 input');
      if (lastInput) lastInput.focus();
  }, 100);
}

async function deleteRow(subject, delIdx){
  const saved = await loadSaved(subject);
  const base = subjects[subject]||[];
  let rows = getAllTopicsArray(subject, base, saved);
  if (!Array.isArray(rows)) rows=[];
  const removedTopic = rows[delIdx] || '';
  rows.splice(delIdx,1);
  const newSaved = { _rows: rows };
  if (saved._notes) newSaved._notes = saved._notes;

  for (let i=0;i<rows.length;i++){
    newSaved[`r${i}_topic`] = saved[`r${i < delIdx ? i : i+1}_topic`] || rows[i] || '';
    for (let c=0;c<TOTAL_COLS;c++){
      newSaved[`r${i}_c${c}`] = saved[`r${i < delIdx ? i : i+1}_c${c}`] || '';
    }
  }
  await saveSaved(subject, newSaved, {subject, row:delIdx+1, colLabel:'Linha', oldValue:removedTopic, newValue:'(removida)'});
  await loadSubject(subject);
  notifyCharts();
}

async function computePercentForRow(subject, rowIdx, groupStart){
  const saved = await loadSaved(subject);
  const qKey = `r${rowIdx}_c${groupStart}`;     
  const aKey = `r${rowIdx}_c${groupStart+1}`;   
  const eKey = `r${rowIdx}_c${groupStart+2}`;   
  const pKey = `r${rowIdx}_c${groupStart+3}`;   

  const q = parseFloat(String(saved[qKey]||'').replace(',','.')) || 0;
  const a = parseFloat(String(saved[aKey]||'').replace(',','.')) || 0;
  
  const calcErrors = Math.max(0, q - a);
  saved[eKey] = calcErrors;
  
  const errorInput = document.querySelector(`input[data-row="${rowIdx}"][data-col="${groupStart+2}"]`);
  if(errorInput) errorInput.value = calcErrors;

  let pctVal = 0;
  if (q > 0){
     let val = (a / q) * 100;
     if (isFinite(val)) pctVal = Math.max(0, Math.min(100,val));
  }

  const pctString = Math.round(pctVal) + '%';
  const oldValue = saved[pKey] || '';
  saved[pKey] = pctString; 

  await saveSaved(subject, saved, {
      subject, 
      row: rowIdx+1, 
      colLabel:(groupStart===COLS.ex1Start?'% Mult.':'% C/E'), 
      oldValue, 
      newValue: pctString
  });

  const barContainer = document.getElementById(`prog-bar-${rowIdx}-${groupStart}`);
  const textContainer = document.getElementById(`prog-text-${rowIdx}-${groupStart}`);
  
  if (barContainer && textContainer) {
      barContainer.style.width = pctVal + '%';
      barContainer.classList.remove('perf-low', 'perf-med', 'perf-high', 'bg-gray-300');
      if(q === 0) barContainer.style.backgroundColor = '#e2e8f0'; 
      else {
          barContainer.style.backgroundColor = ''; 
          barContainer.classList.add(getProgressColorClass(pctVal));
      }
      textContainer.innerText = pctString;
  }
}

async function renderTable(subject, topicsBase, saved){
  if (!tableContainer) return;
  tableContainer.innerHTML='';

  const containerDiv = document.createElement('div');
  containerDiv.className = 'table-container-modern';

  const headerActions = document.createElement('div');
  headerActions.style.cssText = 'padding:15px;display:flex;justify-content:flex-end;background:#fff';
  
  headerActions.innerHTML = `
    <button id="btn-add-row" class="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg shadow text-sm font-bold transition flex items-center gap-2">
      <i class="fa-solid fa-plus"></i> Adicionar Tópico
    </button>
  `;
  const btnAdd = headerActions.querySelector('#btn-add-row');
  btnAdd.addEventListener('click', () => addRow(subject));
  
  tableContainer.appendChild(headerActions);

  const topScroll = document.createElement('div');
  topScroll.id = 'topScrollWrapper';
  topScroll.style.cssText = 'overflow-x:auto;overflow-y:hidden;height:20px;width:100%;background:#fff;border-bottom:1px solid #f0f0f0';
  const topScrollContent = document.createElement('div');
  topScrollContent.id = 'topScrollContent';
  topScrollContent.style.height = '1px';
  topScroll.appendChild(topScrollContent);
  tableContainer.appendChild(topScroll);

  const table = document.createElement('table');
  table.className = 'table-modern';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th rowspan="2" class="sticky-col-1">#</th>
      <th rowspan="2" class="sticky-col-2">Assunto / Tópico</th>
      <th rowspan="2" style="min-width:160px; text-align:center">Situação</th>
      <th colspan="3" class="th-group-theory text-center">Material Teórico</th>
      <th colspan="4" class="th-group-review text-center">Ciclo de Revisão</th>
      <th colspan="4" class="th-group-ex-book text-center">Exercícios (Mult.)</th>
      <th colspan="4" class="th-group-ex-tec text-center">Exercícios (C/E)</th>
      <th rowspan="2" style="width: 60px;"></th>
    </tr>
    <tr>
      <th class="th-group-theory font-semibold">Video</th>
      <th class="th-group-theory font-semibold">PDF</th>
      <th class="th-group-theory font-semibold">Lei</th>
      <th class="th-group-review font-semibold">24h</th>
      <th class="th-group-review font-semibold">7d</th>
      <th class="th-group-review font-semibold">15d</th>
      <th class="th-group-review font-semibold">30d</th>
      <th class="th-group-ex-book font-semibold">Qtd</th>
      <th class="th-group-ex-book font-semibold">Acertos</th>
      <th class="th-group-ex-book font-semibold">Erros</th>
      <th class="th-group-ex-book font-semibold" style="min-width: 100px;">Desempenho</th>
      <th class="th-group-ex-tec font-semibold">Qtd</th>
      <th class="th-group-ex-tec font-semibold">Acertos</th>
      <th class="th-group-ex-tec font-semibold">Erros</th>
      <th class="th-group-ex-tec font-semibold" style="min-width: 100px;">Desempenho</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const allTopics = getAllTopicsArray(subject, topicsBase, saved);

  for (let idx=0; idx<allTopics.length; idx++){
    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 transition";

    const tdNum = document.createElement('td');
    tdNum.className = 'sticky-col-1 font-bold text-gray-500 text-lg';
    tdNum.textContent = idx + 1;
    tr.appendChild(tdNum);

    const tdTopic = document.createElement('td');
    tdTopic.className = 'sticky-col-2';
    const inputTopic = document.createElement('input');
    
    const statusColIdx = COLS.materialsStart + 3;
    let currentStatus = saved[`r${idx}_c${statusColIdx}`] || 'todo';
    if(currentStatus === 'sim') currentStatus = 'done';
    if(currentStatus === 'não') currentStatus = 'todo';

    inputTopic.className = `input-cell font-medium subject-${currentStatus}`;
    inputTopic.value = saved[`r${idx}_topic`] !== undefined ? saved[`r${idx}_topic`] : allTopics[idx] || '';
    
    inputTopic.addEventListener('change', async () => {
        const s = await loadSaved(subject);
        if (!s._rows || !Array.isArray(s._rows)) s._rows = getAllTopicsArray(subject, topicsBase, s);
        const newValue = inputTopic.value;
        s._rows[idx] = newValue;
        s[`r${idx}_topic`] = newValue;
        await saveSaved(subject, s, {subject, row:idx+1, colLabel:'Assunto', oldValue:'...', newValue});
    });
    tdTopic.appendChild(inputTopic);
    tr.appendChild(tdTopic);

    const tdStatus = document.createElement('td');
    const selectStatus = document.createElement('select');
    
    const updateSelectClass = () => {
        selectStatus.className = `status-select status-${selectStatus.value}`;
        inputTopic.className = `input-cell font-medium subject-${selectStatus.value}`;
    };

    selectStatus.innerHTML = `
        <option value="todo">A Fazer</option>
        <option value="doing">Estudando</option>
        <option value="review">Revisão</option>
        <option value="done">Concluído</option>
    `;
    selectStatus.value = currentStatus;
    updateSelectClass(); 

    selectStatus.addEventListener('change', async () => {
        updateSelectClass();
        const s = await loadSaved(subject);
        s[`r${idx}_c${statusColIdx}`] = selectStatus.value;
        await saveSaved(subject, s, {subject, row:idx+1, colLabel:'Status', oldValue:'...', newValue:selectStatus.value});
    });
    tdStatus.appendChild(selectStatus);
    tr.appendChild(tdStatus);

    for (let c=0; c<3; c++) {
        const td = document.createElement('td');
        const isChecked = (saved[`r${idx}_c${c}`] || '').toLowerCase() === 'ok';
        const divWrap = document.createElement('div'); divWrap.className = 'chk-wrapper';
        const divChk = document.createElement('div');
        divChk.className = `custom-chk ${isChecked ? 'checked' : ''}`;
        
        divChk.addEventListener('click', async () => {
            const newState = !divChk.classList.contains('checked');
            if(newState) divChk.classList.add('checked'); else divChk.classList.remove('checked');
            const s = await loadSaved(subject);
            s[`r${idx}_c${c}`] = newState ? 'ok' : ''; 
            await saveSaved(subject, s, {subject, row:idx+1, colLabel:`Mat ${c}`, oldValue:'...', newValue: newState?'ok':''});
            notifyCharts();
        });
        divWrap.appendChild(divChk); td.appendChild(divWrap); tr.appendChild(td);
    }

    for (let c=4; c<8; c++) {
        const td = document.createElement('td');
        const isChecked = (saved[`r${idx}_c${c}`] || '').toLowerCase() === 'ok';
        const divWrap = document.createElement('div'); divWrap.className = 'chk-wrapper';
        const divChk = document.createElement('div');
        divChk.className = `custom-chk ${isChecked ? 'checked' : ''}`;
        
        divChk.addEventListener('click', async () => {
            const newState = !divChk.classList.contains('checked');
            if(newState) divChk.classList.add('checked'); else divChk.classList.remove('checked');
            const s = await loadSaved(subject);
            s[`r${idx}_c${c}`] = newState ? 'ok' : '';
            await saveSaved(subject, s, {subject, row:idx+1, colLabel:`Rev ${c}`, oldValue:'...', newValue: newState?'ok':''});
            notifyCharts();
        });
        divWrap.appendChild(divChk); td.appendChild(divWrap); tr.appendChild(td);
    }

    const renderExerciseCols = (startIndex) => {
        for(let offset=0; offset<3; offset++) {
            const colIdx = startIndex + offset;
            const td = document.createElement('td');
            const input = document.createElement('input');
            input.type = "number"; input.className = "input-cell input-center"; input.placeholder = "-";
            const currentVal = saved[`r${idx}_c${colIdx}`] || '';
            input.value = currentVal;
            input.dataset.row = idx; input.dataset.col = colIdx;

            if(offset === 2) { input.style.color = "#ef4444"; input.tabIndex = -1; }
            if(offset === 1) input.style.color = "#15803d"; 

            input.addEventListener('change', (e) => {
                const newVal = e.target.value;
                if (newVal !== currentVal) {
                    if (!confirm("Alterar dados da questão?")) {
                        e.target.value = saved[`r${idx}_c${colIdx}`] || '';
                        return;
                    }
                }
                loadSaved(subject).then(s_loaded => {
                     s_loaded[`r${idx}_c${colIdx}`] = newVal;
                     saveSaved(subject, s_loaded).then(() => computePercentForRow(subject, idx, startIndex));
                });
            });
            td.appendChild(input); tr.appendChild(td);
        }

        const pctColIdx = startIndex + 3;
        const tdPct = document.createElement('td');
        const rawPct = saved[`r${idx}_c${pctColIdx}`] || '0%';
        const numPct = parseFloat(rawPct) || 0;
        
        tdPct.innerHTML = `
            <div class="flex flex-col justify-center h-full px-2">
                <div class="progress-wrapper">
                    <div id="prog-bar-${idx}-${startIndex}" class="progress-fill ${getProgressColorClass(numPct)}" style="width: ${numPct}%"></div>
                </div>
                <span id="prog-text-${idx}-${startIndex}" class="progress-text">${rawPct}</span>
            </div>
        `;
        tr.appendChild(tdPct);
    };

    renderExerciseCols(COLS.ex1Start);
    renderExerciseCols(COLS.ex2Start);

    const tdAct = document.createElement('td');
    tdAct.style.textAlign = 'center';
    tdAct.innerHTML = `<button class="btn-del-row" title="Excluir">&times;</button>`;
    tdAct.querySelector('button').addEventListener('click', () => {
        if(confirm('Excluir este tópico?')) deleteRow(subject, idx);
    });
    tr.appendChild(tdAct);

    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  containerDiv.appendChild(table);
  tableContainer.appendChild(containerDiv);

  setTimeout(() => {
    const tableWidth = table.scrollWidth;
    topScrollContent.style.width = tableWidth + 'px';
    topScroll.onscroll = function() { containerDiv.scrollLeft = topScroll.scrollLeft; };
    containerDiv.onscroll = function() { topScroll.scrollLeft = containerDiv.scrollLeft; };
  }, 50);
}

function generateTableHTML(subject, topicsBase, saved){
  const allTopics = getAllTopicsArray(subject, topicsBase, saved);
  let html = `<!doctype html><html><head><meta charset="utf-8"></head><body>`;
  html += `<h3>${subject}</h3><ul>`;
  for (let i=0;i<allTopics.length;i++){
    html += `<li>${saved[`r${i}_topic`] || allTopics[i] || ''}</li>`;
  }
  html += `</ul></body></html>`;
  return html;
}

async function loadSubject(name){
  if (titleEl) titleEl.textContent = name? name.toUpperCase() : '';
  subjects = await loadSubjectsMap();
  const topicsBase = subjects[name] || [];
  const saved = await loadSaved(name);
  if (notesBox) notesBox.innerHTML = saved._notes || '';

  if (notesMarkdown && notesMarkdown.checked) renderNotesPreview();

  if (useIframe && useIframe.checked){
    if (previewFrame) previewFrame.style.display='block';
    if (tableContainer) tableContainer.style.display='none';
    previewFrame.srcdoc = generateTableHTML(name, topicsBase, saved);
  } else {
    if (previewFrame) previewFrame.style.display='none';
    if (tableContainer) tableContainer.style.display='block';
    await renderTable(name, topicsBase, saved);
  }
}

if (notesBox){
  notesBox.addEventListener('blur', async ()=>{
    const active = subjectListEl && subjectListEl.querySelector('li.active');
    if (!active) return;
    const name = active.dataset.subject;
    const saved = await loadSaved(name);
    const oldValue = saved._notes || '';
    saved._notes = notesBox.innerHTML;
    await saveSaved(name, saved, {subject:name, row:null, colLabel:'Notas', oldValue, newValue:'(atualizado)'});
    if (notesMarkdown && notesMarkdown.checked) renderNotesPreview();
    notifyCharts();
  });
}

async function exportJSON(){
  if(!currentUser) return;
  const snapshot = await get(ref(db, `users/${currentUser.uid}`));
  const val = snapshot.val();
  const blob = new Blob([JSON.stringify(val, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'backup-firebase.json'; a.click();
}

async function exportCSV(){
  alert("Exportação CSV simplificada em implementação.");
}

async function openChartsOverlay() {
  if (document.getElementById('chartsOverlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'chartsOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.55);z-index:99999;padding:20px;';
  
  const frameWrap = document.createElement('div');
  frameWrap.style.cssText = 'width:100%;max-width:1200px;height:90%;background:#fff;border-radius:10px;overflow:hidden;position:relative;display:flex;flex-direction:column;';
  
  const iframe = document.createElement('iframe');
  iframe.id = 'chartsIframe'; iframe.src = 'charts.html';
  iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#fff';
  
  overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
  frameWrap.appendChild(iframe); overlay.appendChild(frameWrap); document.body.appendChild(overlay);
}

async function renderGlobalSearch(){
  const q = normalizeString(globalSearch.value || '');
  if (!q){ globalResults.innerHTML = '<em>Digite...</em>'; return; }
  
  const allData = await fbGet(''); // Pega tudo do usuário
  if(!allData || !allData.sheets) return;

  const items = [];
  Object.entries(allData.sheets).forEach(([subjName, sheetData]) => {
      const rows = sheetData._rows || [];
      rows.forEach((rowBase, i) => {
          const topic = sheetData[`r${i}_topic`] || rowBase;
          if (normalizeString(topic).includes(q)) items.push({s:subjName, r:i+1, v:topic});
      });
  });

  globalResults.innerHTML = '';
  const ul = document.createElement('ul'); ul.style.margin='0'; ul.style.padding='0 0 0 16px';
  items.slice(0,50).forEach(it => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${it.s}</strong>: ${it.v}`;
      li.style.cursor='pointer';
      li.onclick = async () => {
          await renderSubjectList();
          const el = Array.from(subjectListEl.querySelectorAll('li')).find(x=>x.dataset.subject===it.s);
          if (el) el.click();
      };
      ul.appendChild(li);
  });
  globalResults.appendChild(ul);
}

function renderNotesPreview() {
  if (!notesBox || !notesPreview) return;
  const md = notesBox.innerHTML;
  notesPreview.innerHTML = md.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}

async function renderLogs() {
  const logs = await getLogs();
  const filter = normalizeString(logSearch.value || '');
  let filtered = logs;
  if (filter) {
    filtered = logs.filter(l => normalizeString(l.subject).includes(filter));
  }
  filtered.sort((a,b) => new Date(b.time) - new Date(a.time)); 
  
  logList.innerHTML = '';
  const ul = document.createElement('ul'); ul.style.margin='0'; ul.style.padding='0 0 0 16px';
  filtered.slice(0, 50).forEach(log => { 
    const li = document.createElement('li');
    li.style.marginBottom = '6px';
    const d = new Date(log.time);
    li.innerHTML = `<div><strong>${d.toLocaleString()}</strong>: ${log.subject}</div>`;
    ul.appendChild(li);
  });
  logList.appendChild(ul);
}

async function deleteAllSubjects() {
  if (!confirm('Tem certeza? Isso apaga TUDO do servidor!')) return;
  await fbRemove(''); // Remove root do user
  location.reload();
}

// Inicializa ou espera Login
window.addEventListener('auth-ready', async (evt) => {
    console.log("Auth Ready, carregando dados...");
    await renderSubjectList();
    renderLogs();
});