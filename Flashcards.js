// Flashcards.js - Sistema SRS Completo + Pastas Separadas + Timer + Navegação Fluida + Busca
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
let currentPathStack = [];
let initialSessionLength = 0;

// --- ETAPA 2: ESTADO DA SESSÃO DE ESTUDO ---
let sessionHits = 0;   // Acertos na sessão atual (placar de fim de sessão)
let sessionMiss = 0;   // Erros na sessão atual
let lastActionStack = []; // Histórico de avaliações para o botão "Desfazer"

// --- VARIÁVEIS PARA GERENCIADOR (AÇÕES EM MASSA) ---
let selectedManagerCards = new Set();
let isBatchMoveMode = false; // Flag para saber se estamos movendo em lote

// --- FUNÇÕES DE SELEÇÃO DO GERENCIADOR ---

window.toggleManagerCardSelection = function(id) {
    if (selectedManagerCards.has(id)) {
        selectedManagerCards.delete(id);
    } else {
        selectedManagerCards.add(id);
    }
    updateManagerToolbar();
};

window.toggleSelectAllManager = function() {
    const checkboxes = document.querySelectorAll('.manager-card-checkbox');
    const masterCheck = document.getElementById('managerSelectAll');
    const isChecked = masterCheck.checked;

    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        if (isChecked) selectedManagerCards.add(cb.dataset.id);
        else selectedManagerCards.delete(cb.dataset.id);
    });
    updateManagerToolbar();
};

window.clearManagerSelection = function() {
    selectedManagerCards.clear();
    document.getElementById('managerSelectAll').checked = false;
    document.querySelectorAll('.manager-card-checkbox').forEach(cb => cb.checked = false);
    updateManagerToolbar();
};

window.updateManagerToolbar = function() {
    const toolbar = document.getElementById('managerBatchToolbar');
    const countSpan = document.getElementById('batchCount');
    const count = selectedManagerCards.size;

    countSpan.innerText = count;
    
    if (count > 0) {
        toolbar.classList.remove('hidden');
    } else {
        toolbar.classList.add('hidden');
    }
};

// --- AÇÕES EM LOTE ---

window.batchDeleteCards = async function() {
    const count = selectedManagerCards.size;
    if (count === 0) return;

    if (!confirm(`Tem certeza que deseja EXCLUIR ${count} cartões selecionados?\nEssa ação não pode ser desfeita.`)) return;

    const updates = {};
    selectedManagerCards.forEach(id => {
        updates[`users/${currentUserUID}/anki/cards/${id}`] = null;
        delete allCards[id]; // Atualiza localmente
    });

    try {
        await update(ref(db), updates);
        showToast(`${count} cartões excluídos.`, 'success');
        window.clearManagerSelection();
        window.renderManagerList();
    } catch (e) {
        console.error(e);
        showToast("Erro ao excluir cartões.", 'error');
    }
};

window.batchMoveCards = function() {
    const count = selectedManagerCards.size;
    if (count === 0) return;
    
    // Abre o modal de seleção de pasta existente, mas com flag de batch
    isBatchMoveMode = true;
    window.openFolderSelectionModal();
    // Muda o título do modal visualmente para indicar contexto
    document.querySelector('#folderSelectionModal h3').innerText = `Mover ${count} itens para...`;
};

// ATUALIZAÇÃO DA FUNÇÃO confirmFolderSelection PARA SUPORTAR BATCH MOVE
// Substitua ou atualize sua função window.confirmFolderSelection existente por esta:
window.confirmFolderSelection = async function() {
    const pathName = selectedCreateFolder === "" ? "Início" : selectedCreateFolder;
    
    // Se for modo Batch Move (Gerenciador)
    if (isBatchMoveMode) {
        if (!confirm(`Mover ${selectedManagerCards.size} cartões para "${pathName}"?`)) return;
        
        const updates = {};
        // Se a pasta for "Início", o deck é apenas o nome do card original? Não, precisa manter a estrutura ou achatar?
        // Vamos simplificar: Move tudo para a pasta selecionada como se fosse um deck "Geral" dentro dela,
        // OU, melhor para concurseiro: Mantém o nome do baralho original, mas muda a pasta pai?
        // IMPLEMENTAÇÃO ATUAL: Move para um deck chamado "Geral" dentro da pasta alvo, ou apenas muda o prefixo.
        // PARA SIMPLIFICAR: Vamos mover todos para um deck chamado "Geral" dentro da pasta escolhida, 
        // ou se a pasta escolhida já for um deck, move para ele.
        
        // Estratégia Segura: Move para "PastaSelecionada::Geral" se for pasta pura, ou "PastaSelecionada" se for deck.
        // Mas como só temos o path, vamos mover para "PastaSelecionada::Desarquivados" ou apenas "PastaSelecionada".
        // Vamos usar o path selecionado como o novo deck base.
        
        selectedManagerCards.forEach(id => {
            const card = allCards[id];
            // Se o usuário selecionou "Direito Civil", o card vai para "Direito Civil"
            // Se ele tinha um subdeck, infelizmente nesta versão simples ele perde o subdeck e vai pro pai.
            // Para manter hierarquia seria complexo. Vamos mover direto para o alvo.
            updates[`users/${currentUserUID}/anki/cards/${id}/deck`] = pathName;
            
            if (allCards[id]) allCards[id].deck = pathName;
        });

        try {
            await update(ref(db), updates);
            showToast("Cartões movidos com sucesso!", 'success');
            isBatchMoveMode = false;
            window.closeFolderSelectionModal();
            window.clearManagerSelection();
            window.renderManagerList();
            
            // Restaura título original
            document.querySelector('#folderSelectionModal h3').innerText = "Selecionar Localização";
        } catch (e) {
            console.error(e);
            showToast("Erro ao mover em lote.", 'error');
        }
        return;
    }

    // Comportamento original (Criar Card)
    const display = document.getElementById('displaySelectedFolder');
    display.innerHTML = `<i class="fa-solid fa-folder text-amber-400 mr-2"></i> <span>${pathName}</span>`;
    
    window.updateDeckSuggestions();
    window.closeFolderSelectionModal();
};


// Variáveis de Estado
let draggedItemPath = null;
let selectedTargetFolder = null;
let selectedCreateFolder = ""; 
let isEditingFromManager = false; // Controle de navegação (Gerenciador -> Editor)
let currentDeckFilter = ""; // Variável para o filtro de busca

// --- NOVO: LÓGICA DO FILTRO DE COMPARTILHADOS ---
let filterOnlyShared = false;

window.toggleSharedFilter = function() {
    filterOnlyShared = !filterOnlyShared;
    const btn = document.getElementById('btnFilterShared');
    
    // Atualiza Visual do Botão
    if (btn) {
        if (filterOnlyShared) {
            btn.classList.remove('bg-white', 'text-gray-400', 'border-gray-200');
            btn.classList.add('bg-indigo-50', 'text-indigo-600', 'border-indigo-300', 'ring-2', 'ring-indigo-100');
        } else {
            btn.classList.add('bg-white', 'text-gray-400', 'border-gray-200');
            btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'border-indigo-300', 'ring-2', 'ring-indigo-100');
        }
    }
    renderDecksView(); // Recarrega a tela com o novo filtro
};

let sharedSessionOwner = null; // <--- ADICIONE ESTA LINHA AQUI
// ... (após let currentDeckFilter = "";)

// --- VARIÁVEIS COMPARTILHAMENTO ---
let sharedDecksCache = []; // Armazena os baralhos que compartilharam comigo
let mySharedDecksMap = {}; // <--- NOVO: Armazena o que EU compartilhei

// --- HELPERS PARA COMPARTILHAMENTO ---
// O Firebase não aceita '.', '#', '$', '[', ']' em chaves.
const encodeEmail = (email) => btoa(email).replace(/\=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

// Funções para permitir pontos e caracteres especiais nos nomes dos decks no Firebase
const encodeKey = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');

const decodeKey = (str) => {
    try {
        return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (e) {
        return str; // Retorna original se não estiver codificado (compatibilidade antiga)
    }
};
// Não precisamos decodificar frequentemente, mas se precisar: 
// const decodeEmail = (str) => atob(str.replace(/-/g, '+').replace(/_/g, '/'));

// --- VARIÁVEIS DO TIMER ---
let studyTimerInterval = null;
let studyTimerSeconds = 0;
let studyTimerMode = 'none'; // 'stopwatch', 'timer', 'none'
let studyTimerPaused = false;
let pendingDeckName = null; // Guarda o baralho enquanto configura o tempo
let pendingIsCramming = false;
let pendingSharedData = null; // <--- ADICIONE ESTA LINHA (Dados temporários para o timer compartilhado)

// --- INJEÇÃO DE CSS (Remove Scrollbar e Ajusta Layout) ---
const style = document.createElement('style');
style.innerHTML = `
    /* Remove a scrollbar visualmente mas mantém funcionalidade */
    body, #viewDecks, #viewStudy {
        -ms-overflow-style: none;  /* IE and Edge */
        scrollbar-width: none;  /* Firefox */
    }
    body::-webkit-scrollbar, #viewDecks::-webkit-scrollbar, #viewStudy::-webkit-scrollbar {
        display: none; /* Chrome, Safari, Opera */
    }
    .cloze-bracket { font-weight: bold; color: #3b82f6; }
    .cloze-revealed { font-weight: bold; color: #16a34a; background: #dcfce7; padding: 0 4px; rounded: 4px; }
    
    /* Animação suave para o Modal de Timer */
    @keyframes fadeInScale {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
    }
    .animate-fade-in { animation: fadeInScale 0.2s ease-out forwards; }
`;
document.head.appendChild(style);

console.log("🧠 Iniciando Anki Expert (Versão Final com Busca)...");

// --- EMBARALHAMENTO CORRETO (Fisher-Yates) ---
// O método antigo (sort com Math.random) não distribui de forma justa.
// Esta função embaralha o array de verdade, sem viés. Altera e devolve o próprio array.
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// --- ETAPA 3: NOTIFICAÇÃO DISCRETA (TOAST) ---
// Substitui os alert() que travam a tela. Aparece no canto e some sozinho.
// tipo: 'success' (verde), 'error' (vermelho), 'info' (azul).
function showToast(message, tipo = 'success') {
    const cores = {
        success: { bg: '#16a34a', icon: 'fa-circle-check' },
        error:   { bg: '#dc2626', icon: 'fa-circle-exclamation' },
        info:    { bg: '#0284c7', icon: 'fa-circle-info' }
    };
    const cfg = cores[tipo] || cores.success;

    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 100000;
        background: ${cfg.bg}; color: #fff; padding: 12px 18px;
        border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.25);
        font-size: 14px; font-weight: 600; display: flex; align-items: center;
        gap: 10px; max-width: 360px; opacity: 0; transform: translateY(20px);
        transition: opacity 0.25s ease, transform 0.25s ease;
    `;
    toast.innerHTML = `<i class="fa-solid ${cfg.icon}"></i> <span>${message}</span>`;
    document.body.appendChild(toast);

    // Aparece
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // Some sozinho depois de 3 segundos
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
// Deixa acessível em toda a página
window.showToast = showToast;

// --- COMPARTILHAMENTO ---

// --- ATUALIZA A LEGENDA DO CARGO (UX MELHORADA) ---
window.updateRoleDescription = function() {
    const role = document.getElementById('shareInputRole').value;
    const desc = document.getElementById('roleDescriptionText');
    if(!desc) return;

    if (role === 'viewer') {
        desc.innerHTML = '<i class="fa-solid fa-circle-info mr-1"></i> O usuário poderá apenas <strong>estudar</strong> os cards. Seu progresso será individual.';
        desc.className = "text-[10px] text-indigo-500 font-medium ml-1 animate-fade-in";
    } else {
        desc.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i> CUIDADO: O usuário poderá <strong>editar, adicionar e excluir</strong> cards deste baralho.';
        desc.className = "text-[10px] text-amber-600 font-medium ml-1 animate-fade-in";
    }
};

// 1. Ação do Botão "Convidar"
window.shareDeckAction = async function() {
    const email = document.getElementById('shareInputEmail').value.trim();
    const role = document.getElementById('shareInputRole').value;
    
    if (!email) return showToast("Digite o e-mail do usuário.", 'success');
    if (!currentDeckName) return;

    // Codifica email para usar como chave
    const recipientRef = encodeEmail(email);
    const inviteId = `${encodeEmail(auth.currentUser.email)}_${Date.now()}`; // ID único do convite

    const inviteData = {
        ownerUid: currentUserUID,
        ownerEmail: auth.currentUser.email,
        deckPath: currentDeckName,
        role: role,
        timestamp: Date.now()
    };

    // Salva no nó global para o destinatário encontrar
    try {
        // 1. Salva no 'inbox' do destinatário
        await update(ref(db, `global_invites/${recipientRef}/${inviteId}`), inviteData);
        
        // 2. Salva no registro do deck (para eu saber quem eu convidei)
        // Usamos base64 do deckname para evitar caracteres inválidos em deep paths se necessário, 
        // mas aqui vamos salvar numa lista plana com referencia
        const myLogData = { email: email, role: role, inviteId: inviteId };
        // Caminho: users/MEU_ID/anki/shared_out/NOME_DECK_ENCODED/EMAIL_ENCODED
        const deckKey = btoa(unescape(encodeURIComponent(currentDeckName))).replace(/=/g,''); 
        await set(ref(db, `users/${currentUserUID}/anki/shared_out/${deckKey}/${recipientRef}`), myLogData);

        showToast(`Convite enviado para ${email}!`, 'success');
        document.getElementById('shareInputEmail').value = '';
        window.renderSharedUsers(); // Atualiza a lista visual
    } catch (e) {
        console.error(e);
        showToast("Erro ao compartilhar. Verifique a conexão.", 'error');
    }
};

// 2. Listar quem tem acesso (No Modal - VERSÃO VISUAL MODERNA)
window.renderSharedUsers = async function() {
    const container = document.getElementById('shareListContainer'); // <--- Note que agora buscamos o Container, não o Body da tabela
    const empty = document.getElementById('shareListEmpty');
    const badge = document.getElementById('shareCountBadge');
    
    // Limpa conteúdo anterior
    if(container) container.innerHTML = '';
    
    if (!currentDeckName) return;

    const deckKey = btoa(unescape(encodeURIComponent(currentDeckName))).replace(/=/g,''); 
    
    try {
        const snap = await get(ref(db, `users/${currentUserUID}/anki/shared_out/${deckKey}`));
        
        if (!snap.exists()) {
            if(empty) empty.classList.remove('hidden');
            if(badge) badge.innerText = "0";
            return;
        }
        
        if(empty) empty.classList.add('hidden');
        const users = snap.val();
        const userList = Object.values(users);
        
        if(badge) badge.innerText = userList.length;

        userList.forEach(user => {
            // Cria um card (DIV) para o usuário em vez de uma linha de tabela (TR)
            const item = document.createElement('div');
            item.className = "flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition group";
            
            const roleBadge = user.role === 'editor' 
                ? '<span class="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-md uppercase tracking-wide border border-amber-200">Editor</span>' 
                : '<span class="text-[9px] font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-md uppercase tracking-wide border border-indigo-200">Leitor</span>';
            
            // Iniciais do Nome (Avatar)
            const initial = user.email.charAt(0).toUpperCase();
            
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
                        ${initial}
                    </div>
                    <div class="flex flex-col">
                        <span class="text-sm font-bold text-gray-700 leading-tight">${user.email}</span>
                        <div class="flex items-center gap-2 mt-0.5">
                            ${roleBadge}
                            <span class="text-[9px] text-gray-400">Adicionado recentemente</span>
                        </div>
                    </div>
                </div>
                
                <button onclick="window.unshareDeckAction('${user.inviteId}', '${encodeEmail(user.email)}', '${deckKey}')" 
                    class="w-8 h-8 rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition flex items-center justify-center" 
                    title="Remover Acesso">
                    <i class="fa-solid fa-user-xmark"></i>
                </button>
            `;
            container.appendChild(item);
        });

    } catch (e) { console.error(e); }
};

// 3. Remover Acesso
window.unshareDeckAction = async function(inviteId, recipientEmailEnc, deckKey) {
    if(!confirm("Remover o acesso deste usuário?")) return;
    
    try {
        // Remove do 'inbox' do destinatário
        await remove(ref(db, `global_invites/${recipientEmailEnc}/${inviteId}`));
        
        // Remove do meu log
        await remove(ref(db, `users/${currentUserUID}/anki/shared_out/${deckKey}/${recipientEmailEnc}`));
        
        window.renderSharedUsers();
    } catch (e) {
        console.error(e);
        showToast("Erro ao remover acesso.", 'error');
    }
};

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
        const rawSettings = settingsSnap.exists() ? settingsSnap.val() : {};
        
        // --- CORREÇÃO: Decodifica as chaves para uso interno ---
        deckSettings = {};
        Object.keys(rawSettings).forEach(key => {
            deckSettings[decodeKey(key)] = rawSettings[key];
        });
        // -------------------------------------------------------

        // <--- NOVO: Carrega lista de compartilhamentos enviados
        const sharedOutSnap = await get(ref(db, `users/${currentUserUID}/anki/shared_out`));
        mySharedDecksMap = sharedOutSnap.exists() ? sharedOutSnap.val() : {};
        // --->

        renderDecksView();
        populateDeckSuggestions();
    } catch (e) { console.error(e); }
}

window.switchMainTab = function(category) {
    currentCategoryFilter = category;
    currentPathStack = [];
    currentDeckFilter = ""; 
    const searchInput = document.getElementById('deckSearchInput');
    if(searchInput) searchInput.value = "";
    
    // Atualiza classes visuais das abas
    document.getElementById('nav-conteudo').classList.toggle('active', category === 'conteudo');
    document.getElementById('nav-juris').classList.toggle('active', category === 'jurisprudencia');
    
    // Nova aba
    const navShared = document.getElementById('nav-shared');
    if(navShared) navShared.classList.toggle('active', category === 'shared');

    if (category === 'shared') {
        window.loadSharedDecks(); // Carrega dados da nuvem
    } else {
        renderDecksView(); // Renderiza local
    }
};

