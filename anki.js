// anki.js - Sistema SRS Completo (Corrigido)
import { db, auth } from "./firebase-config.js";
import { ref, set, get, update, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentUserUID = null;
let allCards = {};
let deckSettings = {}; 
let studyQueue = [];
let currentCardIndex = 0;
let currentDeckName = null;
let currentCategoryFilter = 'conteudo';

console.log("🧠 Iniciando Anki Expert...");

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUID = user.uid;
        loadAnkiData();
    } else { window.location.href = 'index.html'; }
});

async function loadAnkiData() {
    try {
        const cardsSnap = await get(ref(db, `users/${currentUserUID}/anki/cards`));
        allCards = cardsSnap.exists() ? cardsSnap.val() : {};
        const settingsSnap = await get(ref(db, `users/${currentUserUID}/anki/settings`));
        deckSettings = settingsSnap.exists() ? settingsSnap.val() : {};
        renderDecksView();
        populateDeckSuggestions();
    } catch (e) { console.error(e); }
}

window.switchMainTab = function(category) {
    currentCategoryFilter = category;
    document.getElementById('nav-conteudo').classList.toggle('active', category === 'conteudo');
    document.getElementById('nav-juris').classList.toggle('active', category === 'jurisprudencia');
    renderDecksView();
};

window.showDecksView = function() {
    document.getElementById('viewStudy').classList.add('hidden');
    document.getElementById('viewEmpty').classList.add('hidden');
    document.getElementById('viewDecks').classList.remove('hidden');
    document.getElementById('btnBackToDecks').classList.add('hidden');
    loadAnkiData();
};