window.showDecksView = function() {
    // 1. GARANTIA: Parar qualquer timer ativo ao sair
    window.stopTimer(true);
    
    // 2. Resetar variável de sessão compartilhada
    sharedSessionOwner = null; 

    // 3. Restaurar a visibilidade dos elementos visuais
    const mainHeader = document.getElementById('mainHeader');
    if(mainHeader) mainHeader.classList.remove('hidden');

    document.getElementById('viewStudy').classList.add('hidden');
    document.getElementById('viewDecks').classList.remove('hidden');
    document.getElementById('viewEmpty').classList.add('hidden');

    // 4. CORREÇÃO DO BUG: Decidir como recarregar
    if (currentCategoryFilter === 'shared') {
        // Se for compartilhado, busca os dados atualizados na nuvem (Novos/Rev)
        window.loadSharedDecks();
    } else {
        // Se for local, apenas renderiza o que já está na memória (rápido)
        renderDecksView();
    }
};

window.loadSharedDecks = async function() {
    if (!auth.currentUser) return;
    
    // --- 1. RESET VISUAL MANUAL (Para evitar Loop com showDecksView) ---
    window.stopTimer(true); // Para o timer se estiver rodando
    const mainHeader = document.getElementById('mainHeader');
    if(mainHeader) mainHeader.classList.remove('hidden');
    
    // Garante que a tela de estudo sumiu e a de decks apareceu
    const viewStudy = document.getElementById('viewStudy');
    const viewDecks = document.getElementById('viewDecks');
    const emptyView = document.getElementById('viewEmpty');
    if(viewStudy) viewStudy.classList.add('hidden');
    if(viewDecks) viewDecks.classList.remove('hidden');
    if(emptyView) emptyView.classList.add('hidden');

    // --- 2. CONFIGURAÇÃO DOS CONTAINERS ---
    const containerDecks = document.getElementById('containerDecks');
    const containerFolders = document.getElementById('containerFolders');
    const emptyState = document.getElementById('viewDecksEmptyState');
    const sectionFolders = document.getElementById('sectionFolders');
    const sectionDecks = document.getElementById('sectionDecks');

    // Mostra estado de carregamento
    containerDecks.innerHTML = '<div class="col-span-full text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-sky-600 text-2xl"></i><p class="text-gray-400 text-sm mt-2">Sincronizando progresso...</p></div>';
    containerFolders.innerHTML = '';
    if(sectionFolders) sectionFolders.classList.add('hidden');
    if(sectionDecks) sectionDecks.classList.remove('hidden'); 
    if(emptyState) emptyState.classList.add('hidden');

    const myEmailEnc = encodeEmail(auth.currentUser.email);
    sharedDecksCache = [];

    try {
        const invitesSnap = await get(ref(db, `global_invites/${myEmailEnc}`));
        
        // Carrega MEU progresso nos decks compartilhados
        const myProgressSnap = await get(ref(db, `users/${currentUserUID}/anki/shared_progress`));
        const myProgress = myProgressSnap.exists() ? myProgressSnap.val() : {};

        if (invitesSnap.exists()) {
            const invites = invitesSnap.val();
            const now = Date.now();

            const promises = Object.values(invites).map(async (invite) => {
                const ownerCardsSnap = await get(ref(db, `users/${invite.ownerUid}/anki/cards`));
                let countTotal = 0;
                let countNew = 0;
                let countDue = 0;
                let lastRev = 0;
                
                if (ownerCardsSnap.exists()) {
                    const cards = ownerCardsSnap.val();
                    const ownerProgress = myProgress[invite.ownerUid] || {}; // Meu progresso para este dono

                    Object.keys(cards).forEach(cardKey => {
                        const c = cards[cardKey];
                        if (c.deck === invite.deckPath) {
                            countTotal++;
                            
                            // LÓGICA DE FUSÃO: Usa meu progresso se existir, senão usa padrão (Novo)
                            const myCardData = ownerProgress[cardKey] || {};
                            const nextReview = myCardData.nextReview || 0; // Se não tem progresso, é 0 (Novo)
                            const interval = myCardData.interval || 0;
                            const myLastRev = myCardData.lastReview || 0;

                            // Contagem Pessoal
                            if (nextReview <= now) { 
                                if (interval === 0) countNew++; else countDue++; 
                            }
                            if (myLastRev > lastRev) lastRev = myLastRev;
                        }
                    });
                }

                return {
                    ...invite,
                    cardCount: countTotal,
                    newCount: countNew,
                    dueCount: countDue,
                    lastReview: lastRev
                };
            });

            sharedDecksCache = await Promise.all(promises);
        }
    } catch (e) {
        console.error("Erro ao carregar compartilhados:", e);
    }

    renderDecksView(); 
};

// --- FUNÇÃO PARA INICIAR ESTUDO COMPARTILHADO ---
window.startSharedSession = async function(ownerUid, deckPath, role) {
    // 1. Define estado compartilhado
    sharedSessionOwner = ownerUid; 
    currentDeckName = deckPath;
    
    const mainHeader = document.getElementById('mainHeader');
    if(mainHeader) mainHeader.classList.add('hidden');
    document.getElementById('viewDecks').classList.add('hidden');
    document.getElementById('viewStudy').classList.remove('hidden');
    document.getElementById('deckTitleDisplay').innerText = "Carregando e Mesclando...";
    
    try {
        // 2. Busca cards do Dono (Conteúdo)
        const snap = await get(ref(db, `users/${ownerUid}/anki/cards`));
        
        // 3. Busca MEU progresso para esses cards
        const progressSnap = await get(ref(db, `users/${currentUserUID}/anki/shared_progress/${ownerUid}`));
        const myProgress = progressSnap.exists() ? progressSnap.val() : {};

        if (!snap.exists()) {
            showToast("Baralho vazio ou não encontrado.", 'error');
            return window.showDecksView();
        }

        const cardsObj = snap.val();
        const now = Date.now();

        // 4. Mescla Conteúdo + Meu Progresso
        const cards = Object.keys(cardsObj)
            .filter(key => cardsObj[key].deck === deckPath)
            .map(key => {
                const original = cardsObj[key];
                const myData = myProgress[key] || {}; // Pega meu intervalo salvo ou vazio

                return {
                    ...original, // Traz frente/verso do dono
                    firebaseKey: key,
                    // Sobrescreve dados de agendamento com os MEUS dados
                    interval: myData.interval || 0,
                    ease: myData.ease || 2.5,
                    nextReview: myData.nextReview || 0, // Se não tiver, é 0 (agora)
                    lastReview: myData.lastReview || 0,
                    lastRating: myData.lastRating || null
                };
            });

        if (cards.length === 0) {
            showToast("Este baralho está vazio.", 'error');
            return window.showDecksView();
        }

        // 5. Filtra o que precisa estudar (baseado nos dados mesclados)
        // Se for Cramming (Estudo Extra), pega tudo. Se não, pega só vencidos.
        if (pendingIsCramming) {
            studyQueue = cards;
        } else {
            studyQueue = cards.filter(c => c.nextReview <= now || c.interval === 0);
        }
        
        shuffleArray(studyQueue);

        if (studyQueue.length === 0) {
            showToast("Tudo em dia! Use o modo 'Revisar Tudo' se quiser praticar.", 'success');
            return window.showDecksView();
        }

        currentCardIndex = 0;
        initialSessionLength = studyQueue.length;

        // ETAPA 2: zera o placar e o histórico de desfazer ao começar a sessão
        sessionHits = 0;
        sessionMiss = 0;
        lastActionStack = [];

        document.getElementById('deckTitleDisplay').innerText = deckPath.split('::').pop() + " (Compartilhado)";
        
        // Esconde botão de editar (já que o conteúdo é do dono, editar o texto é complexo neste modo)
        // Mas permitimos se for 'editor' (embora nossa lógica de salvamento abaixo foque no progresso)
        const editBtn = document.querySelector('#flashcardContainer button[title="Editar Card"]');
        if(editBtn) editBtn.style.display = 'none'; // Por segurança, desabilita edição de texto no modo estudo individual

        showCurrentCard();

    } catch (e) {
        console.error("Erro ao carregar compartilhado:", e);
        showToast("Erro de conexão.", 'error');
        window.showDecksView();
    }
};

// --- FUNÇÃO DE FILTRO (BUSCA) ---
window.filterDecks = function(value) {
    currentDeckFilter = value.trim().toLowerCase();
    renderDecksView();
};

// --- FUNÇÕES DE NAVEGAÇÃO DO ESTUDO (VOLTAR E PULAR) ---

window.backToFolder = function() {
    // Limpa a fila e reseta o índice para garantir segurança
    studyQueue = [];
    currentCardIndex = 0;
    window.showDecksView();
};

window.skipCard = async function() {
    if (!studyQueue || studyQueue.length === 0) return window.backToFolder();
    
    const card = studyQueue[currentCardIndex];
    if (!card) return;

    if (studyQueue.length === 1) {
        if(confirm("Este é o último card. Deseja adiá-lo por 5 minutos?")) {
            try {
                const updates = {};
                const fiveMinutesLater = Date.now() + (5 * 60 * 1000);
                updates[`users/${currentUserUID}/anki/cards/${card.firebaseKey}/nextReview`] = fiveMinutesLater;
                await update(ref(db), updates);
                studyQueue = [];
                showToast("Card adiado. Sessão finalizada.", 'success');
                window.showDecksView();
            } catch (e) { console.error(e); }
        }
        return;
    }

    const skippedCard = studyQueue.splice(currentCardIndex, 1)[0];
    studyQueue.push(skippedCard);
    showCurrentCard();
    
    const container = document.getElementById('flashcardContainer');
    container.classList.add('opacity-50');
    setTimeout(() => container.classList.remove('opacity-50'), 200);
};

// --- NAVEGAÇÃO DE PASTAS ---

window.enterFolder = function(folderName) {
    currentPathStack.push(folderName);
    currentDeckFilter = ""; // Limpa filtro ao entrar na pasta
    const searchInput = document.getElementById('deckSearchInput');
    if(searchInput) searchInput.value = "";
    renderDecksView();
};

window.navigateUp = function() {
    currentPathStack.pop();
    renderDecksView();
};

window.navigateToPath = function(index) {
    currentPathStack = currentPathStack.slice(0, index + 1);
    currentDeckFilter = ""; // Limpa filtro ao navegar
    const searchInput = document.getElementById('deckSearchInput');
    if(searchInput) searchInput.value = "";
    renderDecksView();
};

window.resetPath = function() {
    currentPathStack = [];
    currentDeckFilter = ""; // Limpa filtro
    const searchInput = document.getElementById('deckSearchInput');
    if(searchInput) searchInput.value = "";
    renderDecksView();
};

window.createFolderFlow = function() {
    const folderName = prompt("Nome da Nova Pasta:");
    if(!folderName || !folderName.trim()) return;
    window.enterFolder(folderName.trim());
    const hint = document.createElement('div');
    hint.className = 'fixed bottom-4 right-4 bg-sky-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 animate-bounce';
    hint.innerHTML = '<i class="fa-solid fa-circle-info mr-2"></i> Pasta criada! Crie um card agora para salvá-la.';
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 4000);
};

// --- DRAG & DROP HANDLERS ---

window.handleDragStart = function(e, path) {
    draggedItemPath = path;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if(e.target) e.target.classList.add('drag-source'); }, 0);
};

window.handleDragEnd = function(e) {
    if(e.target) e.target.classList.remove('drag-source');
    document.querySelectorAll('.drag-target').forEach(el => el.classList.remove('drag-target'));
    draggedItemPath = null;
};

window.handleDragOver = function(e, targetPath, isFolder) {
    e.preventDefault(); 
    if (!draggedItemPath || draggedItemPath === targetPath) return;
    if (targetPath && targetPath.startsWith(draggedItemPath + "::")) return;

    if (isFolder) { 
        e.currentTarget.classList.add('drag-target'); 
        e.dataTransfer.dropEffect = 'move'; 
    } else { 
        e.dataTransfer.dropEffect = 'none'; 
    }
};

window.handleDragLeave = function(e) { 
    e.currentTarget.classList.remove('drag-target'); 
};

window.handleDrop = async function(e, targetPath) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-target');
    
    if (!draggedItemPath || draggedItemPath === targetPath) return;

    const itemName = draggedItemPath.split("::").pop();
    const targetName = targetPath ? targetPath.split("::").pop() : "Início";
    
    let newPath = targetPath === "" ? itemName : targetPath + "::" + itemName;

    if (confirm(`Mover "${itemName}" para dentro de "${targetName}"?`)) { 
        await executeMove(draggedItemPath, newPath); 
    }
};

async function executeMove(oldPrefix, newPrefix) {
    const updates = {};
    const renomeados = []; // {key, novoDeck}
    let count = 0;

    Object.keys(allCards).forEach(key => {
        const deck = allCards[key].deck || "";
        if (deck === oldPrefix || deck.startsWith(oldPrefix + "::")) {
            const newDeckName = newPrefix + deck.substring(oldPrefix.length);
            updates[`users/${currentUserUID}/anki/cards/${key}/deck`] = newDeckName;
            renomeados.push({ key, novoDeck: newDeckName });
            count++;
        }
    });

    if (count > 0) { 
        try { 
            await update(ref(db), updates); 
            // Velocidade: atualiza a memória local em vez de rebaixar tudo da nuvem
            renomeados.forEach(r => { if (allCards[r.key]) allCards[r.key].deck = r.novoDeck; });
            renderDecksView();
            if(!document.getElementById('deckConfigModal').classList.contains('hidden')) window.closeDeckConfigModal(); 
            showToast("Movido com sucesso.", 'success');
        } catch(e) { 
            console.error(e); 
            showToast("Erro ao mover: " + e.message, 'error'); 
        } 
    } else { 
        showToast("Nenhum item encontrado.", 'error'); 
    }
}


// --- RENDERIZAÇÃO GRID (LAYOUT UNIFICADO E CLEAN) ---
function renderDecksView() {
    // --- LÓGICA PARA ABA COMPARTILHADOS ---
    if (currentCategoryFilter === 'shared') {
        const container = document.getElementById('containerDecks');
        const empty = document.getElementById('viewDecksEmptyState');
        const sectionDecks = document.getElementById('sectionDecks');
        const sectionFolders = document.getElementById('sectionFolders');
        
        container.innerHTML = '';
        document.getElementById('containerFolders').innerHTML = '';
        sectionFolders.classList.add('hidden');
        
        if (sharedDecksCache.length === 0) {
            empty.classList.remove('hidden');
            empty.innerHTML = `<i class="fa-regular fa-paper-plane text-4xl mb-3"></i><p>Nenhum baralho compartilhado com você.</p>`;
            sectionDecks.classList.add('hidden');
        } else {
            empty.classList.add('hidden');
            sectionDecks.classList.remove('hidden');
            document.getElementById('countDecks').innerText = sharedDecksCache.length;

            sharedDecksCache.forEach(deck => {
                const cardEl = document.createElement('div');
                const totalDue = deck.newCount + deck.dueCount;
                const isDue = totalDue > 0;
                
                // Status Border (Igual ao dono)
                const statusBorder = isDue ? 'border-l-4 border-l-sky-500' : 'border-l-4 border-l-gray-200';
                
                cardEl.className = `bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-sky-300 transition flex flex-col justify-between h-40 group relative overflow-hidden ${statusBorder}`;
                
                let lastRevText = "Nunca";
                if (deck.lastReview > 0) lastRevText = new Date(deck.lastReview).toLocaleDateString('pt-BR');

                const roleBadge = deck.role === 'editor' 
                    ? '<span class="bg-indigo-100 text-indigo-700 text-[9px] px-2 py-0.5 rounded font-bold uppercase border border-indigo-200">Editor</span>'
                    : '<span class="bg-gray-100 text-gray-500 text-[9px] px-2 py-0.5 rounded font-bold uppercase border border-gray-200">Visualizador</span>';

                // Botão de lixeira (Posicionado no topo direito, igual às ações do dono)
                const removeBtn = `<div class="deck-actions z-30 absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"><button class="text-gray-300 hover:text-red-500 transition" onclick="window.unshareDeckAction('${deck.inviteId}', '${encodeEmail(auth.currentUser.email)}', '${btoa(unescape(encodeURIComponent(deck.deckPath))).replace(/=/g,'')}')" title="Remover Acesso"><i class="fa-solid fa-trash"></i></button></div>`;
                
                // CÁLCULO DE PROGRESSO
                const totalCards = deck.cardCount || 1;
                const learnedCards = deck.cardCount - deck.newCount;
                const progressPercent = Math.round((learnedCards / totalCards) * 100);
                
                let barColor = 'bg-sky-500';
                if(progressPercent >= 100) barColor = 'bg-emerald-500';
                else if(progressPercent < 20) barColor = 'bg-gray-300';

                cardEl.innerHTML = `
                    ${removeBtn}
                    <div onclick="window.prepareSharedSession('${deck.ownerUid}', '${deck.deckPath}', '${deck.role}', ${totalDue})" class="cursor-pointer h-full flex flex-col justify-between relative z-10">
                        
                        <div>
                            <div class="pr-6 flex justify-between items-start gap-2">
                                <h3 class="font-bold text-gray-800 text-base leading-tight group-hover:text-sky-600 transition truncate" title="${deck.deckPath.split('::').pop()}">${deck.deckPath.split('::').pop()}</h3>
                                ${roleBadge}
                            </div>
                            <div class="mt-1">
                                <p class="text-[10px] text-gray-400 font-bold uppercase truncate max-w-[90%]"><i class="fa-solid fa-user-circle mr-1"></i> ${deck.ownerEmail || 'Usuário'}</p>
                                <p class="text-[10px] text-gray-400 font-medium mt-0.5"><i class="fa-regular fa-clock mr-1"></i> ${lastRevText === 'Nunca' ? 'Nunca estudado' : lastRevText}</p>
                            </div>
                        </div>

                        <div class="w-full mt-2 mb-1">
                            <div class="flex justify-between text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                                <span>Domínio</span>
                                <span>${progressPercent}%</span>
                            </div>
                            <div class="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                <div class="h-full ${barColor} transition-all duration-700" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>

                        <div class="flex items-center justify-between pt-2 border-t border-gray-50">
                            <div class="flex gap-4">
                                <div class="flex flex-col items-center">
                                    <span class="text-base font-bold text-green-500">${deck.newCount}</span>
                                    <span class="text-[10px] font-bold text-gray-400 uppercase leading-none">Novos</span>
                                </div>
                                <div class="flex flex-col items-center">
                                    <span class="text-base font-bold text-sky-600">${deck.dueCount}</span>
                                    <span class="text-[10px] font-bold text-gray-400 uppercase leading-none">Rev</span>
                                </div>
                                <div class="flex flex-col items-center">
                                    <span class="text-base font-bold text-gray-400">${deck.cardCount}</span>
                                    <span class="text-[10px] font-bold text-gray-300 uppercase leading-none">Total</span>
                                </div>
                            </div>
                            <div class="w-8 h-8 rounded-full ${isDue ? 'bg-sky-600 text-white shadow-md shadow-sky-200' : 'bg-gray-100 text-gray-300'} flex items-center justify-center transition-all transform group-hover:scale-110">
                                <i class="fa-solid fa-play ml-0.5 text-xs"></i>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(cardEl);
            });
        }
        return;
    }

    // --- LÓGICA PADRÃO (MEUS BARALHOS) ---

    const breadcrumbContainer = document.getElementById('deckBreadcrumbs');
    const sectionFolders = document.getElementById('sectionFolders');
    const containerFolders = document.getElementById('containerFolders');
    const countFolders = document.getElementById('countFolders');
    const sectionDecks = document.getElementById('sectionDecks');
    const containerDecks = document.getElementById('containerDecks');
    const countDecks = document.getElementById('countDecks');
    const emptyState = document.getElementById('viewDecksEmptyState');

    containerFolders.innerHTML = '';
    containerDecks.innerHTML = '';
    sectionFolders.classList.add('hidden');
    sectionDecks.classList.add('hidden');
    emptyState.classList.add('hidden');

    if (currentPathStack.length === 0) {
        breadcrumbContainer.classList.add('hidden');
    } else {
        breadcrumbContainer.classList.remove('hidden');
        let breadHTML = `<button onclick="window.resetPath()" ondragover="window.handleDragOver(event, '', true)" ondragleave="window.handleDragLeave(event)" ondrop="window.handleDrop(event, '')" class="hover:text-sky-600 flex items-center gap-1 px-2 py-1 rounded transition border border-transparent hover:border-sky-200 hover:bg-sky-50"><i class="fa-solid fa-house"></i> Início</button>`;
        let accumulatedPath = "";
        currentPathStack.forEach((folder, index) => {
            if (index > 0) accumulatedPath += "::";
            accumulatedPath += folder;
            const thisPath = accumulatedPath; 
            breadHTML += ` <span class="text-gray-300 text-xs"><i class="fa-solid fa-chevron-right"></i></span> `;
            if (index === currentPathStack.length - 1) { 
                breadHTML += `<span class="font-bold text-sky-700 px-2 py-1">${folder}</span>`; 
            } else { 
                breadHTML += `<button onclick="window.navigateToPath(${index})" ondragover="window.handleDragOver(event, '${thisPath}', true)" ondragleave="window.handleDragLeave(event)" ondrop="window.handleDrop(event, '${thisPath}')" class="hover:text-sky-600 px-2 py-1 rounded transition border border-transparent hover:border-sky-200 hover:bg-sky-50">${folder}</button>`; 
            }
        });
        breadcrumbContainer.innerHTML = breadHTML;
    }

    const currentPrefix = currentPathStack.length > 0 ? currentPathStack.join("::") + "::" : "";
    const groups = {}; 
    const now = Date.now();

    Object.keys(allCards).forEach(key => {
        const card = allCards[key];
        const cardCat = card.category || 'conteudo';
        if (cardCat !== currentCategoryFilter) return;

        const deckFullName = card.deck || 'Geral';
        
        if (currentPrefix === "" || deckFullName.startsWith(currentPrefix)) {
            const relativeName = deckFullName.substring(currentPrefix.length);
            const parts = relativeName.split('::');
            const rootItem = parts[0];

            if (!groups[rootItem]) { 
                groups[rootItem] = { isFolder: false, fullPath: currentPrefix + rootItem, total: 0, due: 0, new: 0, lastReview: 0 }; 
            }

            if (parts.length > 1) groups[rootItem].isFolder = true;

            groups[rootItem].total++;
            if (card.nextReview <= now) { 
                if (card.interval === 0) groups[rootItem].new++; else groups[rootItem].due++; 
            }
            if (card.lastReview && card.lastReview > groups[rootItem].lastReview) { 
                groups[rootItem].lastReview = card.lastReview; 
            }
        }
    });

    let items = Object.keys(groups);
    if (currentDeckFilter) {
        items = items.filter(name => name.toLowerCase().includes(currentDeckFilter));
    }

    const sharedPaths = new Set();
    if (filterOnlyShared) {
        Object.keys(mySharedDecksMap).forEach(key => {
            try {
                const path = decodeURIComponent(escape(atob(key)));
                sharedPaths.add(path);
            } catch(e) {}
        });
    }

    if (items.length === 0) {
        emptyState.classList.remove('hidden');
        if (currentDeckFilter) {
            emptyState.innerHTML = `<i class="fa-solid fa-magnifying-glass text-4xl mb-3"></i><p>Nenhum resultado para "${currentDeckFilter}".</p>`;
        } else {
            emptyState.innerHTML = `<i class="fa-regular fa-folder-open text-4xl mb-3"></i><p>Esta pasta está vazia.</p><p class="text-xs mt-2">Clique em <span class="text-sky-600 cursor-pointer font-bold hover:underline" onclick="window.openCreateModal()">Novo Card</span> para começar.</p>`;
        }
        return;
    }

    let foldersAdded = 0;
    let decksAdded = 0;

    items.sort().forEach(itemName => {
        const info = groups[itemName];

        const deckKey = btoa(unescape(encodeURIComponent(info.fullPath))).replace(/=/g,'');
        const isSharedOut = mySharedDecksMap[deckKey] ? true : false;
        
        if (filterOnlyShared) {
            if (!info.isFolder && !isSharedOut) return;
            if (info.isFolder) {
                let containsShared = false;
                for (let sPath of sharedPaths) {
                    if (sPath.startsWith(info.fullPath + "::")) {
                        containsShared = true;
                        break;
                    }
                }
                if (!containsShared) return;
            }
        }

        const totalDue = info.due + info.new;
        const isDue = totalDue > 0;
        
        let lastRevText = "Nunca";
        if (info.lastReview > 0) { 
            const d = new Date(info.lastReview); 
            lastRevText = d.toLocaleDateString('pt-BR'); 
        }

        const cardEl = document.createElement('div');
        cardEl.setAttribute('draggable', 'true');
        cardEl.ondragstart = (e) => window.handleDragStart(e, info.fullPath);
        cardEl.ondragend = (e) => window.handleDragEnd(e);
        cardEl.ondragover = (e) => window.handleDragOver(e, info.fullPath, info.isFolder);
        cardEl.ondragleave = (e) => window.handleDragLeave(e);
        cardEl.ondrop = (e) => window.handleDrop(e, info.fullPath);
        
        if (info.isFolder) {
            foldersAdded++;
            cardEl.className = `bg-white rounded-2xl p-5 shadow-sm border border-amber-200/50 hover:shadow-lg hover:border-amber-300 transition flex flex-col justify-between h-40 group relative overflow-hidden`;
            
            cardEl.innerHTML = `
                <div class="deck-actions z-30">
                    <div class="drag-handle mr-2" title="Segure para arrastar"><i class="fa-solid fa-grip-vertical"></i></div>
                    <button class="btn-deck-action" onclick="window.renameFolder('${info.fullPath}', event)" title="Renomear Pasta"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-deck-action del" onclick="window.deleteFolder('${info.fullPath}', event)" title="Excluir Pasta"><i class="fa-solid fa-trash"></i></button>
                </div>
                
                <div onclick="window.enterFolder('${itemName}')" class="cursor-pointer h-full flex flex-col justify-between">
                    <div class="flex items-start gap-3 mt-2">
                        <div class="text-2xl text-amber-400"><i class="fa-solid fa-folder"></i></div>
                        <div>
                            <h3 class="font-bold text-gray-800 text-base group-hover:text-amber-600 transition truncate pr-8 leading-tight">${itemName}</h3>
                            <p class="text-[10px] text-gray-400 mt-0.5 uppercase font-bold tracking-wider">Pasta</p>
                        </div>
                    </div>
                    <div class="flex items-end justify-between mt-2 pl-1">
                        <div class="flex gap-3 opacity-70">
                            <div class="flex flex-col items-center">
                                <span class="text-base font-extrabold text-gray-600">${info.new}</span>
                                <span class="text-[10px] font-bold text-gray-400 uppercase leading-none">Novos</span>
                            </div>
                            <div class="flex flex-col items-center">
                                <span class="text-base font-extrabold text-sky-600">${info.due}</span>
                                <span class="text-[10px] font-bold text-gray-400 uppercase leading-none">Rev</span>
                            </div>
                        </div>
                        <div class="flex gap-2">
                             <button onclick="window.studyFolder('${info.fullPath}', event)" class="w-8 h-8 rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200 hover:scale-110 transition flex items-center justify-center shadow-sm" title="Estudar Tudo Nesta Pasta"><i class="fa-solid fa-play ml-0.5 text-xs"></i></button>
                             <div class="w-8 h-8 rounded-full bg-gray-50 text-gray-300 flex items-center justify-center"><i class="fa-solid fa-chevron-right text-xs"></i></div>
                        </div>
                    </div>
                </div>
            `;
            containerFolders.appendChild(cardEl);
        } else {
            decksAdded++;
            
            let sharedIconHTML = '';
            if (isSharedOut) {
                sharedIconHTML = `
                    <div class="w-8 h-8 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-500 mr-2" title="Este baralho está compartilhado">
                        <i class="fa-solid fa-share-nodes text-xs"></i>
                    </div>
                `;
            }

            const totalCards = info.total || 1;
            const learnedCards = info.total - info.new;
            const progressPercent = Math.round((learnedCards / totalCards) * 100);
            
            let barColor = 'bg-sky-500';
            if(progressPercent >= 100) barColor = 'bg-emerald-500';
            else if(progressPercent < 20) barColor = 'bg-gray-300';

            const statusBorder = isDue ? 'border-l-4 border-l-sky-500' : 'border-l-4 border-l-gray-200'; 
            
            cardEl.className = `bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:shadow-md hover:border-sky-300 transition flex flex-col justify-between h-40 group relative overflow-hidden ${statusBorder}`;
            
            cardEl.innerHTML = `
                <div class="deck-actions z-30 opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 flex gap-2">
                    <div class="drag-handle cursor-grab text-gray-300 hover:text-gray-500" title="Arrastar"><i class="fa-solid fa-grip-vertical"></i></div>
                    <button class="text-gray-400 hover:text-sky-600 transition" onclick="window.renameDeck('${info.fullPath}', event)" title="Renomear"><i class="fa-solid fa-pen"></i></button>
                    <button class="text-gray-400 hover:text-sky-600 transition" onclick="window.openDeckConfig('${info.fullPath}', event)" title="Configurações"><i class="fa-solid fa-gear"></i></button>
                    <button class="text-gray-400 hover:text-sky-600 transition" onclick="window.quickExportDeck('${info.fullPath}', event)" title="Exportar"><i class="fa-solid fa-download"></i></button>
                    <button class="text-gray-400 hover:text-red-500 transition" onclick="window.deleteDeck('${info.fullPath}', event)" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </div>
                
                <div onclick="window.checkAndStartSession('${info.fullPath}', ${totalDue})" class="cursor-pointer h-full flex flex-col justify-between relative z-10">
                    
                    <div>
                        <div class="pr-20"> <h3 class="font-bold text-gray-800 text-base leading-tight group-hover:text-sky-600 transition truncate" title="${itemName}">${itemName}</h3>
                            <p class="text-[10px] text-gray-400 mt-1 font-medium"><i class="fa-regular fa-clock mr-1"></i> ${lastRevText === 'Nunca' ? 'Nunca estudado' : lastRevText}</p>
                        </div>
                    </div>

                    <div class="w-full mt-2 mb-1">
                        <div class="flex justify-between text-[9px] font-bold text-gray-400 mb-1 uppercase tracking-wider">
                            <span>Domínio</span>
                            <span>${progressPercent}%</span>
                        </div>
                        <div class="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                            <div class="h-full ${barColor} transition-all duration-700" style="width: ${progressPercent}%"></div>
                        </div>
                    </div>

                    <div class="flex items-center justify-between pt-2 border-t border-gray-50">
                        <div class="flex gap-4">
                            <div class="flex flex-col items-center">
                                <span class="text-base font-bold text-green-500">${info.new}</span>
                                <span class="text-[10px] font-bold text-gray-400 uppercase leading-none">Novos</span>
                            </div>
                            <div class="flex flex-col items-center">
                                <span class="text-base font-bold text-sky-600">${info.due}</span>
                                <span class="text-[10px] font-bold text-gray-400 uppercase leading-none">Rev</span>
                            </div>
                            <div class="flex flex-col items-center">
                                <span class="text-base font-bold text-gray-400">${info.total}</span>
                                <span class="text-[10px] font-bold text-gray-300 uppercase leading-none">Total</span>
                            </div>
                            <div class="flex flex-col items-center" title="Quantas vezes você concluiu o baralho inteiro">
                                <span class="text-base font-bold text-purple-500">${(deckSettings[info.fullPath] && deckSettings[info.fullPath].roundsCompleted) || 0}</span>
                                <span class="text-[10px] font-bold text-gray-400 uppercase leading-none">Voltas</span>
                            </div>
                        </div>

                        <div class="flex items-center gap-2">
                            <button onclick="window.resetDeckFull('${info.fullPath}', event)" class="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:bg-red-100 hover:text-red-600 hover:scale-110 transition flex items-center justify-center shadow-sm border border-gray-100" title="Reset Total: zera todo o progresso deste baralho">
                                <i class="fa-solid fa-broom text-xs"></i>
                            </button>
                            <button onclick="window.resetDeckCount('${info.fullPath}', event)" class="w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:bg-amber-100 hover:text-amber-600 hover:scale-110 transition flex items-center justify-center shadow-sm border border-gray-100" title="Zerar apenas a contagem de acertos/erros deste baralho">
                                <i class="fa-solid fa-arrow-rotate-left text-xs"></i>
                            </button>
                            ${sharedIconHTML} <div class="w-8 h-8 rounded-full ${isDue ? 'bg-sky-600 text-white shadow-md shadow-sky-200' : 'bg-gray-100 text-gray-300'} flex items-center justify-center transition-all transform group-hover:scale-110">
                                <i class="fa-solid fa-play ml-0.5 text-xs"></i>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            containerDecks.appendChild(cardEl);
        }
    });

    if(foldersAdded > 0) {
        sectionFolders.classList.remove('hidden');
        countFolders.innerText = foldersAdded;
    }
    
    if(decksAdded > 0) {
        sectionDecks.classList.remove('hidden');
        countDecks.innerText = decksAdded;
    }
    
    if(foldersAdded === 0 && decksAdded === 0) {
        emptyState.classList.remove('hidden');
    }
}

// --- ESTUDAR SÓ SANGUESSUGAS (cards com fator de facilidade muito baixo) ---
// Reaproveita o mesmo motor de estudo da função studyFolder.
window.studyLeeches = function() {
    // Junta todas as sanguessugas da aba atual (Conteúdo ou Jurisprudência).
    // O critério (ease < 1.35) é o MESMO já usado no Gerenciador.
    const leeches = Object.keys(allCards)
        .map(key => ({ ...allCards[key], firebaseKey: key }))
        .filter(c => {
            const isLeech = c.ease && c.ease < 1.35;
            const matchesCat = (c.category || 'conteudo') === currentCategoryFilter;
            return isLeech && matchesCat;
        });

    // Se não houver nenhuma, avisa de forma amigável e para por aqui.
    if (leeches.length === 0) {
        showToast("Nenhuma sanguessuga encontrada nesta aba. Bom trabalho! 🎉", 'success');
        return;
    }

    // Monta a fila customizada e abre a tela de timer (modo "revisar tudo").
    pendingDeckName = "🐛 Sanguessugas (" + leeches.length + " cards)";
    pendingIsCramming = true;
    window.customStudyQueue = leeches;
    openTimerConfig(pendingDeckName, true);
};

// --- NOVA FUNÇÃO: ESTUDAR PASTA RECURSIVAMENTE ---
window.studyFolder = function(folderPath, event) {
    if(event) event.stopPropagation();

    const now = Date.now();
    // Filtra todas as cartas que começam com o caminho da pasta
    let cards = Object.keys(allCards)
        .map(key => ({ ...allCards[key], firebaseKey: key }))
        .filter(c => {
            const deck = c.deck || "";
            const matchesPath = deck === folderPath || deck.startsWith(folderPath + "::");
            const matchesCat = (c.category || 'conteudo') === currentCategoryFilter;
            return matchesPath && matchesCat;
        });

    // Filtra apenas as que precisam de revisão ou são novas
    let dueCards = cards.filter(c => c.nextReview <= now || c.interval === 0);
    
    if (dueCards.length === 0) {
        if(confirm(`Nada vencido nesta pasta (Total: ${cards.length} cartas).\n\nDeseja revisar TUDO nesta pasta (Modo Cramming)?`)) {
            pendingDeckName = folderPath + " (Revisão Geral)"; // Nome fictício para exibição
            pendingIsCramming = true;
            // Hack: Precisamos injetar as cartas manualmente pois startStudySession busca por nome exato do deck
            // Vamos criar uma função auxiliar ou adaptar a logica de start.
            // Para simplificar, vamos usar uma variável global temporária para 'customQueue'
            window.customStudyQueue = cards;
            openTimerConfig(pendingDeckName, true);
        }
        return;
    }

    pendingDeckName = folderPath + " (Acumulado)";
    pendingIsCramming = false;
    window.customStudyQueue = dueCards; // Fila customizada
    openTimerConfig(pendingDeckName, false);
};

// --- PEQUENO AJUSTE NA FUNÇÃO startStudySession PARA ACEITAR FILA CUSTOMIZADA ---
// Substitua ou atualize sua função startStudySession por esta:
function startStudySession(deckName, isCramming) {
    currentDeckName = deckName;
    const now = Date.now();

// LOGICA DE FILA (IGUAL)
    if (window.customStudyQueue) {
        studyQueue = window.customStudyQueue;
        window.customStudyQueue = null;
    } else {
        let cards = Object.keys(allCards).map(key => ({ ...allCards[key], firebaseKey: key }))
            .filter(c => c.deck === deckName && (c.category || 'conteudo') === currentCategoryFilter);
        studyQueue = isCramming ? cards : cards.filter(c => c.nextReview <= now || c.interval === 0);
    }
    
    shuffleArray(studyQueue);

    if (!studyQueue || studyQueue.length === 0) return showToast("Não há cartas para revisar agora.", 'success');

    // NOVO: Define o tamanho total para a barra de progresso
    initialSessionLength = studyQueue.length;
    currentCardIndex = 0;

    // ETAPA 2: zera o placar e o histórico de desfazer ao começar a sessão
    sessionHits = 0;
    sessionMiss = 0;
    lastActionStack = [];
    
    // UI Updates...
    const mainHeader = document.getElementById('mainHeader');
    if(mainHeader) mainHeader.classList.add('hidden'); 

    const viewDecks = document.getElementById('viewDecks');
    if(viewDecks) viewDecks.classList.add('hidden');
    
    const viewStudy = document.getElementById('viewStudy');
    if(viewStudy) viewStudy.classList.remove('hidden');
    
    const viewEmpty = document.getElementById('viewEmpty');
    if(viewEmpty) viewEmpty.classList.add('hidden');
    
    const btnNewFolder = document.getElementById('btnNewFolderHeader');
    if(btnNewFolder) btnNewFolder.classList.add('hidden');

    const titleEl = document.getElementById('deckTitleDisplay');
    if(titleEl) titleEl.innerText = deckName; // Exibe o nome da pasta ou do deck

    showCurrentCard();
}

// --- FUNÇÃO PARA EXPANDIR/RECOLHER SEÇÕES (ACCORDION) ---
window.toggleDeckSection = function(sectionId) {
    const section = document.getElementById(sectionId);
    if(!section) return;
    
    const content = section.querySelector('.section-content');
    const icon = section.querySelector('.chevron-icon');
    
    if(content) content.classList.toggle('collapsed');
    if(icon) icon.classList.toggle('rotated');
};

// --- OPERAÇÕES DE BARALHO E PASTA ---

window.renameFolder = async function(oldPrefix, ev) {
    ev.stopPropagation();
    const newName = prompt("Novo nome para a pasta:", oldPrefix.split("::").pop());
    if (!newName) return;
    
    const parts = oldPrefix.split("::"); 
    parts.pop(); 
    parts.push(newName);
    const newPrefix = parts.join("::");

    await executeMove(oldPrefix, newPrefix);
};

window.deleteFolder = async function(prefix, ev) {
    ev.stopPropagation();
    if (!confirm(`Tem certeza que deseja apagar a pasta "${prefix}" e TODOS os baralhos dentro dela?`)) return;

    const updates = {};
    const removidos = [];
    Object.keys(allCards).forEach(key => {
        const deck = allCards[key].deck || "";
        if (deck === prefix || deck.startsWith(prefix + "::")) {
            updates[`users/${currentUserUID}/anki/cards/${key}`] = null;
            removidos.push(key);
        }
    });

    try {
        await update(ref(db), updates);
        // Velocidade: atualiza a memória local em vez de rebaixar tudo da nuvem
        removidos.forEach(key => delete allCards[key]);
        renderDecksView();
        showToast("Pasta apagada.", 'success');
    } catch(e) {
        console.error(e);
        showToast("Erro ao apagar a pasta.", 'error');
    }
};

window.renameDeck = async function(oldName, ev) {
    ev.stopPropagation();
    const newName = prompt("Novo nome:", oldName);
    if (!newName || newName === oldName) return;
    const updates = {};
    const afetados = [];
    Object.keys(allCards).forEach(key => {
        if (allCards[key].deck === oldName) {
            updates[`users/${currentUserUID}/anki/cards/${key}/deck`] = newName;
            afetados.push(key);
        }
    });
    try {
        await update(ref(db), updates);
        // Velocidade: atualiza a memória local
        afetados.forEach(key => { if (allCards[key]) allCards[key].deck = newName; });
        renderDecksView();
        showToast("Baralho renomeado.", 'success');
    } catch(e) {
        console.error(e);
        showToast("Erro ao renomear o baralho.", 'error');
    }
};

window.deleteDeck = async function(deckName, ev) {
    ev.stopPropagation();
    if (!confirm("Apagar baralho?")) return;
    const updates = {};
    const removidos = [];
    Object.keys(allCards).forEach(key => {
        if (allCards[key].deck === deckName) {
            updates[`users/${currentUserUID}/anki/cards/${key}`] = null;
            removidos.push(key);
        }
    });
    try {
        await update(ref(db), updates);
        // Velocidade: atualiza a memória local
        removidos.forEach(key => delete allCards[key]);
        renderDecksView();
        showToast("Baralho apagado.", 'success');
    } catch(e) {
        console.error(e);
        showToast("Erro ao apagar o baralho.", 'error');
    }
};

// --- ÁRVORE DE PASTAS RECURSIVA ---

function identifyDecksWithCards() {
    const deckSet = new Set();
    Object.values(allCards).forEach(card => {
        if((card.category||'conteudo') !== currentCategoryFilter) return;
        if(card.deck) deckSet.add(card.deck);
    });
    return deckSet;
}

function buildTreeStructure(paths, decksWithCards) {
    const root = { name: "Início (Raiz)", path: "", children: {}, isDeck: false };
    
    paths.forEach(path => {
        if(!path) return;
        const parts = path.split("::");
        let currentNode = root;
        let builtPath = "";

        parts.forEach((part, index) => {
            builtPath = builtPath ? builtPath + "::" + part : part;
            if (!currentNode.children[part]) {
                currentNode.children[part] = {
                    name: part,
                    path: builtPath,
                    children: {},
                    isDeck: decksWithCards.has(builtPath)
                };
            }
            currentNode = currentNode.children[part];
        });
    });
    return root;
}

function createTreeNodeHTML(node, isSelectionMode = false) {
    const hasChildren = Object.keys(node.children).length > 0;
    
    let isDisabled = false;
    
    if (isSelectionMode) {
        if (node.isDeck && node.path !== "") isDisabled = true;
    } else {
        const isSelf = node.path === currentDeckName;
        const isChildOfSelf = node.path.startsWith(currentDeckName + "::");
        const isLeafDeck = node.isDeck && node.path !== "";
        isDisabled = isSelf || isChildOfSelf || isLeafDeck;
    }

    let iconClass = "tree-toggle"; 
    if (!hasChildren) iconClass += " invisible";

    let itemIcon = "";
    if (node.path === "") itemIcon = '<i class="fa-solid fa-house tree-icon text-gray-400"></i>';
    else if (node.isDeck) itemIcon = '<i class="fa-solid fa-layer-group tree-icon deck"></i>'; 
    else itemIcon = '<i class="fa-solid fa-folder tree-icon folder"></i>'; 

    const div = document.createElement('div');
    const li = document.createElement('li');
    
    div.className = `tree-row ${isDisabled ? 'disabled' : ''}`;
    
    if(isSelectionMode) {
        if(node.path === selectedCreateFolder) div.classList.add('selected');
    }

    div.innerHTML = `
        <div class="${iconClass}" onclick="window.toggleTreeNode(this, event)"><i class="fa-solid fa-caret-right"></i></div>
        ${itemIcon}
        <span class="tree-label">${node.name}</span>
    `;

    if (!isDisabled) {
        div.onclick = (e) => {
            if(e.target.closest('.tree-toggle')) return;
            if(isSelectionMode) window.selectCreateFolder(node.path, div);
            else window.selectTargetFolder(node.path, div);
        };
    }

    li.appendChild(div);

    if (hasChildren) {
        const ul = document.createElement('ul');
        ul.className = "tree-ul hidden";
        const sortedKeys = Object.keys(node.children).sort((a,b) => {
            const childA = node.children[a];
            const childB = node.children[b];
            if (childA.isDeck === childB.isDeck) return a.localeCompare(b);
            return childA.isDeck ? 1 : -1;
        });

        sortedKeys.forEach(key => {
            ul.appendChild(createTreeNodeHTML(node.children[key], isSelectionMode));
        });
        li.appendChild(ul);
    }

    return li;
}

// --- MODAL DE SELEÇÃO DE PASTA (CRIAR CARD) ---

window.openFolderSelectionModal = function() {
    document.getElementById('folderSelectionModal').classList.remove('hidden');
    window.renderFolderSelectionTree();
};

window.closeFolderSelectionModal = function() {
    document.getElementById('folderSelectionModal').classList.add('hidden');
};

window.renderFolderSelectionTree = function() {
    const container = document.getElementById('folderSelectionTreeContainer');
    container.innerHTML = '<div class="p-4 text-center"><i class="fa-solid fa-circle-notch fa-spin text-sky-600"></i></div>';
    
    const decksWithCards = identifyDecksWithCards();
    const allPaths = new Set();
    Object.values(allCards).forEach(card => {
        if((card.category||'conteudo') !== currentCategoryFilter) return;
        if(card.deck) allPaths.add(card.deck);
    });
    
    const treeRoot = buildTreeStructure(Array.from(allPaths), decksWithCards);
    
    container.innerHTML = '';
    const rootUL = document.createElement('ul');
    rootUL.className = "tree-ul";
    rootUL.style.paddingLeft = "0";
    rootUL.style.borderLeft = "none";
    rootUL.style.marginLeft = "0";
    
    rootUL.appendChild(createTreeNodeHTML(treeRoot, true)); 
    
    const rootToggle = rootUL.querySelector('.tree-toggle');
    if(rootToggle) {
        rootToggle.classList.add('rotated');
        const u = rootUL.querySelector('ul');
        if(u) u.classList.remove('hidden');
    }

    container.appendChild(rootUL);
};

window.selectCreateFolder = function(path, element) {
    document.querySelectorAll('#folderSelectionTreeContainer .tree-row').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    selectedCreateFolder = path;
    document.getElementById('btnConfirmFolder').disabled = false;
};


window.updateDeckSuggestions = function() {
    const datalist = document.getElementById('deckSuggestionsNew');
    datalist.innerHTML = '';
    
    const prefix = selectedCreateFolder === "" ? "" : selectedCreateFolder + "::";
    const deckNames = new Set();

    Object.values(allCards).forEach(card => {
        if((card.category||'conteudo') !== currentCategoryFilter) return;
        const deck = card.deck || "";
        
        if(deck.startsWith(prefix)) {
            const relative = deck.substring(prefix.length);
            const firstPart = relative.split("::")[0];
            if(firstPart) deckNames.add(firstPart);
        }
    });

    Array.from(deckNames).sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        datalist.appendChild(opt);
    });
};