function renderDecksView() {
    const container = document.getElementById('viewDecks');
    container.innerHTML = '';
    const decks = {};
    const now = Date.now();

    Object.keys(allCards).forEach(key => {
        const card = allCards[key];
        const cardCat = card.category || 'conteudo'; 
        if (cardCat === currentCategoryFilter) {
            const deckName = card.deck || 'Geral';
            if (!decks[deckName]) decks[deckName] = { total: 0, due: 0, new: 0, lastReview: 0 };
            decks[deckName].total++;
            if (card.nextReview <= now) {
                if(card.interval === 0) decks[deckName].new++;
                else decks[deckName].due++;
            }
            if (card.lastReview && card.lastReview > decks[deckName].lastReview) {
                decks[deckName].lastReview = card.lastReview;
            }
        }
    });

    if (Object.keys(decks).length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-20 text-gray-400 opacity-60"><p>Nenhum baralho de <strong>${currentCategoryFilter === 'conteudo' ? 'Conteúdo' : 'Jurisprudência'}</strong>.</p></div>`;
        return;
    }

    Object.keys(decks).sort().forEach(deckName => {
        const info = decks[deckName];
        const totalDue = info.due + info.new;
        const isDue = totalDue > 0;
        const statusBorder = isDue ? 'border-l-4 border-l-sky-500' : 'border-l-4 border-l-gray-200';
        
        let lastRevText = "Nunca";
        if(info.lastReview > 0) {
            const d = new Date(info.lastReview);
            lastRevText = d.toLocaleDateString('pt-BR');
        }
        
        const cardHTML = document.createElement('div');
        cardHTML.className = `bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg transition flex flex-col justify-between h-48 group relative overflow-hidden ${statusBorder}`;
        
        cardHTML.innerHTML = `
            <div class="deck-actions z-30">
                <button class="btn-deck-action" onclick="window.openDeckConfig('${deckName}', event)" title="Configurações"><i class="fa-solid fa-gear"></i></button>
                <button class="btn-deck-action" onclick="window.renameDeck('${deckName}', event)" title="Renomear"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-deck-action del" onclick="window.deleteDeck('${deckName}', event)" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </div>
            
            <div onclick="window.checkAndStartSession('${deckName}', ${totalDue})" class="cursor-pointer h-full flex flex-col justify-between">
                <div>
                    <h3 class="font-bold text-gray-800 text-lg group-hover:text-sky-600 transition truncate pr-20">${deckName}</h3>
                    <p class="text-xs text-gray-400 font-bold uppercase mt-1">${info.total} Cartas</p>
                    <p class="text-[10px] text-gray-400 mt-1 italic">Visto por último: ${lastRevText}</p>
                </div>
                
                <div class="flex items-end justify-between mt-2">
                    <div class="flex gap-4">
                        <div>
                            <span class="text-2xl font-extrabold text-green-500">${info.new}</span>
                            <span class="text-[10px] font-bold text-gray-400 uppercase block leading-none">Novos</span>
                        </div>
                        <div>
                            <span class="text-2xl font-extrabold text-sky-600">${info.due}</span>
                            <span class="text-[10px] font-bold text-gray-400 uppercase block leading-none">Revisão</span>
                        </div>
                    </div>
                    <div class="w-10 h-10 rounded-full ${isDue ? 'bg-sky-100 text-sky-600' : 'bg-gray-100 text-gray-300'} flex items-center justify-center shadow-sm">
                        <i class="fa-solid fa-play ml-0.5"></i>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(cardHTML);
    });
}

// --- CONFIGURAÇÃO DE BARALHO (CORRIGIDO) ---
window.openDeckConfig = function(deckName, ev) {
    ev.stopPropagation();
    currentDeckName = deckName;
    document.getElementById('deckConfigModal').classList.remove('hidden');
    document.getElementById('deckConfigTitle').innerText = `Config: ${deckName}`;
    window.switchConfigTab('settings'); 

    const settings = deckSettings[deckName] || { easyBonus: 3.5, goodInterval: 2.5, hardInterval: 1.2 };
    document.getElementById('cfgEasyBonus').value = settings.easyBonus;
    document.getElementById('cfgGoodInterval').value = settings.goodInterval;
    document.getElementById('cfgHardInterval').value = settings.hardInterval;
};

window.closeDeckConfigModal = function() {
    document.getElementById('deckConfigModal').classList.add('hidden');
};

window.switchConfigTab = function(tabName) {
    const tabSettings = document.getElementById('tabSettingsView');
    const tabHistory = document.getElementById('tabHistoryView');
    const btns = document.querySelectorAll('.config-tab-btn');
    
    btns.forEach(b => b.classList.remove('active'));
    
    if(tabName === 'settings') {
        tabSettings.classList.remove('hidden');
        tabHistory.classList.add('hidden');
        btns[0].classList.add('active');
    } else {
        tabSettings.classList.add('hidden');
        tabHistory.classList.remove('hidden');
        btns[1].classList.add('active');
        renderDeckHistory();
    }
};

window.saveDeckConfig = async function() {
    const easy = parseFloat(document.getElementById('cfgEasyBonus').value) || 3.5;
    const good = parseFloat(document.getElementById('cfgGoodInterval').value) || 2.5;
    const hard = parseFloat(document.getElementById('cfgHardInterval').value) || 1.2;
    deckSettings[currentDeckName] = { easyBonus: easy, goodInterval: good, hardInterval: hard };
    try { await set(ref(db, `users/${currentUserUID}/anki/settings`), deckSettings); alert("Configurações salvas!"); window.closeDeckConfigModal(); } catch(e) { console.error(e); }
};

// --- HISTÓRICO CORRIGIDO: FILTRA PELA CATEGORIA ATUAL ---
function renderDeckHistory() {
    const tbody = document.getElementById('deckHistoryBody');
    tbody.innerHTML = '';
    
    // CORREÇÃO: Filtra cards do deck E da categoria atual
    const cards = Object.values(allCards).filter(c => 
        c.deck === currentDeckName && 
        (c.category || 'conteudo') === currentCategoryFilter
    );
    
    cards.sort((a,b) => (b.lastReview || 0) - (a.lastReview || 0));

    cards.forEach(card => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 hover:bg-gray-50";
        
        let ratingBadge = '<span class="rating-badge rating-none">Novo</span>';
        if(card.lastRating) {
            const map = { 'again': 'Errei', 'hard': 'Difícil', 'good': 'Bom', 'easy': 'Fácil' };
            const cls = `rating-${card.lastRating}`;
            ratingBadge = `<span class="rating-badge ${cls}">${map[card.lastRating]}</span>`;
        }
        const dateStr = card.lastReview ? new Date(card.lastReview).toLocaleDateString() : '-';
        const frontText = card.front.replace(/<[^>]*>?/gm, '').substring(0, 40) + '...';
        tr.innerHTML = `<td class="p-3 text-gray-700">${frontText}</td><td class="p-3 text-center">${ratingBadge}</td><td class="p-3 text-right text-gray-400 text-xs">${dateStr}</td>`;
        tbody.appendChild(tr);
    });
}

// --- ESTUDO ---
window.checkAndStartSession = function(deckName, totalDue) {
    if (totalDue > 0) startStudySession(deckName, false);
    else if (confirm(`Este baralho está em dia! \n\nGostaria de revisar tudo novamente (Modo Cramming)?`)) startStudySession(deckName, true);
};

function startStudySession(deckName, isCramming) {
    currentDeckName = deckName;
    const now = Date.now();
    let cards = Object.keys(allCards).map(key => ({ ...allCards[key], firebaseKey: key }))
        .filter(c => c.deck === deckName && (c.category || 'conteudo') === currentCategoryFilter);
    
    studyQueue = isCramming ? cards : cards.filter(c => c.nextReview <= now || c.interval === 0);
    studyQueue.sort(() => Math.random() - 0.5);

    if (studyQueue.length === 0) return alert("Erro ao carregar cartas.");

    currentCardIndex = 0;
    document.getElementById('viewDecks').classList.add('hidden');
    document.getElementById('viewStudy').classList.remove('hidden');
    document.getElementById('btnBackToDecks').classList.remove('hidden');
    document.getElementById('deckTitleDisplay').innerText = deckName;
    showCurrentCard();
}

function showCurrentCard() {
    const card = studyQueue[currentCardIndex];
    document.getElementById('studyCounter').innerText = `${studyQueue.length - currentCardIndex} restantes`;
    
    const container = document.getElementById('flashcardContainer');
    container.classList.remove('revealed'); 
    const controls = document.getElementById('studyControls');
    controls.classList.remove('opacity-100', 'pointer-events-auto');
    controls.classList.add('opacity-0', 'pointer-events-none');
    
    const settings = deckSettings[currentDeckName] || { easyBonus: 3.5, goodInterval: 2.5, hardInterval: 1.2 };
    const currentInt = card.interval || 0;
    document.getElementById('timeAgain').innerText = "1 min";
    document.getElementById('timeHard').innerText = Math.round(Math.max(1, currentInt * settings.hardInterval)) + " dias";
    document.getElementById('timeGood').innerText = Math.round(Math.max(1, currentInt * settings.goodInterval)) + " dias";
    document.getElementById('timeEasy').innerText = Math.round(Math.max(4, currentInt * settings.easyBonus)) + " dias";

    setTimeout(() => {
        const frontHTML = processCloze(card.front, false);
        let backHTML = card.back;
        if ((!backHTML || backHTML.trim() === "") && card.front.includes("{{c1::")) backHTML = processCloze(card.front, true);
        else backHTML = processCloze(backHTML, true);

        document.getElementById('cardFrontText').innerHTML = frontHTML;
        document.getElementById('cardBackText').innerHTML = backHTML;
        
        const badge = document.getElementById('cardTypeBadge');
        if (card.category === 'jurisprudencia') {
            badge.className = "absolute top-0 right-0 bg-pink-100 text-pink-600 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider";
            badge.innerText = "JURISPRUDÊNCIA";
        } else {
            badge.className = "absolute top-0 right-0 bg-sky-100 text-sky-600 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider";
            badge.innerText = "CONTEÚDO";
        }

        const footer = document.getElementById('cardFooterInfo');
        if (card.legalBasis || card.link) {
            footer.classList.remove('hidden');
            document.getElementById('cardLegalBasis').innerText = card.legalBasis || '';
            const linkBtn = document.getElementById('cardExternalLink');
            if(card.link) { linkBtn.href = card.link; linkBtn.classList.remove('hidden'); } else linkBtn.classList.add('hidden');
        } else { footer.classList.add('hidden'); }
    }, 100);
}

window.revealCard = function() {
    const container = document.getElementById('flashcardContainer');
    if (!container.classList.contains('revealed')) {
        container.classList.add('revealed');
        setTimeout(() => {
            document.getElementById('studyControls').classList.remove('opacity-0', 'pointer-events-none');
            document.getElementById('studyControls').classList.add('opacity-100', 'pointer-events-auto');
        }, 100);
    }
};

window.flipCard = window.revealCard;

window.rateCard = async function(rating) {
    const card = studyQueue[currentCardIndex];
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const settings = deckSettings[currentDeckName] || { easyBonus: 3.5, goodInterval: 2.5, hardInterval: 1.2 };
    let nextInterval = 1, nextEase = card.ease || 2.5;

    if (rating === 'again') { nextInterval = 0; nextEase = Math.max(1.3, nextEase - 0.2); }
    else if (rating === 'hard') { nextInterval = Math.max(1, (card.interval || 0) * settings.hardInterval); nextEase = Math.max(1.3, nextEase - 0.15); }
    else if (rating === 'good') { nextInterval = Math.max(1, (card.interval || 0) * settings.goodInterval); }
    else if (rating === 'easy') { nextInterval = Math.max(4, (card.interval || 0) * settings.easyBonus); nextEase += 0.15; }

    nextInterval = Math.round(nextInterval);
    if (nextInterval < 1 && rating !== 'again') nextInterval = 1;

    const updates = {};
    updates[`users/${currentUserUID}/anki/cards/${card.firebaseKey}`] = {
        ...card, interval: nextInterval, ease: nextEase, nextReview: now + (nextInterval * oneDay), lastReview: now, lastRating: rating
    };

    try {
        await update(ref(db), updates);
        currentCardIndex++;
        if (currentCardIndex < studyQueue.length) showCurrentCard();
        else {
            document.getElementById('viewStudy').classList.add('hidden');
            document.getElementById('viewEmpty').classList.remove('hidden');
            loadAnkiData();
        }
    } catch (e) { console.error(e); }
};

window.openCreateModal = function() {
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('modalTitleText').innerText = "Novo Flashcard";
    document.getElementById('inputCardId').value = ""; 
    document.getElementById('inputDeckName').value = currentDeckName || '';
    document.getElementById('inputFront').innerHTML = '';
    document.getElementById('inputBack').innerHTML = '';
    document.getElementById('inputLegalBasis').value = '';
    document.getElementById('inputLink').value = '';
    window.setModalCategory(currentCategoryFilter); 
    document.getElementById('inputCardFormat').value = 'basic';
    window.toggleFormatUI();
};
window.closeCreateModal = function() { document.getElementById('createModal').classList.add('hidden'); };
window.setModalCategory = function(cat) { 
    document.getElementById('inputCategory').value = cat; 
    document.getElementById('tabModalConteudo').classList.toggle('active', cat === 'conteudo'); 
    document.getElementById('tabModalJuris').classList.toggle('active', cat === 'jurisprudencia'); 
    populateDeckSuggestions(); 
};
window.toggleFormatUI = function() {
    const fmt = document.getElementById('inputCardFormat').value;
    const btnCloze = document.getElementById('btnClozeAction');
    const lblFront = document.getElementById('lblFrontEditor');
    const lblBack = document.getElementById('lblBackEditor');
    const backInput = document.getElementById('inputBack');
    if (fmt === 'cloze') {
        btnCloze.classList.remove('hidden'); lblFront.innerText = "Texto com Oclusão (Use o botão [...])"; lblBack.innerText = "Verso Extra (Opcional)"; backInput.setAttribute('placeholder', 'Deixe vazio para mostrar apenas a frase completa.');
    } else {
        btnCloze.classList.add('hidden'); lblFront.innerText = "Frente (Pergunta)"; lblBack.innerText = "Verso (Resposta)"; backInput.setAttribute('placeholder', 'A resposta...');
    }
};
window.saveCard = async function() {
    const id = document.getElementById('inputCardId').value;
    const deck = document.getElementById('inputDeckName').value.trim();
    const front = document.getElementById('inputFront').innerHTML;
    const back = document.getElementById('inputBack').innerHTML;
    const category = document.getElementById('inputCategory').value;
    const format = document.getElementById('inputCardFormat').value;
    const legal = document.getElementById('inputLegalBasis').value.trim();
    const link = document.getElementById('inputLink').value.trim();
    if (!deck || !front) return alert("Preencha ao menos Baralho e Frente.");
    const cardData = { deck, front, back, category, format, legalBasis: legal, link: link };
    try {
        if (id) { await update(ref(db, `users/${currentUserUID}/anki/cards/${id}`), cardData); alert("Atualizado!"); } 
        else { cardData.interval = 0; cardData.ease = 2.5; cardData.nextReview = Date.now(); cardData.created = Date.now(); await push(ref(db, `users/${currentUserUID}/anki/cards`), cardData); alert("Criado!"); }
        if (!id) { document.getElementById('inputFront').innerHTML = ''; document.getElementById('inputBack').innerHTML = ''; document.getElementById('inputFront').focus(); } 
        else { window.closeCreateModal(); }
        loadAnkiData();
    } catch (e) { console.error(e); alert("Erro."); }
};
window.openManagerModal = function() { document.getElementById('managerModal').classList.remove('hidden'); window.renderManagerList(); };
window.closeManagerModal = function() { document.getElementById('managerModal').classList.add('hidden'); };
window.renderManagerList = function() {
    const tbody = document.getElementById('managerTableBody');
    const filterText = document.getElementById('managerSearch').value.toLowerCase();
    const filterDeck = document.getElementById('managerFilterDeck').value;
    tbody.innerHTML = '';
    let cardsArray = Object.keys(allCards).map(key => ({...allCards[key], id: key}));
    const filtered = cardsArray.filter(card => {
        const matchDeck = filterDeck === 'todos' || card.deck === filterDeck;
        const searchContent = (card.front + ' ' + card.back + ' ' + card.deck).toLowerCase();
        return matchDeck && searchContent.includes(filterText);
    });
    filtered.forEach((card, index) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 hover:bg-gray-50 transition";
        const previewFront = card.front.replace(/<[^>]*>?/gm, '').substring(0, 50) + '...';
        let typeBadge = card.category === 'jurisprudencia' ? '<span class="text-[9px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded font-bold">JURIS</span>' : '<span class="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-bold">CONT</span>';
        tr.innerHTML = `<td class="p-4 font-mono text-gray-400 text-xs">${index + 1}</td><td class="p-4">${typeBadge}</td><td class="p-4 font-bold text-gray-600 text-xs">${card.deck}</td><td class="p-4 text-gray-700">${previewFront}</td><td class="p-4 text-center"><button class="text-sky-600 hover:text-sky-800 mr-3" onclick="window.editCard('${card.id}')"><i class="fa-solid fa-pen"></i></button><button class="text-red-400 hover:text-red-600" onclick="window.deleteCard('${card.id}')"><i class="fa-solid fa-trash"></i></button></td>`;
        tbody.appendChild(tr);
    });
};
window.deleteCard = async function(id) { if(!confirm("Excluir?")) return; try { await remove(ref(db, `users/${currentUserUID}/anki/cards/${id}`)); loadAnkiData().then(()=>window.renderManagerList()); } catch(e){ console.error(e); } };
window.editCard = function(id) {
    const card = allCards[id]; if(!card) return;
    window.closeManagerModal(); window.openCreateModal();
    document.getElementById('modalTitleText').innerText = "Editar Flashcard";
    document.getElementById('inputCardId').value = id;
    document.getElementById('inputDeckName').value = card.deck;
    document.getElementById('inputFront').innerHTML = card.front;
    document.getElementById('inputBack').innerHTML = card.back;
    document.getElementById('inputLegalBasis').value = card.legalBasis || '';
    document.getElementById('inputLink').value = card.link || '';
    window.setModalCategory(card.category || 'conteudo');
    document.getElementById('inputCardFormat').value = card.format || 'basic';
    window.toggleFormatUI();
};
window.renameDeck = async function(oldName, ev) { ev.stopPropagation(); const newName = prompt("Novo nome:", oldName); if(!newName || newName===oldName) return; const updates = {}; Object.keys(allCards).forEach(key => { if(allCards[key].deck === oldName) updates[`users/${currentUserUID}/anki/cards/${key}/deck`] = newName; }); try { await update(ref(db), updates); loadAnkiData(); } catch(e){ console.error(e); } };
window.deleteDeck = async function(deckName, ev) { ev.stopPropagation(); if(!confirm("Apagar baralho?")) return; const updates = {}; Object.keys(allCards).forEach(key => { if(allCards[key].deck === deckName) updates[`users/${currentUserUID}/anki/cards/${key}`] = null; }); try { await update(ref(db), updates); loadAnkiData(); } catch(e){ console.error(e); } };
window.wrapCloze = function() { const s=window.getSelection(); if(!s.rangeCount)return; const r=s.getRangeAt(0); const t=r.toString(); if(!t)return alert("Selecione texto."); document.execCommand('insertText', false, `{{c1::${t}}}`); };
function processCloze(t,b){ if(!t)return ""; const r=/{{c1::(.*?)}}/g; return b?t.replace(r,'<span class="cloze-revealed">$1</span>'):t.replace(r,'<span class="cloze-bracket">[...]</span>'); }
function populateDeckSuggestions() { const d=document.getElementById('deckSuggestions'); d.innerHTML=''; const c=document.getElementById('inputCategory').value; const s=new Set(); Object.values(allCards).forEach(x=>{ if((x.category||'conteudo')===c) s.add(x.deck); }); s.forEach(v=>{ const o=document.createElement('option'); o.value=v; d.appendChild(o); }); }
window.execCmd = (c,v) => document.execCommand(c,false,v);
window.toggleColorPopover = (b) => { const p=document.getElementById('popover-color'); const r=b.getBoundingClientRect(); p.style.top=(r.bottom+5)+'px'; p.style.left=r.left+'px'; p.classList.toggle('show'); };
window.applyColor = (c) => { document.execCommand(c==='#facc15'?'hiliteColor':'foreColor', false, c); document.querySelectorAll('.color-popover').forEach(e=>e.classList.remove('show')); };
window.insertTable = () => document.execCommand('insertHTML', false, '<table style="width:100%; border:1px solid black"><tr><td>.</td><td>.</td></tr></table>');