// --- FUNÇÕES MODAL NOVO CARD ---

window.backToManager = function() {
    window.closeCreateModal();
    window.openManagerModal();
};

window.openCreateModal = function() {
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('modalTitleText').innerText = "Novo Flashcard";
    document.getElementById('inputCardId').value = ""; 
    
    // Reseta flag de navegação e esconde o botão voltar
    isEditingFromManager = false;
    document.getElementById('btnBackToManager').classList.add('hidden');
    
    // Define a pasta atual como a que estamos navegando
    selectedCreateFolder = currentPathStack.join("::");
    
    const display = document.getElementById('displaySelectedFolder');
    const pathName = selectedCreateFolder === "" ? "Início" : selectedCreateFolder;
    display.innerHTML = `<i class="fa-solid fa-folder text-amber-400 mr-2"></i> <span>${pathName}</span>`;
    
    document.getElementById('inputDeckNameNew').value = '';
    window.updateDeckSuggestions();

    document.getElementById('inputFront').innerHTML = '';
    document.getElementById('inputBack').innerHTML = '';
    document.getElementById('inputLegalBasis').value = '';
    document.getElementById('inputLink').value = '';
    
    window.setModalCategory(currentCategoryFilter); 
    document.getElementById('inputCardFormat').value = 'basic';
    window.toggleFormatUI();
};


window.closeCreateModal = function() {
    document.getElementById('createModal').classList.add('hidden');
};

window.setModalCategory = function(cat) { 
    document.getElementById('inputCategory').value = cat; 
    document.getElementById('tabModalConteudo').classList.toggle('active', cat === 'conteudo'); 
    document.getElementById('tabModalJuris').classList.toggle('active', cat === 'jurisprudencia'); 
    window.updateDeckSuggestions();
};

window.toggleFormatUI = function() {
    const fmt = document.getElementById('inputCardFormat').value;
    const btnCloze = document.getElementById('btnClozeAction');
    const lblFront = document.getElementById('lblFrontEditor');
    const lblBack = document.getElementById('lblBackEditor');
    const backInput = document.getElementById('inputBack');
    
    // Elemento do container de Certo/Errado (Adicionado no HTML)
    const objContainer = document.getElementById('objectiveConfigContainer');

    // Reset visual
    if (objContainer) objContainer.classList.add('hidden');
    btnCloze.classList.add('hidden');
    
    if (fmt === 'cloze') {
        btnCloze.classList.remove('hidden'); 
        lblFront.innerText = "Texto com Oclusão (Use o botão [...])"; 
        lblBack.innerText = "Verso Extra (Opcional)"; 
        backInput.setAttribute('placeholder', 'Deixe vazio para mostrar apenas a frase completa.');
    } 
    else if (fmt === 'objective') {
        // Lógica para Certo/Errado
        if (objContainer) objContainer.classList.remove('hidden');
        lblFront.innerText = "Afirmação para Julgar";
        lblBack.innerText = "Comentário / Justificativa (Aparece após responder)";
        backInput.setAttribute('placeholder', 'Explique por que está certo ou errado...');
    }
    else {
        // Básico
        lblFront.innerText = "Frente (Pergunta)"; 
        lblBack.innerText = "Verso (Resposta)"; 
        backInput.setAttribute('placeholder', 'A resposta...');
    }
};

window.saveCard = async function() {
    const id = document.getElementById('inputCardId').value;
    const deckNameSimple = document.getElementById('inputDeckNameNew').value.trim();
    
    if (!deckNameSimple) return showToast("Digite o nome do Baralho.", 'success');
    
    const fullDeckPath = selectedCreateFolder === "" ? deckNameSimple : selectedCreateFolder + "::" + deckNameSimple;
    
    // Verificação de deck existente (código original mantido)
    if (!id) {
        let deckExists = false;
        const cardsArr = Object.values(allCards);
        for(let i=0; i<cardsArr.length; i++) {
            if(cardsArr[i].deck === fullDeckPath) {
                deckExists = true;
                break;
            }
        }
        if (deckExists) {
            if(!confirm(`O baralho "${deckNameSimple}" já existe nesta pasta.\n\nDeseja adicionar este card a ele?`)) {
                return;
            }
        }
    }

    const front = document.getElementById('inputFront').innerHTML;
    const back = document.getElementById('inputBack').innerHTML;
    const category = document.getElementById('inputCategory').value;
    const format = document.getElementById('inputCardFormat').value;
    const legal = document.getElementById('inputLegalBasis').value.trim();
    const link = document.getElementById('inputLink').value.trim();
    
    // --- NOVA VALIDAÇÃO PARA CERTO/ERRADO ---
    let objectiveAnswer = null;
    if (format === 'objective') {
        const selectedRadio = document.querySelector('input[name="inputObjectiveAnswer"]:checked');
        if (!selectedRadio) return showToast("Para cartões de Julgamento, selecione CERTO ou ERRADO no gabarito.", 'success');
        objectiveAnswer = selectedRadio.value;
    }
    // ----------------------------------------

    if (!front) return showToast("Preencha a Frente do card.", 'success');
    
    const cardData = { 
        deck: fullDeckPath, 
        front, 
        back, 
        category, 
        format, 
        legalBasis: legal, 
        link: link,
        objectiveAnswer: objectiveAnswer // Salva o gabarito
    };
    
    try {
        if (id) { 
            const existingCard = allCards[id] || {};
            
            // --- CORREÇÃO: SANITIZAÇÃO DE DADOS (EVITA UNDEFINED) ---
            // O Firebase não aceita undefined. Usamos || null ou valores padrão.
            cardData.interval = existingCard.interval !== undefined ? existingCard.interval : 0;
            cardData.ease = existingCard.ease !== undefined ? existingCard.ease : 2.5;
            cardData.nextReview = existingCard.nextReview !== undefined ? existingCard.nextReview : Date.now();
            cardData.lastReview = existingCard.lastReview !== undefined ? existingCard.lastReview : 0;
            cardData.created = existingCard.created || Date.now();
            cardData.lastRating = existingCard.lastRating || null; // <--- AQUI ESTAVA O ERRO PRINCIPAL
            // ETAPA 2: preserva os contadores de acerto/erro ao editar o card
            cardData.hitCount = existingCard.hitCount || 0;
            cardData.missCount = existingCard.missCount || 0;
            // ETAPA 3: preserva a marca de volta do baralho
            cardData.roundDone = existingCard.roundDone || false;
            // --------------------------------------------------------

            await update(ref(db, `users/${currentUserUID}/anki/cards/${id}`), cardData); 
            
            if (isEditingFromManager) {
                showToast("Card atualizado!", 'success');
                window.closeCreateModal();
                window.openManagerModal(); 
                loadAnkiData().then(() => window.renderManagerList()); 
                return;
            }

            const viewStudy = document.getElementById('viewStudy');
            if (viewStudy && !viewStudy.classList.contains('hidden')) {
                allCards[id] = { ...existingCard, ...cardData };
                const currentQueueCard = studyQueue[currentCardIndex];
                if (currentQueueCard && currentQueueCard.firebaseKey === id) {
                    studyQueue[currentCardIndex] = { ...currentQueueCard, ...cardData };
                    showCurrentCard(); 
                }
                showToast("Card atualizado!", 'success');
                window.closeCreateModal();
                return; 
            } else {
                showToast("Atualizado!", 'success'); 
            }
        } else { 
            cardData.interval = 0; 
            cardData.ease = 2.5; 
            cardData.nextReview = Date.now(); 
            cardData.created = Date.now(); 
            cardData.lastReview = 0; 
            cardData.lastRating = null;
            cardData.hitCount = 0;  // ETAPA 2: contador de acertos
            cardData.missCount = 0; // ETAPA 2: contador de erros
            cardData.roundDone = false; // ETAPA 3: marca de volta do baralho

            await push(ref(db, `users/${currentUserUID}/anki/cards`), cardData); 
            showToast("Criado!", 'success'); 
        }
        
        if (!id) { 
            document.getElementById('inputFront').innerHTML = ''; 
            document.getElementById('inputBack').innerHTML = ''; 
            document.getElementById('inputFront').focus(); 
            // Limpa a seleção do rádio para o próximo card
            const radios = document.querySelectorAll('input[name="inputObjectiveAnswer"]');
            radios.forEach(r => r.checked = false);
        } else { 
            window.closeCreateModal(); 
        }
        
        loadAnkiData();
    } catch (e) { console.error(e); showToast("Erro ao salvar: " + e.message, 'error'); }
};

// --- FUNÇÃO PARA EDITAR NO MEIO DO ESTUDO ---
window.editCurrentStudyCard = function(ev) {
    if(ev) ev.stopPropagation(); // Evita que o card vire

    if (!studyQueue || studyQueue.length === 0) return;
    const currentCard = studyQueue[currentCardIndex];
    if (!currentCard) return;

    window.editCard(currentCard.firebaseKey);
    
    // Força reset da flag, pois editCard pode ter ativado
    // Se estou estudando, não quero voltar pro gerenciador
    isEditingFromManager = false;
    document.getElementById('btnBackToManager').classList.add('hidden');
};

// --- ÁRVORE (MODAL MOVER - CONFIGURAÇÕES) ---

window.toggleTreeNode = function(element, ev) {
    ev.stopPropagation();
    element.classList.toggle('rotated');
    const li = element.closest('li');
    const ul = li.querySelector('ul');
    if(ul) ul.classList.toggle('hidden');
};

window.selectTargetFolder = function(path, element) {
    document.querySelectorAll('.tree-row').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    selectedTargetFolder = path;
    document.getElementById('btnRelocateAction').disabled = false;
};

window.confirmRelocate = async function() {
    if(selectedTargetFolder === null) return;
    
    const itemName = currentDeckName.split("::").pop();
    let newPath = selectedTargetFolder === "" ? itemName : selectedTargetFolder + "::" + itemName;

    if (newPath === currentDeckName) return showToast("Destino igual origem.", 'success');

    if (confirm(`Mover "${itemName}" para dentro de "${selectedTargetFolder || 'Início'}"?`)) {
        await executeMove(currentDeckName, newPath);
    }
};

window.renderFolderTree = function() {
    const container = document.getElementById('folderTreeContainer');
    container.innerHTML = '';
    selectedTargetFolder = null;
    document.getElementById('btnRelocateAction').disabled = true;

    const decksWithCards = identifyDecksWithCards();
    const allPaths = new Set();
    Object.values(allCards).forEach(card => {
        if((card.category||'conteudo') !== currentCategoryFilter) return;
        if(card.deck) allPaths.add(card.deck);
    });

    const treeRoot = buildTreeStructure(Array.from(allPaths), decksWithCards);

    container.innerHTML = '';
    const rootUL = document.createElement('ul');
    rootUL.className = "tree-ul";
    rootUL.style.paddingLeft = "0";
    rootUL.style.marginLeft = "0";
    rootUL.appendChild(createTreeNodeHTML(treeRoot, false));
    
    const t = rootUL.querySelector('.tree-toggle');
    if(t) {
        t.classList.add('rotated');
        const u = rootUL.querySelector('ul');
        if(u) u.classList.remove('hidden');
    }
    container.appendChild(rootUL);
};

// --- CONFIGURAÇÃO DE BARALHO ---

// --- CONFIGURAÇÃO DE BARALHO (ATUALIZADA) ---

window.openDeckConfig = function(deckName, ev) {
    if(ev) ev.stopPropagation();
    currentDeckName = deckName;
    document.getElementById('deckConfigModal').classList.remove('hidden');
    document.getElementById('deckConfigTitle').innerText = `Config: ${deckName}`;
    document.getElementById('targetNameDisplay').innerText = deckName;
    window.switchConfigTab('settings'); 

    // Defaults Atualizados (Incluindo Errei = 0.5 horas e modo de tempo)
    const defaults = { 
        timeMode: 'crescente', // NOVO: 'fixo' ou 'crescente'
        againInterval: 0.5, againIntervalUnit: 'hours', // NOVO: Padrão 30 min (0.5h)
        easyBonus: 3.5, easyBonusUnit: 'days', 
        goodInterval: 2.8, goodIntervalUnit: 'days', 
        hardInterval: 1.2, hardIntervalUnit: 'days',
        maxInterval: 180 
    };
    const settings = deckSettings[deckName] || defaults;

    // NOVO: Preenche o seletor de Modo de Tempo (Fixo x Crescente)
    if (document.getElementById('cfgTimeMode')) {
        document.getElementById('cfgTimeMode').value = settings.timeMode || 'crescente';
    }
    
    // Preenche o campo 'Errei' (Verifica se o elemento existe no HTML primeiro para evitar erro)
    if(document.getElementById('cfgAgainInterval')) {
        document.getElementById('cfgAgainInterval').value = settings.againInterval !== undefined ? settings.againInterval : defaults.againInterval;
        document.getElementById('unitAgainInterval').value = settings.againIntervalUnit || 'hours';
    }

    // Preenche os outros campos
    document.getElementById('cfgEasyBonus').value = settings.easyBonus || defaults.easyBonus;
    document.getElementById('cfgGoodInterval').value = settings.goodInterval || defaults.goodInterval;
    document.getElementById('cfgHardInterval').value = settings.hardInterval || defaults.hardInterval;
    document.getElementById('cfgMaxInterval').value = settings.maxInterval || defaults.maxInterval;
    
    document.getElementById('unitEasyBonus').value = settings.easyBonusUnit || 'days';
    document.getElementById('unitGoodInterval').value = settings.goodIntervalUnit || 'days';
    document.getElementById('unitHardInterval').value = settings.hardIntervalUnit || 'days';
};

window.applyPreset = function(type) {
    if (type === 'normal') {
        // Longo Prazo (Estudo Padrão)
        document.getElementById('cfgEasyBonus').value = 3.5;
        document.getElementById('cfgGoodInterval').value = 2.5;
        document.getElementById('cfgHardInterval').value = 1.2;
        document.getElementById('cfgMaxInterval').value = 180; // 6 Meses
        
        document.getElementById('unitEasyBonus').value = 'days';
        document.getElementById('unitGoodInterval').value = 'days';
        document.getElementById('unitHardInterval').value = 'days';
        showToast("Aplicado: Perfil Longo Prazo (Foco em retenção).", 'success');
    } else if (type === 'cramming') {
        // Reta Final (Agressivo)
        document.getElementById('cfgEasyBonus').value = 1.5; // Bônus pequeno
        document.getElementById('cfgGoodInterval').value = 1.2; // Intervalo curto
        document.getElementById('cfgHardInterval').value = 0.5; // Repete logo
        document.getElementById('cfgMaxInterval').value = 21; // Max 3 semanas
        
        document.getElementById('unitEasyBonus').value = 'days';
        document.getElementById('unitGoodInterval').value = 'days';
        document.getElementById('unitHardInterval').value = 'days';
        showToast("Aplicado: Perfil Reta Final (Você verá os cards com muita frequência).", 'success');
    }
};

window.saveDeckConfig = async function() {
    // NOVO: lê o modo de tempo escolhido (fixo ou crescente)
    const timeMode = document.getElementById('cfgTimeMode')?.value || 'crescente';

    // Leitura dos valores com segurança
    const againVal = parseFloat(document.getElementById('cfgAgainInterval')?.value) || 0.5;
    const againUnit = document.getElementById('unitAgainInterval')?.value || 'hours';

    const easy = parseFloat(document.getElementById('cfgEasyBonus').value)||3.5;
    const easyUnit = document.getElementById('unitEasyBonus').value;
    const good = parseFloat(document.getElementById('cfgGoodInterval').value)||2.8;
    const goodUnit = document.getElementById('unitGoodInterval').value;
    const hard = parseFloat(document.getElementById('cfgHardInterval').value)||1.2;
    const hardUnit = document.getElementById('unitHardInterval').value;
    const maxInt = parseFloat(document.getElementById('cfgMaxInterval').value)||180;

    // Atualiza na memória (mantém o nome original legível para o app)
    deckSettings[currentDeckName] = { 
        timeMode: timeMode,
        againInterval: againVal, againIntervalUnit: againUnit,
        easyBonus: easy, easyBonusUnit: easyUnit,
        goodInterval: good, goodIntervalUnit: goodUnit,
        hardInterval: hard, hardIntervalUnit: hardUnit,
        maxInterval: maxInt
    };

    try { 
        // --- CORREÇÃO: Salva apenas este deck com a chave CODIFICADA ---
        const safeKey = encodeKey(currentDeckName);
        await update(ref(db, `users/${currentUserUID}/anki/settings/${safeKey}`), deckSettings[currentDeckName]); 
        
        showToast("Configurações salvas com sucesso!", 'success'); 
        window.closeDeckConfigModal(); 
    } catch(e) { 
        console.error(e); 
        showToast("Erro ao salvar config: " + e.message, 'error');
    }
};

window.closeDeckConfigModal = function() {
    document.getElementById('deckConfigModal').classList.add('hidden');
};

window.switchConfigTab = function(tabName) {
    const btns = document.querySelectorAll('#deckConfigModal .config-tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    
    ['tabSettingsView','tabHistoryView','tabRelocateView','tabShareView'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.add('hidden');
    });

    if(tabName === 'settings') {
        document.getElementById('tabSettingsView').classList.remove('hidden');
        btns[0].classList.add('active');
    } else if(tabName === 'history') {
        document.getElementById('tabHistoryView').classList.remove('hidden');
        btns[1].classList.add('active');
        renderDeckHistory();
    } else if(tabName === 'relocate') {
        document.getElementById('tabRelocateView').classList.remove('hidden');
        btns[2].classList.add('active');
        window.renderFolderTree();
    } else if(tabName === 'share') {
        // NOVA ABA
        const el = document.getElementById('tabShareView');
        if(el) el.classList.remove('hidden');
        // O botão de share é o 4º (índice 3), se existir na lista
        if(btns[3]) btns[3].classList.add('active');
        window.renderSharedUsers();
    }
};

// --- HISTÓRICO ---

function renderDeckHistory() {
    const tbody = document.getElementById('deckHistoryBody');
    tbody.innerHTML = '';
    
    // Bug 4: monta cada card já com sua chave (firebaseKey), tornando o
    // botão de editar do histórico confiável e independente de getCardKey.
    const cards = Object.keys(allCards)
        .map(key => ({ ...allCards[key], firebaseKey: key }))
        .filter(c =>
            c.deck === currentDeckName &&
            (c.category || 'conteudo') === currentCategoryFilter
        );
    
    // Ordena pela última revisão (mais recente primeiro)
    cards.sort((a,b) => (b.lastReview || 0) - (a.lastReview || 0));

    if(cards.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-gray-400 text-xs italic">Nenhum histórico de estudo para este baralho.</td></tr>';
        return;
    }

    cards.forEach(card => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-50 hover:bg-gray-50 transition group";
        
        let ratingBadge = '<span class="text-[10px] font-bold text-gray-300 bg-gray-100 px-1.5 py-0.5 rounded">Novo</span>';
        if(card.lastRating) {
            const map = { 'again': {l:'Errei', c:'text-red-600 bg-red-50'}, 'hard': {l:'Difícil', c:'text-orange-600 bg-orange-50'}, 'good': {l:'Bom', c:'text-green-600 bg-green-50'}, 'easy': {l:'Fácil', c:'text-sky-600 bg-sky-50'} };
            const info = map[card.lastRating];
            ratingBadge = `<span class="text-[10px] font-bold ${info.c} px-1.5 py-0.5 rounded uppercase tracking-wider">${info.l}</span>`;
        }
        
        const dateStr = card.lastReview ? new Date(card.lastReview).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) : '-';
        
        let nextRevStr = '-';
        if(card.nextReview) {
            if(card.nextReview <= Date.now()) nextRevStr = '<span class="text-amber-500 font-bold text-xs"><i class="fa-solid fa-clock-rotate-left mr-1"></i>Agora</span>';
            else nextRevStr = new Date(card.nextReview).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
        }

        // MELHORIA: Mostra mais texto e remove tags HTML (protegido contra card sem texto)
        let plainFront = (card.front || '').replace(/<[^>]*>?/gm, '');
        if(plainFront.length > 60) plainFront = plainFront.substring(0, 60) + '...';
        
        const btnEdit = `<button onclick="window.editCardFromHistory('${card.firebaseKey}')" class="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-sky-600 hover:bg-sky-50 transition" title="Editar"><i class="fa-solid fa-pen text-xs"></i></button>`;

        tr.innerHTML = `
            <td class="p-3">
                <div class="text-xs text-gray-700 font-medium leading-snug">${plainFront}</div>
            </td>
            <td class="p-3 text-center whitespace-nowrap">
                <div class="flex flex-col items-center gap-1">
                    ${ratingBadge}
                    <span class="text-[9px] text-gray-400 font-mono">${dateStr}</span>
                </div>
            </td>
            <td class="p-3 text-center text-xs font-mono text-gray-500">${nextRevStr}</td>
            <td class="p-3 text-right">${btnEdit}</td>
        `;
        tbody.appendChild(tr);
    });
}

function getCardKey(cardObj) {
    return Object.keys(allCards).find(key => allCards[key] === cardObj);
}

window.editCardFromHistory = function(id) {
    if(!id) return;
    window.closeDeckConfigModal();
    window.editCard(id); 
    
    // Força reset da flag, vindo do histórico
    isEditingFromManager = false;
    document.getElementById('btnBackToManager').classList.add('hidden');
};

// --- LOGICA DE TIMER DO ESTUDO ---

window.selectTimerMode = function(mode, el) {
    document.querySelectorAll('.timer-option-btn').forEach(btn => btn.classList.remove('selected'));
    el.classList.add('selected');
    studyTimerMode = mode;
    
    const inputDiv = document.getElementById('timerInputContainer');
    if (mode === 'timer') {
        inputDiv.classList.remove('hidden');
    } else {
        inputDiv.classList.add('hidden');
    }
};

window.adjustTime = function(amount) {
    const input = document.getElementById('inputTimerMinutes');
    let val = parseInt(input.value) || 0;
    val += amount;
    if (val < 1) val = 1;
    if (val > 180) val = 180;
    input.value = val;
};

// OBS: a função window.confirmTimerStart estava definida DUAS vezes.
// A versão duplicada (antiga) foi removida daqui. A versão única e completa,
// que também trata sessões compartilhadas, fica mais abaixo no arquivo.

function initStudyTimer(mode, startSeconds) {
    studyTimerSeconds = startSeconds;
    studyTimerMode = mode;
    studyTimerPaused = false;
    
    const widget = document.getElementById('studyTimerContainer');
    widget.classList.remove('hidden');
    
    updateTimerDisplay();
    
    const btnIcon = document.getElementById('timerIcon');
    btnIcon.className = 'fa-solid fa-pause';
    
    if (studyTimerInterval) clearInterval(studyTimerInterval);
    studyTimerInterval = setInterval(runTimer, 1000);
}

function runTimer() {
    if (studyTimerPaused) return;
    
    if (studyTimerMode === 'stopwatch') {
        studyTimerSeconds++;
    } else if (studyTimerMode === 'timer') {
        if (studyTimerSeconds > 0) {
            studyTimerSeconds--;
        } else {
            // Tempo acabou
            clearInterval(studyTimerInterval);
            studyTimerInterval = null;
            if(confirm("O tempo acabou! Deseja continuar estudando sem timer?")) {
                document.getElementById('studyTimerContainer').classList.add('hidden');
            } else {
                window.showDecksView();
            }
            return;
        }
    }
    updateTimerDisplay();
}

function updateTimerDisplay() {
    const display = document.getElementById('timerDisplay');
    const mins = Math.floor(studyTimerSeconds / 60);
    const secs = studyTimerSeconds % 60;
    display.innerText = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

window.toggleTimer = function() {
    studyTimerPaused = !studyTimerPaused;
    const widget = document.getElementById('studyTimerWidget');
    const btnIcon = document.getElementById('timerIcon');
    
    if (studyTimerPaused) {
        widget.classList.add('paused');
        widget.classList.remove('active');
        btnIcon.className = 'fa-solid fa-play';
    } else {
        widget.classList.remove('paused');
        widget.classList.add('active');
        btnIcon.className = 'fa-solid fa-pause';
    }
};

window.stopTimer = function(silent = false) {
    if (studyTimerInterval) {
        clearInterval(studyTimerInterval);
        studyTimerInterval = null;
    }
    if (!silent) {
        if(confirm("Parar cronômetro e ocultar?")) {
            document.getElementById('studyTimerContainer').classList.add('hidden');
        } else {
            // Se cancelar, retoma (reinicia intervalo se não estava pausado)
            if(!studyTimerPaused) studyTimerInterval = setInterval(runTimer, 1000);
        }
    }
};

// --- ESTUDO ---

window.checkAndStartSession = function(deckName, totalDue) {
    // Passo 1: Verifica se pode estudar
    if (totalDue > 0) {
        openTimerConfig(deckName, false);
    } else if (confirm(`Este baralho está em dia! \n\nGostaria de revisar tudo novamente (Modo Cramming)?`)) {
        openTimerConfig(deckName, true);
    }
};

function openTimerConfig(deckName, isCramming) {
    pendingDeckName = deckName;
    pendingIsCramming = isCramming;
    
    // Reseta UI do modal
    studyTimerMode = 'none';
    document.querySelectorAll('.timer-option-btn').forEach(btn => btn.classList.remove('selected'));
    document.querySelectorAll('.timer-option-btn')[2].classList.add('selected'); // Seleciona 'Sem Tempo' por padrão
    document.getElementById('timerInputContainer').classList.add('hidden');
    
    document.getElementById('timerConfigModal').classList.remove('hidden');
}


function formatTime(days) {
    if (days < 1) {
        // Converte frações de dia para minutos
        const totalMinutes = Math.round(days * 1440);
        
        // Se for menos de 60 minutos, mostra "XX min"
        if (totalMinutes < 60) {
            return totalMinutes + " min";
        } 
        // Se for hora cheia ou quebrada (ex: 90 min), mostra "1.5 h"
        else {
            const hours = (totalMinutes / 60).toFixed(1).replace('.0', '');
            return hours + " h";
        }
    }
    // Se for 1 dia ou mais
    return Math.round(days) + " dias";
}

// --- ETAPA 4: FORMATA A DATA/HORA PROVÁVEL DA REVISÃO ---
// Recebe o intervalo em dias e devolve algo como "hoje 14:35" ou "19/05 11:00".
function formatReviewDate(days) {
    const alvo = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const hh = String(alvo.getHours()).padStart(2, '0');
    const mm = String(alvo.getMinutes()).padStart(2, '0');
    const horario = `${hh}:${mm}`;

    // Verifica se a revisão cai hoje ou amanhã
    const hoje = new Date();
    const ehMesmoDia = (a, b) =>
        a.getDate() === b.getDate() &&
        a.getMonth() === b.getMonth() &&
        a.getFullYear() === b.getFullYear();

    const amanha = new Date();
    amanha.setDate(hoje.getDate() + 1);

    if (ehMesmoDia(alvo, hoje)) return `hoje ${horario}`;
    if (ehMesmoDia(alvo, amanha)) return `amanhã ${horario}`;

    const dd = String(alvo.getDate()).padStart(2, '0');
    const mes = String(alvo.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mes} ${horario}`;
}

// --- ETAPA 2: FINALIZA A SESSÃO MOSTRANDO O PLACAR DE ACERTOS/ERROS ---
function finishStudySession() {
    const viewStudy = document.getElementById('viewStudy');
    const viewDecks = document.getElementById('viewDecks');
    const viewEmpty = document.getElementById('viewEmpty');

    if (viewStudy) viewStudy.classList.add('hidden');
    if (viewDecks) viewDecks.classList.add('hidden');
    if (viewEmpty) viewEmpty.classList.remove('hidden');

    // Preenche o placar (se os elementos existirem no HTML)
    const total = sessionHits + sessionMiss;
    const elScore = document.getElementById('sessionScoreText');
    const elHits = document.getElementById('sessionScoreHits');
    const elMiss = document.getElementById('sessionScoreMiss');

    if (elHits) elHits.innerText = sessionHits;
    if (elMiss) elMiss.innerText = sessionMiss;
    if (elScore) {
        if (total > 0) {
            const pct = Math.round((sessionHits / total) * 100);
            elScore.innerText = `Você acertou ${sessionHits} de ${total} (${pct}%).`;
        } else {
            elScore.innerText = "Sessão finalizada.";
        }
    }
}

// --- ETAPA 2: HABILITA/DESABILITA O BOTÃO DESFAZER ---
function updateUndoButton() {
    const btnUndo = document.getElementById('btnUndoRating');
    if (!btnUndo) return;
    if (lastActionStack.length > 0) {
        btnUndo.classList.remove('hidden');
    } else {
        btnUndo.classList.add('hidden');
    }
}

function showCurrentCard() {
    if (!studyQueue || studyQueue.length === 0 || currentCardIndex >= studyQueue.length) {
        // ETAPA 2: em vez de voltar direto, mostra a tela final com o placar
        finishStudySession();
        return; 
    }

    const card = studyQueue[currentCardIndex];
    if (!card) {
        studyQueue.splice(currentCardIndex, 1);
        showCurrentCard();
        return;
    }

    // ETAPA 2: atualiza o botão Desfazer (só fica ativo se houver o que desfazer)
    updateUndoButton();

    // ATUALIZA BARRA DE PROGRESSO
    const progressEl = document.getElementById('sessionProgressBar');
    if (initialSessionLength > 0 && progressEl) {
        const completed = initialSessionLength - (studyQueue.length - currentCardIndex);
        const pct = Math.round((completed / initialSessionLength) * 100);
        progressEl.style.width = `${pct}%`;
    }

    document.getElementById('studyCounter').innerText = `${studyQueue.length - currentCardIndex} restantes`;
    
    const btnSkip = document.getElementById('btnSkipCard');
    if(btnSkip) btnSkip.classList.remove('hidden');

    const container = document.getElementById('flashcardContainer');
    container.classList.remove('revealed'); 
    const controls = document.getElementById('studyControls');
    controls.classList.remove('opacity-100', 'pointer-events-auto');
    controls.classList.add('opacity-0', 'pointer-events-none');

    // ETAPA 4: ao trocar de card, volta a exibir todos os 4 botões de avaliação
    resetRatingButtonsVisibility();
    
    // UI Resets
    const objActions = document.getElementById('objectiveStudyActions');
    const feedbackDisplay = document.getElementById('objectiveFeedbackDisplay');
    const hint = document.getElementById('tapToRevealHint');
    
    const btns = objActions ? objActions.querySelectorAll('button') : [];
    btns.forEach(b => {
        b.disabled = false; 
        b.classList.remove('opacity-50', 'cursor-not-allowed');
        if(b.innerText.trim() === 'CERTO') {
            b.className = "bg-green-100 hover:bg-green-200 text-green-700 border border-green-200 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition w-24";
        } else {
            b.className = "bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 px-4 py-2 rounded-lg font-bold text-sm shadow-sm transition w-24";
        }
    });

    if(feedbackDisplay) {
        feedbackDisplay.innerHTML = '';
        feedbackDisplay.classList.add('hidden');
    }

    if (card.format === 'objective') {
        if (objActions) objActions.classList.remove('hidden');
        if (hint) hint.classList.add('hidden'); 
    } else {
        if (objActions) objActions.classList.add('hidden');
        if (hint) hint.classList.remove('hidden');
    }

    // --- LÓGICA DE CÁLCULO DOS BOTÕES (CORRIGIDA + MODO FIXO/CRESCENTE) ---
    const defaults = { 
        timeMode: 'crescente',
        againInterval: 0.5, againIntervalUnit: 'hours',
        easyBonus: 3.5, easyBonusUnit: 'days', 
        goodInterval: 2.8, goodIntervalUnit: 'days', 
        hardInterval: 1.2, hardIntervalUnit: 'days' 
    };
    const s = deckSettings[currentDeckName] || defaults;
    const timeMode = s.timeMode || 'crescente'; // NOVO: modo de tempo do baralho
    
    // Helper para converter tudo para dias
    const getDays = (val, unit) => unit === 'minutes' ? val/1440 : (unit === 'hours' ? val/24 : val);

    const sAgain = getDays(s.againInterval !== undefined ? s.againInterval : defaults.againInterval, s.againIntervalUnit || 'hours');
    const sHard = getDays(s.hardInterval, s.hardIntervalUnit);
    const sGood = getDays(s.goodInterval, s.goodIntervalUnit);
    const sEasy = getDays(s.easyBonus, s.easyBonusUnit);

    const currentInt = card.interval || 0; // Se for 0, é card novo

    // Variáveis para exibição
    let valHard, valGood, valEasy;

    if (timeMode === 'fixo') {
        // MODO FIXO: o tempo é sempre o valor configurado (previsível)
        valHard = sHard;
        valGood = sGood;
        valEasy = sEasy;
    } else {
        // MODO CRESCENTE: card novo usa o valor base; revisão multiplica o intervalo atual
        if (currentInt === 0) {
            valHard = sHard;
            valGood = sGood;
            valEasy = sEasy;
        } else {
            valHard = currentInt * s.hardInterval; 
            valGood = currentInt * s.goodInterval;
            valEasy = currentInt * s.easyBonus;   
        }
    }
    
    // Errei é sempre fixo (Reset), independente do modo
    const valAgain = sAgain; 

    // Atualiza os textos dos botões: tempo + data/hora provável da revisão
    document.getElementById('timeAgain').innerText = formatTime(valAgain);
    document.getElementById('timeHard').innerText = formatTime(valHard);
    document.getElementById('timeGood').innerText = formatTime(valGood);
    document.getElementById('timeEasy').innerText = formatTime(valEasy);

    // ETAPA 4: data/hora provável da revisão em cada botão
    const setDate = (id, dias) => {
        const el = document.getElementById(id);
        if (el) el.innerText = formatReviewDate(dias);
    };
    setDate('dateAgain', valAgain);
    setDate('dateHard', valHard);
    setDate('dateGood', valGood);
    setDate('dateEasy', valEasy);

    // Renderização do HTML do Card
    setTimeout(() => {
        const safeFront = card.front || "(Sem texto na frente)";
        let safeBack = card.back || "";

        if (card.format === 'objective') {
            safeBack = safeBack.replace(/^\s*(?:(?:gabarito|gab)[\s.:-]*)?(?:certo|errado|c|e)[\s.:-]*/i, '');
            if(safeBack.length > 0) safeBack = safeBack.charAt(0).toUpperCase() + safeBack.slice(1);
        }

        const frontHTML = processCloze(safeFront, false);
        let backHTML = safeBack;
        
        if ((!safeBack || safeBack.trim() === "") && safeFront.includes("{{c1::")) {
            backHTML = processCloze(safeFront, true);
        } else {
            backHTML = processCloze(backHTML || "(Sem texto no verso)", true);
        }

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

window.revealCard = function(forceReveal = false) {
    const container = document.getElementById('flashcardContainer');
    
    // --- LÓGICA DE PROTEÇÃO (NOVO) ---
    // Se for um card de Certo/Errado (objective), bloqueia o clique no fundo branco.
    // Só permite revelar se forceReveal for true (vindo dos botões de resposta)
    // ou se o card JÁ estiver revelado (para não quebrar a UI).
    if (studyQueue && studyQueue.length > 0) {
        const currentCard = studyQueue[currentCardIndex];
        if (currentCard && currentCard.format === 'objective') {
            if (!forceReveal && !container.classList.contains('revealed')) {
                return; // Bloqueia a ação
            }
        }
    }
    // ---------------------------------
    
    // Esconde o botão Pular assim que revelar
    const btnSkip = document.getElementById('btnSkipCard');
    if(btnSkip) btnSkip.classList.add('hidden');

    if (!container.classList.contains('revealed')) {
        container.classList.add('revealed');
        setTimeout(() => {
            document.getElementById('studyControls').classList.remove('opacity-0', 'pointer-events-auto');
            document.getElementById('studyControls').classList.add('opacity-100', 'pointer-events-auto');
        }, 100);
    }
};

// Mantém o alias
window.flipCard = window.revealCard;

// --- ETAPA 3: DETECTA QUANDO O BARALHO COMPLETOU UMA VOLTA INTEIRA ---
// Uma "volta" = todos os cards do baralho receberam uma resposta nova.
// Quando isso acontece: o contador de voltas sobe +1 e as marcas (roundDone) se limpam.
async function checkRoundCompletion(deckName) {
    if (!deckName) return;

    // Pega todos os cards desse baralho
    const deckKeys = Object.keys(allCards).filter(k => allCards[k].deck === deckName);
    if (deckKeys.length === 0) return;

    // Só conta a volta se TODOS os cards estiverem marcados como respondidos
    const allDone = deckKeys.every(k => allCards[k].roundDone === true);
    if (!allDone) return;

    try {
        const updates = {};

        // 1. Limpa a marca de todos os cards (prepara a próxima volta)
        deckKeys.forEach(k => {
            updates[`users/${currentUserUID}/anki/cards/${k}/roundDone`] = false;
            if (allCards[k]) allCards[k].roundDone = false;
        });

        // 2. Soma +1 no contador de voltas (guardado nas configurações do baralho)
        const atual = (deckSettings[deckName] && deckSettings[deckName].roundsCompleted) || 0;
        const novo = atual + 1;
        const safeKey = encodeKey(deckName);
        updates[`users/${currentUserUID}/anki/settings/${safeKey}/roundsCompleted`] = novo;

        // Atualiza a memória local
        if (!deckSettings[deckName]) deckSettings[deckName] = {};
        deckSettings[deckName].roundsCompleted = novo;

        await update(ref(db), updates);
        showToast(`🎉 Baralho concluído! Voltas completas: ${novo}.`, 'success');
    } catch (e) {
        console.error("Erro ao contar volta do baralho:", e);
    }
}

window.rateCard = async function(rating) {
    const card = studyQueue[currentCardIndex];
    if(!card) {
        showCurrentCard();
        return;
    }

    // ETAPA 4: ignora avaliação por um botão que está escondido
    // (ex.: card de Certo/Errado em que aquela opção não é permitida).
    const mapaBotao = { again: 0, hard: 1, good: 2, easy: 3 };
    const controls = document.getElementById('studyControls');
    if (controls) {
        const btn = controls.querySelectorAll('button')[mapaBotao[rating]];
        if (btn && btn.style.display === 'none') return; // botão indisponível: ignora
    }

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    // Busca configurações ou usa defaults
    const defaults = { 
        timeMode: 'crescente',
        againInterval: 0.5, againIntervalUnit: 'hours',
        easyBonus: 3.5, easyBonusUnit: 'days', 
        goodInterval: 2.8, goodIntervalUnit: 'days', 
        hardInterval: 1.2, hardIntervalUnit: 'days',
        maxInterval: 180 
    };
    const s = (deckSettings && deckSettings[currentDeckName]) ? deckSettings[currentDeckName] : defaults;
    const timeMode = s.timeMode || 'crescente'; // NOVO: modo de tempo do baralho
    
    // Helper de conversão
    const getDays = (val, unit) => unit === 'minutes' ? val/1440 : (unit === 'hours' ? val/24 : val);
    
    // Valores base convertidos para dias
    const sAgain = getDays(s.againInterval !== undefined ? s.againInterval : defaults.againInterval, s.againIntervalUnit || 'hours');
    const sHard = getDays(s.hardInterval, s.hardIntervalUnit);
    const sGood = getDays(s.goodInterval, s.goodIntervalUnit);
    const sEasy = getDays(s.easyBonus, s.easyBonusUnit);

    let nextInterval = 1;
    let nextEase = card.ease || 2.5;
    const currentInt = card.interval || 0;

    // --- CÁLCULO FINAL (Matemática aplicada) ---
    
    if (rating === 'again') { 
        nextInterval = sAgain; // Reseta para o valor fixo (ex: 0.5h = 30min)
        nextEase = Math.max(1.3, nextEase - 0.2); 
    }
    else if (timeMode === 'fixo') {
        // --- MODO FIXO: o intervalo é SEMPRE o valor configurado ---
        if (rating === 'hard') {
            nextInterval = sHard;
            nextEase = Math.max(1.3, nextEase - 0.15);
        }
        else if (rating === 'good') {
            nextInterval = sGood;
        }
        else if (rating === 'easy') {
            nextInterval = sEasy;
            nextEase += 0.15;
        }
    }
    else {
        // --- MODO CRESCENTE: card novo usa base; revisão multiplica o intervalo atual ---
        if (rating === 'hard') {
            nextInterval = (currentInt === 0) ? sHard : (currentInt * s.hardInterval);
            nextEase = Math.max(1.3, nextEase - 0.15); 
        }
        else if (rating === 'good') {
            nextInterval = (currentInt === 0) ? sGood : (currentInt * s.goodInterval);
        }
        else if (rating === 'easy') {
            nextInterval = (currentInt === 0) ? sEasy : (currentInt * s.easyBonus);
            nextEase += 0.15; 
        }
    }

    // Aplica o Teto Máximo (se configurado)
    if (rating !== 'again' && s.maxInterval && nextInterval > s.maxInterval) {
        nextInterval = s.maxInterval;
    }
    
    // Segurança mínima para não bugar o agendamento (aprox 1 min)
    if (nextInterval < 0.0007) nextInterval = 0.0007;

    // Salva no Banco de Dados
    try {
        const updates = {};
        const progressData = {
            interval: nextInterval,
            ease: nextEase,
            nextReview: now + (nextInterval * oneDay),
            lastReview: now,
            lastRating: rating
        };

        // ETAPA 2 - CONTADOR DE ACERTOS/ERROS
        // Regra: "Errei" = erro; "Difícil", "Bom" e "Fácil" = acerto.
        const isMiss = (rating === 'again');
        // Valores anteriores guardados (para o botão Desfazer reverter)
        const prevHitCount = card.hitCount || 0;
        const prevMissCount = card.missCount || 0;

        if (sharedSessionOwner) {
            updates[`users/${currentUserUID}/anki/shared_progress/${sharedSessionOwner}/${card.firebaseKey}`] = progressData;
        } else {
            // Contadores só são gravados nos baralhos próprios do usuário
            progressData.hitCount = isMiss ? prevHitCount : (prevHitCount + 1);
            progressData.missCount = isMiss ? (prevMissCount + 1) : prevMissCount;
            // ETAPA 3: marca este card como "respondido nesta volta"
            progressData.roundDone = true;

            const updatedCard = { ...card, ...progressData };
            updates[`users/${currentUserUID}/anki/cards/${card.firebaseKey}`] = updatedCard;
            
            // Atualiza cache local
            if (allCards[card.firebaseKey]) {
                allCards[card.firebaseKey] = updatedCard;
            }
        }

        await update(ref(db), updates);

        // ETAPA 3: verifica se o baralho completou uma "volta" inteira
        if (!sharedSessionOwner) {
            await checkRoundCompletion(card.deck);
        }

        // ETAPA 2 - PLACAR DA SESSÃO
        if (isMiss) sessionMiss++; else sessionHits++;

        // ETAPA 2 - REGISTRO PARA O BOTÃO DESFAZER
        // Guarda o que era preciso para reverter esta avaliação.
        lastActionStack.push({
            indexBefore: currentCardIndex,
            firebaseKey: card.firebaseKey,
            isMiss: isMiss,
            cardSnapshot: { ...card }, // estado do card ANTES da avaliação
            sharedSessionOwner: sharedSessionOwner
        });

        currentCardIndex++;
        showCurrentCard();
        
    } catch (e) { 
        console.error("Erro ao salvar progresso:", e);
        currentCardIndex++;
        showCurrentCard();
    }
};

// --- ETAPA 2: BOTÃO DESFAZER (volta a última avaliação) ---
window.undoLastRating = async function() {
    if (lastActionStack.length === 0) {
        return; // Nada para desfazer
    }

    const last = lastActionStack.pop();

    try {
        // 1. Reverte os dados do card no banco para como estavam ANTES
        const snap = last.cardSnapshot;
        const restoreData = {
            interval: snap.interval || 0,
            ease: snap.ease || 2.5,
            nextReview: snap.nextReview || Date.now(),
            lastReview: snap.lastReview || 0,
            lastRating: snap.lastRating || null
        };

        if (last.sharedSessionOwner) {
            await update(
                ref(db, `users/${currentUserUID}/anki/shared_progress/${last.sharedSessionOwner}/${last.firebaseKey}`),
                restoreData
            );
        } else {
            // Restaura também os contadores de acerto/erro
            restoreData.hitCount = snap.hitCount || 0;
            restoreData.missCount = snap.missCount || 0;

            await update(ref(db, `users/${currentUserUID}/anki/cards/${last.firebaseKey}`), restoreData);

            if (allCards[last.firebaseKey]) {
                allCards[last.firebaseKey] = { ...allCards[last.firebaseKey], ...restoreData };
            }
        }

        // 2. Reverte o placar da sessão
        if (last.isMiss) {
            sessionMiss = Math.max(0, sessionMiss - 1);
        } else {
            sessionHits = Math.max(0, sessionHits - 1);
        }

        // 3. Volta para o card anterior na fila
        currentCardIndex = last.indexBefore;
        if (currentCardIndex < 0) currentCardIndex = 0;

        // Se a sessão tinha terminado, volta a exibir a tela de estudo
        const viewEmpty = document.getElementById('viewEmpty');
        const viewStudy = document.getElementById('viewStudy');
        if (viewEmpty) viewEmpty.classList.add('hidden');
        if (viewStudy) viewStudy.classList.remove('hidden');

        showCurrentCard();

    } catch (e) {
        console.error("Erro ao desfazer:", e);
        showToast("Não foi possível desfazer a última ação.", 'error');
    }
};

// --- FUNÇÕES DE GERENCIAMENTO (MODAL) QUE ESTAVAM FALTANDO ---
window.openManagerModal = function() {
    document.getElementById('managerModal').classList.remove('hidden');
    // Abre por padrão na aba de lista
    window.switchManagerTab('list');
};

window.closeManagerModal = function() {
    document.getElementById('managerModal').classList.add('hidden');
};

window.switchManagerTab = function(tabName) {
    const viewList = document.getElementById('managerTabView_List');
    const viewIO = document.getElementById('managerTabView_IO');
    // Seleciona botões de aba dentro do managerModal
    const btns = document.querySelectorAll('#managerModal .config-tab-btn');

    if (tabName === 'list') {
        viewList.classList.remove('hidden');
        viewIO.classList.add('hidden');
        if(btns[0]) btns[0].classList.add('active');
        if(btns[1]) btns[1].classList.remove('active');
        window.renderManagerList(); // Recarrega a lista ao voltar para ela
    } else {
        viewList.classList.add('hidden');
        viewIO.classList.remove('hidden');
        if(btns[0]) btns[0].classList.remove('active');
        if(btns[1]) btns[1].classList.add('active');
        // Popula os selects de importação/exportação
        if(typeof populateExportImportSelects === 'function') {
            populateExportImportSelects();
        }
    }
};

window.renderManagerList = function() {
    const tbody = document.getElementById('managerTableBody');
    const filterText = document.getElementById('managerSearch').value.toLowerCase();
    const filterDeck = document.getElementById('managerFilterDeck').value;
    const selectAllBox = document.getElementById('managerSelectAll');
    
    tbody.innerHTML = '';
    
    if(selectAllBox) selectAllBox.checked = false;

    if(document.getElementById('managerFilterDeck').options.length <= 1) {
        const suggestions = new Set();
        Object.values(allCards).forEach(c => suggestions.add(c.deck));
        Array.from(suggestions).sort().forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.text = d;
            document.getElementById('managerFilterDeck').appendChild(opt);
        });
    }

    let cardsArray = Object.keys(allCards).map(key => ({...allCards[key], id: key}));
    
    const filtered = cardsArray.filter(card => {
        const matchDeck = filterDeck === 'todos' || card.deck === filterDeck;
        const searchContent = (
            (card.front || '') + ' ' + 
            (card.back || '') + ' ' + 
            (card.deck || '') + ' ' + 
            (card.legalBasis || '') 
        ).toLowerCase();
        
        return matchDeck && searchContent.includes(filterText);
    });
    
    // ETAPA 2: calcula o total de acertos/erros do que está filtrado
    let totalHits = 0, totalMiss = 0;
    filtered.forEach(card => {
        totalHits += (card.hitCount || 0);
        totalMiss += (card.missCount || 0);
    });
    const totalBox = document.getElementById('managerStatsBar');
    if (totalBox) {
        const totalResp = totalHits + totalMiss;
        const pct = totalResp > 0 ? Math.round((totalHits / totalResp) * 100) : 0;
        const escopo = (filterDeck === 'todos') ? 'Geral (todos os baralhos)' : `Baralho: ${filterDeck}`;
        const elScope = document.getElementById('managerStatsScope');
        const elHits = document.getElementById('managerStatsHits');
        const elMiss = document.getElementById('managerStatsMiss');
        const elPct = document.getElementById('managerStatsPct');
        if (elScope) elScope.innerText = escopo;
        if (elHits) elHits.innerText = totalHits;
        if (elMiss) elMiss.innerText = totalMiss;
        if (elPct) elPct.innerText = totalResp > 0 ? `${pct}% de acerto` : 'Sem respostas ainda';
    }

    filtered.forEach((card, index) => {
        const tr = document.createElement('tr');
        
        // DETECTOR DE SANGUESSUGAS
        const isLeech = card.ease && card.ease < 1.35; 
        if(isLeech) {
            tr.className = "border-b border-gray-100 transition leech-row"; // Classe definida no CSS
            tr.title = "Sanguessuga: Fator de facilidade muito baixo. Recomendado resetar.";
        } else {
            tr.className = "border-b border-gray-100 hover:bg-gray-50 transition";
        }
        
        const previewFront = (card.front || '').replace(/<[^>]*>?/gm, '').substring(0, 50) + '...';
        
        let typeBadge = card.category === 'jurisprudencia' ? '<span class="text-[9px] bg-pink-100 text-pink-600 px-2 py-0.5 rounded font-bold">JURIS</span>' : '<span class="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-bold">CONT</span>';
        if(card.imported) typeBadge += ' <span class="text-[9px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded font-bold ml-1" title="Importado"><i class="fa-solid fa-file-import"></i></span>';

        const legalText = card.legalBasis ? `<span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200 font-mono">${card.legalBasis}</span>` : '<span class="text-gray-300 text-[10px]">-</span>';

        const isChecked = selectedManagerCards.has(card.id) ? 'checked' : '';

        // ETAPA 2: célula com contadores de acerto e erro do card
        const hits = card.hitCount || 0;
        const miss = card.missCount || 0;
        const statsCell = `
            <div class="flex items-center justify-center gap-2">
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-green-600 bg-green-50 border border-green-100 px-2 py-0.5 rounded" title="Acertos">
                    <i class="fa-solid fa-check"></i> ${hits}
                </span>
                <span class="inline-flex items-center gap-1 text-[11px] font-bold text-red-500 bg-red-50 border border-red-100 px-2 py-0.5 rounded" title="Erros">
                    <i class="fa-solid fa-xmark"></i> ${miss}
                </span>
            </div>`;

        // --- BOTÃO NOVO ADICIONADO ABAIXO (AMARELO) ---
        tr.innerHTML = `
            <td class="p-4 text-center">
                <input type="checkbox" class="manager-card-checkbox rounded border-gray-300 text-sky-600 focus:ring-sky-500 cursor-pointer" 
                data-id="${card.id}" onclick="window.toggleManagerCardSelection('${card.id}')" ${isChecked}>
            </td>
            <td class="p-4 font-mono text-gray-400 text-xs">${index + 1}</td>
            <td class="p-4">${typeBadge}</td>
            <td class="p-4 font-bold text-gray-600 text-xs">${card.deck}</td>
            <td class="p-4 text-gray-700">${previewFront}</td>
            <td class="p-4">${legalText}</td>
            <td class="p-4 text-center">${statsCell}</td>
            <td class="p-4 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button class="text-amber-500 hover:text-amber-600" onclick="window.resetCardProgress('${card.id}')" title="Resetar Progresso (Sanguessuga)"><i class="fa-solid fa-rotate-right"></i></button>
                    <button class="text-sky-600 hover:text-sky-800" onclick="window.editCard('${card.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button class="text-red-400 hover:text-red-600" onclick="window.deleteCard('${card.id}')" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

function populateExportImportSelects() {
    const exportSel = document.getElementById('exportDeckSelect');
    const importSel = document.getElementById('importTargetDeck');
    exportSel.innerHTML = '<option value="">Escolha...</option>';
    importSel.innerHTML = '<option value="">Selecione...</option>';
    const deckNames = new Set();
    Object.values(allCards).forEach(c => deckNames.add(c.deck));
    Array.from(deckNames).sort().forEach(d => {
        const opt1 = document.createElement('option'); opt1.value = d; opt1.text = d;
        const opt2 = document.createElement('option'); opt2.value = d; opt2.text = d;
        exportSel.appendChild(opt1);
        importSel.appendChild(opt2);
    });
}

window.exportDeckAction = function() {
    const deckName = document.getElementById('exportDeckSelect').value;
    if(!deckName) return showToast("Selecione um baralho para exportar.", 'success');
    const cardsToExport = Object.values(allCards).filter(c => c.deck === deckName).map(c => {
        const { interval, ease, nextReview, lastReview, lastRating, ...cleanCard } = c;
        cleanCard.exportedDate = new Date().toISOString();
        return cleanCard;
    });
    if(cardsToExport.length === 0) return showToast("Baralho vazio.", 'error');
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cardsToExport, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Baralho_${deckName.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.updateImportFileName = function() {
    const input = document.getElementById('importFileInput');
    const span = document.getElementById('importFileName');
    if(input.files.length > 0) span.innerText = input.files[0].name;
    else span.innerText = "Selecionar Arquivo JSON...";
};

window.toggleImportMode = function() {
    const mode = document.querySelector('input[name="importMode"]:checked').value;
    document.getElementById('importNewDeckName').disabled = (mode !== 'new');
    document.getElementById('importTargetDeck').disabled = (mode !== 'merge');
    if(mode === 'new') {
        document.getElementById('importNewDeckName').classList.remove('opacity-50');
        document.getElementById('importTargetDeck').classList.add('opacity-50');
    } else {
        document.getElementById('importNewDeckName').classList.add('opacity-50');
        document.getElementById('importTargetDeck').classList.remove('opacity-50');
    }
};

window.deleteCard = async function(id) { 
    if(!confirm("Excluir?")) return; 
    try { 
        await remove(ref(db, `users/${currentUserUID}/anki/cards/${id}`)); 
        loadAnkiData().then(()=>window.renderManagerList()); 
    } catch(e){ console.error(e); } 
};

window.editCard = function(id) {
    const card = allCards[id]; if(!card) return;
    
    window.closeManagerModal(); 
    window.openCreateModal();
    
    isEditingFromManager = true;
    document.getElementById('btnBackToManager').classList.remove('hidden');
    
    document.getElementById('modalTitleText').innerText = "Editar Flashcard";
    document.getElementById('inputCardId').value = id;
    
    const parts = card.deck.split("::");
    const name = parts.pop();
    const folder = parts.join("::");
    
    selectedCreateFolder = folder;
    document.getElementById('displaySelectedFolder').innerHTML = `<i class="fa-solid fa-folder text-amber-400 mr-2"></i> <span>${folder||'Início'}</span>`;
    document.getElementById('inputDeckNameNew').value = name;
    window.updateDeckSuggestions();

    document.getElementById('inputFront').innerHTML = card.front;
    document.getElementById('inputBack').innerHTML = card.back;
    document.getElementById('inputLegalBasis').value = card.legalBasis || '';
    document.getElementById('inputLink').value = card.link || '';
    
    window.setModalCategory(card.category || 'conteudo');
    
    // Define o formato e atualiza a UI
    document.getElementById('inputCardFormat').value = card.format || 'basic';
    window.toggleFormatUI();

    // --- CARREGAR GABARITO ---
    if (card.format === 'objective' && card.objectiveAnswer) {
        const radio = document.querySelector(`input[name="inputObjectiveAnswer"][value="${card.objectiveAnswer}"]`);
        if (radio) radio.checked = true;
    }
    // -------------------------
};

window.wrapCloze = function() { 
    const s=window.getSelection(); 
    if(!s.rangeCount)return; 
    const r=s.getRangeAt(0); 
    const t=r.toString(); 
    if(!t)return showToast("Selecione texto.", 'success'); 
    document.execCommand('insertText', false, `{{c1::${t}}}`); 
};

function processCloze(t,b){ 
    if(!t)return ""; 
    const r=/{{c1::(.*?)}}/g; 
    return b?t.replace(r,'<span class="cloze-revealed">$1</span>'):t.replace(r,'<span class="cloze-bracket">[...]</span>'); 
}

function populateDeckSuggestions() { 
    const d=document.getElementById('deckSuggestions'); 
    if(!d) return;
    d.innerHTML=''; 
    const cElem = document.getElementById('inputCategory');
    if(!cElem) return; 
    const c = cElem.value;
    const s=new Set(); 
    Object.values(allCards).forEach(x=>{ if((x.category||'conteudo')===c) s.add(x.deck); }); 
    s.forEach(v=>{ const o=document.createElement('option'); o.value=v; d.appendChild(o); }); 
}

window.execCmd = (c,v) => document.execCommand(c,false,v);

window.toggleColorPopover = (b, type) => { 
    const p=document.getElementById('popover-color'); 
    const r=b.getBoundingClientRect(); 
    p.style.top=(r.bottom+5)+'px'; 
    p.style.left=r.left+'px'; 
    p.classList.toggle('show'); 
};

window.applyColor = (c) => { 
    document.execCommand(c==='#facc15'?'hiliteColor':'foreColor', false, c); 
    document.querySelectorAll('.color-popover').forEach(e=>e.classList.remove('show')); 
};

window.insertTable = () => document.execCommand('insertHTML', false, '<table style="width:100%; border:1px solid black"><tr><td>.</td><td>.</td></tr></table>');

// --- 6. LOGOUT (Correção para o botão do Menu) ---
document.addEventListener('click', (e) => {
    // Detecta clique no botão de sair (mesmo que criado dinamicamente pelo menu.js)
    const btn = e.target.closest('#btnLogout');
    
    if (btn) {
        e.preventDefault();
        if(confirm("Deseja realmente sair?")) {
            signOut(auth).then(() => {
                console.log("Deslogado com sucesso.");
                window.location.href = 'index.html';
            }).catch((error) => {
                console.error("Erro ao sair:", error);
            });
        }
    }
});

// --- TIMER COMPARTILHADO ---

window.prepareSharedSession = function(ownerUid, deckPath, role, totalDue) {
    // Guarda os dados para usar depois que o usuário escolher o tempo
    pendingSharedData = { ownerUid, deckPath, role };
    
    // Usa a mesma lógica de abrir o modal do deck local
    // Se totalDue > 0, modo normal. Se 0, pergunta Cramming.
    if (totalDue > 0) {
        openTimerConfig(deckPath + " (Compartilhado)", false);
    } else if (confirm(`Este baralho compartilhado está em dia! \n\nGostaria de revisar tudo novamente (Modo Cramming)?`)) {
        openTimerConfig(deckPath + " (Compartilhado)", true);
    }
};

window.confirmTimerStart = function() {
    let seconds = 0;
    
    if (studyTimerMode === 'timer') {
        const mins = parseInt(document.getElementById('inputTimerMinutes').value) || 25;
        seconds = mins * 60;
    } else {
        seconds = 0; // Stopwatch starts at 0, None uses 0
    }
    
    document.getElementById('timerConfigModal').classList.add('hidden');
    
    // VERIFICAÇÃO: É uma sessão compartilhada ou local?
    if (pendingSharedData) {
        // Inicia Sessão Compartilhada
        startSharedSession(pendingSharedData.ownerUid, pendingSharedData.deckPath, pendingSharedData.role);
        pendingSharedData = null; // Limpa para a próxima
    } else {
        // Inicia Sessão Local
        startStudySession(pendingDeckName, pendingIsCramming);
    }
    
    // Inicia o Timer se não for 'none'
    if (studyTimerMode !== 'none') {
        initStudyTimer(studyTimerMode, seconds);
    } else {
        document.getElementById('studyTimerContainer').classList.add('hidden');
    }
};

// --- EXPORTAÇÃO RÁPIDA (Atalho no Grid) ---
window.quickExportDeck = function(deckPath, event) {
    if(event) event.stopPropagation(); // Não abrir o baralho ao clicar no botão
    
    // 1. Abre o Modal
    window.openManagerModal();
    
    // 2. Troca para a aba de Importar/Exportar
    window.switchManagerTab('io');
    
    // 3. Pré-seleciona o baralho (Delay pequeno para garantir que o select foi populado)
    setTimeout(() => {
        const select = document.getElementById('exportDeckSelect');
        if(select) {
            select.value = deckPath;
            // Efeito visual para mostrar que foi selecionado
            select.style.borderColor = '#0ea5e9'; // Sky 500
            setTimeout(() => select.style.borderColor = '', 1000);
        }
    }, 100);
};

//card certo e errado
window.checkObjectiveAnswer = function(userChoice, event) {
    if(event) event.stopPropagation(); 

    const card = studyQueue[currentCardIndex];
    if (!card || !card.objectiveAnswer) {
        window.revealCard(true); // Garante que revele mesmo se falhar a lógica
        return;
    }
    
    // Bloqueia botões
    const allBtns = document.querySelectorAll('#objectiveStudyActions button');
    allBtns.forEach(b => {
        b.disabled = true;
        b.classList.add('opacity-50', 'cursor-not-allowed');
        b.classList.remove('hover:bg-green-200', 'hover:bg-red-200', 'transform', 'scale-110');
    });

    const btn = event.target;
    btn.classList.remove('opacity-50'); 

    const isCorrect = (userChoice === card.objectiveAnswer);
    const feedbackEl = document.getElementById('objectiveFeedbackDisplay');

    if (isCorrect) {
        btn.className = "bg-green-500 text-white border border-green-600 px-4 py-2 rounded-lg font-bold text-sm shadow-md w-24 scale-105 transition cursor-not-allowed";
        
        if(feedbackEl) {
            feedbackEl.innerHTML = `
                <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-50 border border-green-100 animate-fade-in shadow-sm">
                    <i class="fa-solid fa-circle-check text-green-500 text-base"></i>
                    <span class="text-green-700 font-bold text-sm">Correto!</span>
                </div>
            `;
            feedbackEl.classList.remove('hidden');
        }

    } else {
        btn.className = "bg-red-500 text-white border border-red-600 px-4 py-2 rounded-lg font-bold text-sm shadow-md w-24 shake-animation transition cursor-not-allowed";
        
        if(feedbackEl) {
            feedbackEl.innerHTML = `
                <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-50 border border-red-100 animate-fade-in shadow-sm">
                    <i class="fa-solid fa-circle-xmark text-red-500 text-base"></i>
                    <span class="text-red-600 font-bold text-sm">Você errou.</span>
                </div>
            `;
            feedbackEl.classList.remove('hidden');
        }
    }

    setTimeout(() => {
        // ETAPA 4: mostra só os botões adequados ao resultado
        // Acertou -> Difícil, Bom, Fácil | Errou -> Errei, Difícil
        applyObjectiveButtonsVisibility(isCorrect);
        // AQUI ESTÁ A MUDANÇA: passamos 'true' para forçar a revelação
        window.revealCard(true);
    }, 600);
};

// --- ETAPA 4: AJUSTA QUAIS BOTÕES DE AVALIAÇÃO APARECEM (cards Certo/Errado) ---
function applyObjectiveButtonsVisibility(isCorrect) {
    const controls = document.getElementById('studyControls');
    if (!controls) return;
    const botoes = controls.querySelectorAll('button');
    // Ordem fixa no HTML: 0=Errei, 1=Difícil, 2=Bom, 3=Fácil
    // Acertou: esconde Errei (índice 0). Errou: esconde Bom e Fácil (índices 2 e 3).
    botoes.forEach((b, i) => {
        let mostrar = true;
        if (isCorrect) {
            if (i === 0) mostrar = false;        // sem "Errei"
        } else {
            if (i === 2 || i === 3) mostrar = false; // sem "Bom" e "Fácil"
        }
        b.style.display = mostrar ? '' : 'none';
    });
}

// --- ETAPA 4: RESTAURA TODOS OS 4 BOTÕES (usado ao trocar de card) ---
function resetRatingButtonsVisibility() {
    const controls = document.getElementById('studyControls');
    if (!controls) return;
    controls.querySelectorAll('button').forEach(b => { b.style.display = ''; });
}


//resetar o progresso do cartão
window.resetCardProgress = async function(id) {
    if(!confirm("Deseja resetar o progresso deste card?\n\nEle voltará a ser um card NOVO e sairá do estado de Sanguessuga.")) return;

    // Dados de um card "virgem"
    const resetData = {
        interval: 0,
        ease: 2.5, // Volta para 250% (Padrão)
        nextReview: Date.now(), // Disponível para estudar agora
        lastReview: 0,
        lastRating: null
    };

    try {
        // Atualiza no Firebase
        await update(ref(db, `users/${currentUserUID}/anki/cards/${id}`), resetData);
        
        // Atualiza Localmente (para ver o resultado na hora sem F5)
        if(allCards[id]) {
            allCards[id] = { ...allCards[id], ...resetData };
        }
        
        // Re-renderiza a lista (a linha vermelha vai sumir)
        window.renderManagerList();
        
    } catch (e) {
        console.error(e);
        showToast("Erro ao resetar card.", 'error');
    }
};

// --- ETAPA 2/3: RESETAR APENAS A CONTAGEM DE ACERTOS/ERROS DE UM BARALHO ---
window.resetDeckCount = async function(deckName, event) {
    if (event) event.stopPropagation(); // não abrir o baralho ao clicar no botão

    if (!confirm(`Zerar apenas a contagem de ACERTOS e ERROS do baralho "${deckName}"?\n\nO agendamento e o conteúdo dos cards NÃO serão afetados.\nEsta ação não pode ser desfeita.`)) return;

    const updates = {};
    let count = 0;

    // Zera os contadores de todos os cards desse baralho
    Object.keys(allCards).forEach(key => {
        if (allCards[key].deck === deckName) {
            updates[`users/${currentUserUID}/anki/cards/${key}/hitCount`] = 0;
            updates[`users/${currentUserUID}/anki/cards/${key}/missCount`] = 0;
            // Atualiza também a memória local
            allCards[key].hitCount = 0;
            allCards[key].missCount = 0;
            count++;
        }
    });

    if (count === 0) {
        showToast("Nenhum card encontrado neste baralho.", 'error');
        return;
    }

    try {
        await update(ref(db), updates);
        showToast(`Acertos/erros zerados em ${count} card(s).`, 'success');
        renderDecksView(); // atualiza a tela (dados já estão na memória)
    } catch (e) {
        console.error(e);
        showToast("Erro ao zerar a contagem do baralho.", 'error');
    }
};

// --- ETAPA 3: RESET TOTAL DO BARALHO ---
// Deixa todos os cards do baralho como se NUNCA tivessem sido respondidos:
// zera agendamento, histórico, acertos/erros, marcas de volta e contador de voltas.
window.resetDeckFull = async function(deckName, event) {
    if (event) event.stopPropagation(); // não abrir o baralho ao clicar no botão

    if (!confirm(
        `RESET TOTAL do baralho "${deckName}".\n\n` +
        `ATENÇÃO: isto apaga TODO o seu progresso neste baralho:\n` +
        `• o agendamento de revisão (todos os cards voltam a ser NOVOS)\n` +
        `• o histórico de respostas (Errei/Bom/datas)\n` +
        `• a contagem de acertos e erros\n` +
        `• o contador de voltas concluídas\n\n` +
        `O conteúdo dos cards (frente/verso) é mantido.\n` +
        `Esta ação NÃO pode ser desfeita. Deseja continuar?`
    )) return;

    const now = Date.now();
    const updates = {};
    let count = 0;

    // Para cada card do baralho, restaura os campos como um card "virgem"
    Object.keys(allCards).forEach(key => {
        if (allCards[key].deck === deckName) {
            const base = `users/${currentUserUID}/anki/cards/${key}`;
            updates[`${base}/interval`] = 0;
            updates[`${base}/ease`] = 2.5;
            updates[`${base}/nextReview`] = now;   // disponível para estudar agora
            updates[`${base}/lastReview`] = 0;
            updates[`${base}/lastRating`] = null;
            updates[`${base}/hitCount`] = 0;
            updates[`${base}/missCount`] = 0;
            updates[`${base}/roundDone`] = false;  // marca de "volta" (ver contador de voltas)
            count++;
        }
    });

    if (count === 0) {
        showToast("Nenhum card encontrado neste baralho.", 'error');
        return;
    }

    // Zera também o contador de voltas concluídas (guardado nas configurações do baralho)
    const safeKey = encodeKey(deckName);
    updates[`users/${currentUserUID}/anki/settings/${safeKey}/roundsCompleted`] = 0;

    try {
        await update(ref(db), updates);
        // Recarrega tudo da nuvem para a tela refletir na hora (Domínio 0%, Novos, barra vazia)
        await loadAnkiData();
        showToast(`Reset total concluído: ${count} card(s) voltaram a ser novos.`, 'success');
    } catch (e) {
        console.error(e);
        showToast("Erro ao executar o reset total.", 'error');
    }
};

//backup dos cards completo
// --- FUNÇÃO DE BACKUP COMPLETO (NOVO) ---
window.exportFullBackup = function() {
    if(Object.keys(allCards).length === 0) return showToast("Não há dados para exportar.", 'success');

    const backupData = {
        type: 'FULL_BACKUP',
        timestamp: Date.now(),
        cards: allCards,
        settings: deckSettings
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `Backup_Flashcards_${dateStr}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

// --- IMPORTAÇÃO INTELIGENTE (ATUALIZADA) ---
// Substitua a função window.importDeckAction existente por esta:
window.importDeckAction = function() {
    const input = document.getElementById('importFileInput');
    if(input.files.length === 0) return showToast("Selecione um arquivo JSON primeiro.", 'success');
    
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // CASO 1: É UM BACKUP COMPLETO (Restaura tudo)
            if (data.type === 'FULL_BACKUP' && data.cards) {
                if(!confirm("Este arquivo parece ser um BACKUP COMPLETO.\n\nIsso irá adicionar todos os cards e restaurar configurações.\nDeseja continuar?")) return;
                
                // Mescla ou sobrescreve? O Firebase update mescla chaves.
                // Para restaurar exatamente, ideal seria setar, mas perigoso apagar dados novos.
                // Vamos usar update para somar aos dados atuais.
                const updates = {};
                
                // Restaura cards
                Object.keys(data.cards).forEach(key => {
                    updates[`users/${currentUserUID}/anki/cards/${key}`] = data.cards[key];
                });
                
                // Restaura configurações
                if(data.settings) {
                    updates[`users/${currentUserUID}/anki/settings`] = data.settings;
                }

                await update(ref(db), updates);
                showToast("Backup restaurado com sucesso!", 'success');
                loadAnkiData();
                window.closeManagerModal();
                return;
            }

            // CASO 2: É UM BARALHO ÚNICO (Lógica Antiga)
            let importedCards = data;
            // Se o JSON vier encapsulado (alguns exports fazem isso), tente extrair
            if (!Array.isArray(importedCards) && importedCards.cards) {
                 // Fallback se alguém tentar importar um backup como se fosse deck
                 importedCards = Object.values(importedCards.cards);
            }
            
            if(!Array.isArray(importedCards)) throw new Error("Formato de arquivo não reconhecido.");
            
            const mode = document.querySelector('input[name="importMode"]:checked').value;
            let targetDeckName = "";
            if(mode === 'new') {
                targetDeckName = document.getElementById('importNewDeckName').value.trim();
                if(!targetDeckName) return showToast("Digite o nome do novo baralho.", 'success');
            } else {
                targetDeckName = document.getElementById('importTargetDeck').value;
                if(!targetDeckName) return showToast("Selecione o baralho existente.", 'success');
            }

            let count = 0;
            const updates = {};
            const now = Date.now();
            
            importedCards.forEach(card => {
                if(!card.front || !card.back) return;
                const newKey = push(ref(db, `users/${currentUserUID}/anki/cards`)).key;
                
                // Remove propriedades de sistema antigas para tratar como novo (exceto se quisermos manter histórico)
                // Geralmente importação zera o histórico para você estudar do zero.
                const newCard = { 
                    front: card.front,
                    back: card.back,
                    category: card.category || 'conteudo',
                    format: card.format || 'basic',
                    legalBasis: card.legalBasis || '',
                    link: card.link || '',
                    objectiveAnswer: card.objectiveAnswer || null,
                    deck: targetDeckName, 
                    imported: true, 
                    created: now, 
                    interval: 0, 
                    ease: 2.5, 
                    nextReview: now, 
                    lastReview: 0,
                    lastRating: null,
                    hitCount: 0,  // ETAPA 2: contador de acertos
                    missCount: 0,  // ETAPA 2: contador de erros
                    roundDone: false  // ETAPA 3: marca de volta do baralho
                };
                
                updates[`users/${currentUserUID}/anki/cards/${newKey}`] = newCard;
                count++;
            });
            
            if(count > 0) {
                await update(ref(db), updates);
                showToast(`${count} cartões importados para "${targetDeckName}"!`, 'success');
                loadAnkiData(); 
                window.closeManagerModal();
                input.value = '';
            } else { showToast("Nenhum cartão válido encontrado no arquivo.", 'error'); }

        } catch(err) { console.error(err); showToast("Erro ao importar: " + err.message, 'error'); }
    };
    reader.readAsText(file);
};

// --- ATALHOS DE TECLADO (POWER USER) ---
document.addEventListener('keydown', (e) => {
    // Se estiver em algum modal ou input, ignora
    if (!document.getElementById('viewStudy') || document.getElementById('viewStudy').classList.contains('hidden')) return;
    if (document.querySelector('.editor-content:focus')) return;
    if (!document.getElementById('deckConfigModal').classList.contains('hidden')) return;
    if (!document.getElementById('createModal').classList.contains('hidden')) return;

    const container = document.getElementById('flashcardContainer');
    const isRevealed = container.classList.contains('revealed');
    
    // Espaço: Revelar
    if (e.code === 'Space') {
        e.preventDefault();
        if (!isRevealed) {
            window.revealCard();
        } 
    }

    // Atalhos para Card OBJETIVO (Certo/Errado)
    const card = studyQueue[currentCardIndex];
    if (card && card.format === 'objective' && !isRevealed) {
        if (e.key === 'ArrowLeft' || e.key === '1') {
            window.checkObjectiveAnswer('certo'); // Esquerda = Certo (Padrão Tinder/Apps) - Ou ajuste conforme preferência
        }
        if (e.key === 'ArrowRight' || e.key === '2') {
            window.checkObjectiveAnswer('errado');
        }
        return; 
    }

    // Atalhos de Avaliação (Só funcionam se revelado)
    if (isRevealed) {
        if (e.key === '1') window.rateCard('again');
        if (e.key === '2') window.rateCard('hard');
        if (e.key === '3') window.rateCard('good');
        if (e.key === '4') window.rateCard('easy');
    }
});

// --- ETAPA 4: MODAL DE ESTATÍSTICAS DA PASTA ---

// Abre o modal mostrando os cards da pasta em que o usuário está navegando.
window.openFolderStats = function() {
    const modal = document.getElementById('folderStatsModal');
    if (!modal) return;

    // Caminho da pasta atual (vazio = Início/Raiz)
    const pastaAtual = currentPathStack.join("::");
    const titulo = document.getElementById('folderStatsTitle');
    if (titulo) titulo.innerText = pastaAtual === "" ? "Início (todas as pastas)" : pastaAtual;

    modal.classList.remove('hidden');
    window.renderFolderStats();
};

window.closeFolderStats = function() {
    const modal = document.getElementById('folderStatsModal');
    if (modal) modal.classList.add('hidden');
};

// Monta a lista de estatísticas, respeitando a ordenação escolhida.
window.renderFolderStats = function() {
    const tbody = document.getElementById('folderStatsBody');
    const empty = document.getElementById('folderStatsEmpty');
    const resumo = document.getElementById('folderStatsResumo');
    if (!tbody) return;

    const pastaAtual = currentPathStack.join("::");

    // Junta os cards da pasta atual (e subpastas), respeitando a categoria ativa
    let cards = Object.keys(allCards)
        .map(key => ({ ...allCards[key], id: key }))
        .filter(c => {
            const deck = c.deck || "";
            const dentroDaPasta = (pastaAtual === "")
                ? true
                : (deck === pastaAtual || deck.startsWith(pastaAtual + "::"));
            const mesmaCategoria = (c.category || 'conteudo') === currentCategoryFilter;
            return dentroDaPasta && mesmaCategoria;
        });

    // Cálculo de aproveitamento de cada card
    cards.forEach(c => {
        c._hits = c.hitCount || 0;
        c._miss = c.missCount || 0;
        c._total = c._hits + c._miss;
        c._pct = c._total > 0 ? Math.round((c._hits / c._total) * 100) : -1; // -1 = sem respostas
    });

    // Ordenação
    const ordem = (document.getElementById('folderStatsSort') || {}).value || 'missDesc';
    cards.sort((a, b) => {
        switch (ordem) {
            case 'hitDesc':   return b._hits - a._hits;
            case 'totalDesc': return b._total - a._total;
            case 'pctAsc':
                // cards sem resposta vão para o fim
                if (a._pct === -1) return 1;
                if (b._pct === -1) return -1;
                return a._pct - b._pct;
            case 'pctDesc':
                if (a._pct === -1) return 1;
                if (b._pct === -1) return -1;
                return b._pct - a._pct;
            case 'missDesc':
            default:          return b._miss - a._miss;
        }
    });

    // Resumo geral da pasta
    let somaHits = 0, somaMiss = 0;
    cards.forEach(c => { somaHits += c._hits; somaMiss += c._miss; });
    const somaTotal = somaHits + somaMiss;
    const pctGeral = somaTotal > 0 ? Math.round((somaHits / somaTotal) * 100) : 0;
    if (resumo) {
        resumo.innerText = `${cards.length} card(s) • ${somaHits} acertos • ${somaMiss} erros` +
            (somaTotal > 0 ? ` • ${pctGeral}% de aproveitamento` : '');
    }

    // Renderiza a tabela
    tbody.innerHTML = '';
    if (cards.length === 0) {
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    cards.forEach((c, index) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 hover:bg-gray-50 transition";

        // Texto do card sem HTML
        const texto = (c.front || '(sem texto)').replace(/<[^>]*>?/gm, '').substring(0, 70);
        const nomeBaralho = (c.deck || '').split('::').pop();

        // Cor do aproveitamento
        let pctTexto, pctClasse;
        if (c._pct === -1) {
            pctTexto = '—';
            pctClasse = 'text-gray-300';
        } else {
            pctTexto = c._pct + '%';
            pctClasse = c._pct >= 70 ? 'text-green-600' : (c._pct >= 40 ? 'text-amber-600' : 'text-red-500');
        }

        tr.innerHTML = `
            <td class="p-3 font-mono text-gray-400 text-xs">${index + 1}</td>
            <td class="p-3 font-bold text-gray-500 text-xs">${nomeBaralho}</td>
            <td class="p-3 text-gray-700">${texto}</td>
            <td class="p-3 text-center">
                <span class="inline-flex items-center gap-1 text-xs font-bold text-green-600">
                    <i class="fa-solid fa-check"></i> ${c._hits}
                </span>
            </td>
            <td class="p-3 text-center">
                <span class="inline-flex items-center gap-1 text-xs font-bold text-red-500">
                    <i class="fa-solid fa-xmark"></i> ${c._miss}
                </span>
            </td>
            <td class="p-3 text-center font-extrabold ${pctClasse}">${pctTexto}</td>
        `;
        tbody.appendChild(tr);
    });
};