// anki.js - Sistema SRS Completo + Pastas + Drag & Drop + Navegação Focada
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

// Variáveis de Estado
let draggedItemPath = null;
let selectedTargetFolder = null;
let selectedCreateFolder = ""; 

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
`;
document.head.appendChild(style);

console.log("🧠 Iniciando Anki Expert (Versão Foco Total)...");

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
    currentPathStack = [];
    document.getElementById('nav-conteudo').classList.toggle('active', category === 'conteudo');
    document.getElementById('nav-juris').classList.toggle('active', category === 'jurisprudencia');
    renderDecksView();
};

window.showDecksView = function() {
    const viewStudy = document.getElementById('viewStudy');
    const viewDecks = document.getElementById('viewDecks');
    const viewEmpty = document.getElementById('viewEmpty');
    const mainHeader = document.getElementById('mainHeader');

    // MOSTRAR CABEÇALHO AO SAIR DO ESTUDO
    if(mainHeader) mainHeader.classList.remove('hidden');

    if(viewStudy) viewStudy.classList.add('hidden');
    if(viewEmpty) viewEmpty.classList.add('hidden');
    if(viewDecks) viewDecks.classList.remove('hidden');
    
    const btnNewFolder = document.getElementById('btnNewFolderHeader');
    if(btnNewFolder) btnNewFolder.classList.remove('hidden');

    loadAnkiData();
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
                alert("Card adiado. Sessão finalizada.");
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
    renderDecksView();
};

window.navigateUp = function() {
    currentPathStack.pop();
    renderDecksView();
};

window.navigateToPath = function(index) {
    currentPathStack = currentPathStack.slice(0, index + 1);
    renderDecksView();
};

window.resetPath = function() {
    currentPathStack = [];
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
    let count = 0;

    Object.keys(allCards).forEach(key => {
        const deck = allCards[key].deck || "";
        if (deck === oldPrefix || deck.startsWith(oldPrefix + "::")) {
            const newDeckName = newPrefix + deck.substring(oldPrefix.length);
            updates[`users/${currentUserUID}/anki/cards/${key}/deck`] = newDeckName;
            count++;
        }
    });

    if (count > 0) { 
        try { 
            await update(ref(db), updates); 
            loadAnkiData(); 
            if(!document.getElementById('deckConfigModal').classList.contains('hidden')) window.closeDeckConfigModal(); 
        } catch(e) { 
            console.error(e); 
            alert("Erro ao mover: " + e.message); 
        } 
    } else { 
        alert("Nenhum item encontrado."); 
    }
}

// --- RENDERIZAÇÃO GRID ---
function renderDecksView() {
    const container = document.getElementById('viewDecks');
    const breadcrumbContainer = document.getElementById('deckBreadcrumbs');
    
    container.innerHTML = '';
    
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

    if (Object.keys(groups).length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-20 text-gray-400 opacity-60">
                <p>Esta pasta está vazia.</p>
                <p class="text-xs mt-2">Clique em <span class="text-sky-600 cursor-pointer font-bold hover:underline" onclick="window.openCreateModal()">Novo Card</span> para criar o primeiro baralho aqui.</p>
            </div>`;
        return;
    }

    Object.keys(groups).sort().forEach(itemName => {
        const info = groups[itemName];
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
            cardEl.className = `bg-white rounded-2xl p-5 shadow-sm border border-amber-200/50 hover:shadow-lg hover:border-amber-300 transition flex flex-col justify-between h-48 group relative overflow-hidden`;
            cardEl.innerHTML = `
                <div class="deck-actions z-30">
                    <div class="drag-handle mr-2" title="Segure para arrastar"><i class="fa-solid fa-grip-vertical"></i></div>
                    <button class="btn-deck-action" onclick="window.renameFolder('${info.fullPath}', event)" title="Renomear Pasta"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-deck-action del" onclick="window.deleteFolder('${info.fullPath}', event)" title="Excluir Pasta"><i class="fa-solid fa-trash"></i></button>
                </div>
                
                <div onclick="window.enterFolder('${itemName}')" class="cursor-pointer h-full flex flex-col justify-between">
                    <div class="flex items-start gap-3 mt-4">
                        <div class="text-3xl text-amber-400"><i class="fa-solid fa-folder"></i></div>
                        <div>
                            <h3 class="font-bold text-gray-800 text-lg group-hover:text-amber-600 transition truncate pr-10 leading-tight">${itemName}</h3>
                            <p class="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">Pasta</p>
                        </div>
                    </div>
                    
                    <div class="flex items-end justify-between mt-2 pl-1">
                        <div class="flex gap-4 opacity-70">
                            <div><span class="text-xl font-extrabold text-gray-600">${info.new}</span><span class="text-[9px] font-bold text-gray-400 uppercase block leading-none">Novos</span></div>
                            <div><span class="text-xl font-extrabold text-sky-600">${info.due}</span><span class="text-[9px] font-bold text-gray-400 uppercase block leading-none">Rev</span></div>
                        </div>
                        <div class="text-gray-300 text-sm"><i class="fa-solid fa-chevron-right"></i></div>
                    </div>
                </div>
            `;
        } else {
            const statusBorder = isDue ? 'border-l-4 border-l-sky-500' : 'border-l-4 border-l-gray-200';
            cardEl.className = `bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-lg transition flex flex-col justify-between h-48 group relative overflow-hidden ${statusBorder}`;
            
            cardEl.innerHTML = `
                <div class="deck-actions z-30">
                    <div class="drag-handle mr-2" title="Segure para arrastar"><i class="fa-solid fa-grip-vertical"></i></div>
                    <button class="btn-deck-action" onclick="window.openDeckConfig('${info.fullPath}', event)" title="Configurações"><i class="fa-solid fa-gear"></i></button>
                    <button class="btn-deck-action" onclick="window.renameDeck('${info.fullPath}', event)" title="Renomear"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-deck-action del" onclick="window.deleteDeck('${info.fullPath}', event)" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </div>
                
                <div onclick="window.checkAndStartSession('${info.fullPath}', ${totalDue})" class="cursor-pointer h-full flex flex-col justify-between">
                    <div class="mt-4">
                        <h3 class="font-bold text-gray-800 text-lg group-hover:text-sky-600 transition truncate pr-20">${itemName}</h3>
                        <p class="text-xs text-gray-400 font-bold uppercase mt-1">${info.total} Cartas</p>
                        <p class="text-[10px] text-gray-400 mt-1 italic">Visto por último: ${lastRevText}</p>
                    </div>
                    
                    <div class="flex items-end justify-between mt-2">
                        <div class="flex gap-4">
                            <div><span class="text-2xl font-extrabold text-green-500">${info.new}</span><span class="text-[10px] font-bold text-gray-400 uppercase block leading-none">Novos</span></div>
                            <div><span class="text-2xl font-extrabold text-sky-600">${info.due}</span><span class="text-[10px] font-bold text-gray-400 uppercase block leading-none">Revisão</span></div>
                        </div>
                        <div class="w-10 h-10 rounded-full ${isDue ? 'bg-sky-100 text-sky-600' : 'bg-gray-100 text-gray-300'} flex items-center justify-center shadow-sm"><i class="fa-solid fa-play ml-0.5"></i></div>
                    </div>
                </div>
            `;
        }
        container.appendChild(cardEl);
    });
}

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
    Object.keys(allCards).forEach(key => {
        const deck = allCards[key].deck || "";
        if (deck === prefix || deck.startsWith(prefix + "::")) {
            updates[`users/${currentUserUID}/anki/cards/${key}`] = null;
        }
    });

    try { await update(ref(db), updates); loadAnkiData(); } catch(e) { console.error(e); }
};

window.renameDeck = async function(oldName, ev) {
    ev.stopPropagation();
    const newName = prompt("Novo nome:", oldName);
    if (!newName || newName === oldName) return;
    const updates = {};
    Object.keys(allCards).forEach(key => {
        if (allCards[key].deck === oldName) updates[`users/${currentUserUID}/anki/cards/${key}/deck`] = newName;
    });
    try { await update(ref(db), updates); loadAnkiData(); } catch(e) { console.error(e); }
};

window.deleteDeck = async function(deckName, ev) {
    ev.stopPropagation();
    if (!confirm("Apagar baralho?")) return;
    const updates = {};
    Object.keys(allCards).forEach(key => {
        if (allCards[key].deck === deckName) updates[`users/${currentUserUID}/anki/cards/${key}`] = null;
    });
    try { await update(ref(db), updates); loadAnkiData(); } catch(e) { console.error(e); }
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

window.confirmFolderSelection = function() {
    const display = document.getElementById('displaySelectedFolder');
    const pathName = selectedCreateFolder === "" ? "Início" : selectedCreateFolder;
    display.innerHTML = `<i class="fa-solid fa-folder text-amber-400 mr-2"></i> <span>${pathName}</span>`;
    
    window.updateDeckSuggestions();
    window.closeFolderSelectionModal();
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

window.openCreateModal = function() {
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('modalTitleText').innerText = "Novo Flashcard";
    document.getElementById('inputCardId').value = ""; 
    
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
    if (fmt === 'cloze') {
        btnCloze.classList.remove('hidden'); lblFront.innerText = "Texto com Oclusão (Use o botão [...])"; lblBack.innerText = "Verso Extra (Opcional)"; backInput.setAttribute('placeholder', 'Deixe vazio para mostrar apenas a frase completa.');
    } else {
        btnCloze.classList.add('hidden'); lblFront.innerText = "Frente (Pergunta)"; lblBack.innerText = "Verso (Resposta)"; backInput.setAttribute('placeholder', 'A resposta...');
    }
};

window.saveCard = async function() {
    const id = document.getElementById('inputCardId').value;
    const deckNameSimple = document.getElementById('inputDeckNameNew').value.trim();
    
    if (!deckNameSimple) return alert("Digite o nome do Baralho.");
    
    const fullDeckPath = selectedCreateFolder === "" ? deckNameSimple : selectedCreateFolder + "::" + deckNameSimple;
    
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
    
    if (!front) return alert("Preencha a Frente do card.");
    
    const cardData = { deck: fullDeckPath, front, back, category, format, legalBasis: legal, link: link };
    
    try {
        if (id) { 
            // Atualização de card existente
            const existingCard = allCards[id] || {};
            // Preserva dados de revisão
            cardData.interval = existingCard.interval;
            cardData.ease = existingCard.ease;
            cardData.nextReview = existingCard.nextReview;
            cardData.lastReview = existingCard.lastReview;
            cardData.created = existingCard.created;
            cardData.lastRating = existingCard.lastRating;

            await update(ref(db, `users/${currentUserUID}/anki/cards/${id}`), cardData); 
            
            // ATUALIZAÇÃO INTELIGENTE (SEM RELOAD SE ESTIVER ESTUDANDO)
            const viewStudy = document.getElementById('viewStudy');
            if (viewStudy && !viewStudy.classList.contains('hidden')) {
                // Atualiza o card atual na memória e na fila
                allCards[id] = { ...existingCard, ...cardData };
                
                // Se o card editado for o atual da fila
                const currentQueueCard = studyQueue[currentCardIndex];
                if (currentQueueCard && currentQueueCard.firebaseKey === id) {
                    studyQueue[currentCardIndex] = { ...currentQueueCard, ...cardData };
                    showCurrentCard(); // Re-renderiza o card na tela
                }
                
                alert("Card atualizado!");
                window.closeCreateModal();
                return; // Sai da função aqui para não recarregar tudo
            } else {
                alert("Atualizado!"); 
            }
        } else { 
            // Novo card
            cardData.interval = 0; 
            cardData.ease = 2.5; 
            cardData.nextReview = Date.now(); 
            cardData.created = Date.now(); 
            await push(ref(db, `users/${currentUserUID}/anki/cards`), cardData); 
            alert("Criado!"); 
        }
        
        if (!id) { 
            document.getElementById('inputFront').innerHTML = ''; 
            document.getElementById('inputBack').innerHTML = ''; 
            document.getElementById('inputFront').focus(); 
        } else { 
            window.closeCreateModal(); 
        }
        
        // Recarrega tudo apenas se NÃO estiver no modo estudo
        loadAnkiData();
    } catch (e) { console.error(e); alert("Erro ao salvar."); }
};

// --- FUNÇÃO PARA EDITAR NO MEIO DO ESTUDO ---
window.editCurrentStudyCard = function(ev) {
    if(ev) ev.stopPropagation(); // Evita que o card vire

    if (!studyQueue || studyQueue.length === 0) return;
    const currentCard = studyQueue[currentCardIndex];
    if (!currentCard) return;

    window.editCard(currentCard.firebaseKey);
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

    if (newPath === currentDeckName) return alert("Destino igual origem.");

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

window.openDeckConfig = function(deckName, ev) {
    if(ev) ev.stopPropagation();
    currentDeckName = deckName;
    document.getElementById('deckConfigModal').classList.remove('hidden');
    document.getElementById('deckConfigTitle').innerText = `Config: ${deckName}`;
    document.getElementById('targetNameDisplay').innerText = deckName;
    window.switchConfigTab('settings'); 

    const defaults = { easyBonus: 3.5, easyBonusUnit: 'days', goodInterval: 2.5, goodIntervalUnit: 'days', hardInterval: 1.2, hardIntervalUnit: 'days' };
    const settings = deckSettings[deckName] || defaults;
    
    document.getElementById('cfgEasyBonus').value = settings.easyBonus || defaults.easyBonus;
    document.getElementById('cfgGoodInterval').value = settings.goodInterval || defaults.goodInterval;
    document.getElementById('cfgHardInterval').value = settings.hardInterval || defaults.hardInterval;
    document.getElementById('unitEasyBonus').value = settings.easyBonusUnit || 'days';
    document.getElementById('unitGoodInterval').value = settings.goodIntervalUnit || 'days';
    document.getElementById('unitHardInterval').value = settings.hardIntervalUnit || 'days';
};

window.closeDeckConfigModal = function() {
    document.getElementById('deckConfigModal').classList.add('hidden');
};

window.switchConfigTab = function(tabName) {
    const btns = document.querySelectorAll('#deckConfigModal .config-tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    
    ['tabSettingsView','tabHistoryView','tabRelocateView'].forEach(id => document.getElementById(id).classList.add('hidden'));

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
    }
};

window.saveDeckConfig = async function() {
    const easy = parseFloat(document.getElementById('cfgEasyBonus').value)||3.5;
    const easyUnit = document.getElementById('unitEasyBonus').value;
    const good = parseFloat(document.getElementById('cfgGoodInterval').value)||2.5;
    const goodUnit = document.getElementById('unitGoodInterval').value;
    const hard = parseFloat(document.getElementById('cfgHardInterval').value)||1.2;
    const hardUnit = document.getElementById('unitHardInterval').value;

    deckSettings[currentDeckName] = { 
        easyBonus: easy, easyBonusUnit: easyUnit,
        goodInterval: good, goodIntervalUnit: goodUnit,
        hardInterval: hard, hardIntervalUnit: hardUnit
    };

    try { 
        await set(ref(db, `users/${currentUserUID}/anki/settings`), deckSettings); 
        alert("Configurações salvas!"); 
        window.closeDeckConfigModal(); 
    } catch(e) { console.error(e); }
};

// --- HISTÓRICO ---

function renderDeckHistory() {
    const tbody = document.getElementById('deckHistoryBody');
    tbody.innerHTML = '';
    
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
        let nextRevStr = '-';
        if(card.nextReview) {
            const dNext = new Date(card.nextReview);
            nextRevStr = dNext.toLocaleDateString();
            if(card.nextReview <= Date.now()) nextRevStr = '<span class="text-red-500 font-bold text-xs">Agora</span>';
        }

        const frontText = card.front.replace(/<[^>]*>?/gm, '').substring(0, 40) + '...';
        const btnEdit = `<button onclick="window.editCardFromHistory('${card.firebaseKey || getCardKey(card)}')" class="text-sky-600 hover:text-sky-800 p-1 bg-sky-50 rounded"><i class="fa-solid fa-pen"></i></button>`;

        tr.innerHTML = `
            <td class="p-3 text-gray-700">${frontText}</td>
            <td class="p-3 text-center">${ratingBadge}<br><span class="text-[9px] text-gray-400">${dateStr}</span></td>
            <td class="p-3 text-center text-xs">${nextRevStr}</td>
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
};

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

    if (!studyQueue || studyQueue.length === 0) return alert("Não há cartas para revisar neste baralho agora.");

    currentCardIndex = 0;
    
    const mainHeader = document.getElementById('mainHeader');
    if(mainHeader) mainHeader.classList.add('hidden'); // ESCONDE O HEADER

    const viewDecks = document.getElementById('viewDecks');
    if(viewDecks) viewDecks.classList.add('hidden');
    
    const viewStudy = document.getElementById('viewStudy');
    if(viewStudy) viewStudy.classList.remove('hidden');
    
    const viewEmpty = document.getElementById('viewEmpty');
    if(viewEmpty) viewEmpty.classList.add('hidden');
    
    const btnNewFolder = document.getElementById('btnNewFolderHeader');
    if(btnNewFolder) btnNewFolder.classList.add('hidden');

    const titleEl = document.getElementById('deckTitleDisplay');
    if(titleEl) titleEl.innerText = deckName;

    showCurrentCard();
}

function formatTime(days) {
    if(days < 1) {
        const min = Math.round(days * 1440); 
        return min + " min";
    }
    return Math.round(days) + " dias";
}

function showCurrentCard() {
    if (!studyQueue || studyQueue.length === 0 || currentCardIndex >= studyQueue.length) {
        window.showDecksView();
        return; 
    }

    const card = studyQueue[currentCardIndex];
    if (!card) {
        studyQueue.splice(currentCardIndex, 1);
        showCurrentCard();
        return;
    }

    document.getElementById('studyCounter').innerText = `${studyQueue.length - currentCardIndex} restantes`;
    
    const container = document.getElementById('flashcardContainer');
    container.classList.remove('revealed'); 
    const controls = document.getElementById('studyControls');
    controls.classList.remove('opacity-100', 'pointer-events-auto');
    controls.classList.add('opacity-0', 'pointer-events-none');
    
    const defaults = { easyBonus: 3.5, easyBonusUnit: 'days', goodInterval: 2.5, goodIntervalUnit: 'days', hardInterval: 1.2, hardIntervalUnit: 'days' };
    const s = deckSettings[currentDeckName] || defaults;
    const currentInt = card.interval || 0;

    let tHard, tGood, tEasy;
    const tAgain = "1 min"; 

    if(s.hardIntervalUnit === 'minutes') tHard = formatTime(s.hardInterval / 1440);
    else tHard = formatTime(Math.max(1, currentInt * s.hardInterval));

    if(s.goodIntervalUnit === 'minutes') tGood = formatTime(s.goodInterval / 1440);
    else tGood = formatTime(Math.max(1, currentInt * s.goodInterval));

    if(s.easyBonusUnit === 'minutes') tEasy = formatTime(s.easyBonus / 1440);
    else tEasy = formatTime(Math.max(4, currentInt * s.easyBonus));

    document.getElementById('timeAgain').innerText = tAgain;
    document.getElementById('timeHard').innerText = tHard;
    document.getElementById('timeGood').innerText = tGood;
    document.getElementById('timeEasy').innerText = tEasy;

    setTimeout(() => {
        const safeFront = card.front || "(Sem texto na frente)";
        const safeBack = card.back || "";

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

window.revealCard = function() {
    const container = document.getElementById('flashcardContainer');
    if (!container.classList.contains('revealed')) {
        container.classList.add('revealed');
        setTimeout(() => {
            document.getElementById('studyControls').classList.remove('opacity-0', 'pointer-events-auto');
            document.getElementById('studyControls').classList.add('opacity-100', 'pointer-events-auto');
        }, 100);
    }
};

window.flipCard = window.revealCard;

window.rateCard = async function(rating) {
    const card = studyQueue[currentCardIndex];
    if(!card) {
        showCurrentCard();
        return;
    }

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    const defaults = { easyBonus: 3.5, easyBonusUnit: 'days', goodInterval: 2.5, goodIntervalUnit: 'days', hardInterval: 1.2, hardIntervalUnit: 'days' };
    const s = deckSettings[currentDeckName] || defaults;
    
    let nextInterval = 1, nextEase = card.ease || 2.5;

    if (rating === 'again') { 
        nextInterval = 0; 
        nextEase = Math.max(1.3, nextEase - 0.2); 
    }
    else if (rating === 'hard') { 
        if (s.hardIntervalUnit === 'minutes') nextInterval = s.hardInterval / 1440.0;
        else nextInterval = Math.max(1, (card.interval || 0) * s.hardInterval);
        nextEase = Math.max(1.3, nextEase - 0.15); 
    }
    else if (rating === 'good') { 
        if (s.goodIntervalUnit === 'minutes') nextInterval = s.goodInterval / 1440.0;
        else nextInterval = Math.max(1, (card.interval || 0) * s.goodInterval);
    }
    else if (rating === 'easy') { 
        if (s.easyBonusUnit === 'minutes') nextInterval = s.easyBonus / 1440.0;
        else nextInterval = Math.max(4, (card.interval || 0) * s.easyBonus);
        nextEase += 0.15; 
    }

    if (nextInterval < 0.0001 && rating !== 'again') nextInterval = 0.0007;

    const updates = {};
    updates[`users/${currentUserUID}/anki/cards/${card.firebaseKey}`] = {
        ...card, interval: nextInterval, ease: nextEase, nextReview: now + (nextInterval * oneDay), lastReview: now, lastRating: rating
    };

    try {
        await update(ref(db), updates);
        currentCardIndex++;
        showCurrentCard();
        
    } catch (e) { console.error(e); }
};

// --- IMPORT / EXPORT MANAGERS ---

window.openManagerModal = function() { 
    document.getElementById('managerModal').classList.remove('hidden'); 
    window.switchManagerTab('list'); 
};

window.closeManagerModal = function() { 
    document.getElementById('managerModal').classList.add('hidden'); 
};

window.switchManagerTab = function(tabName) {
    const btns = document.querySelectorAll('#managerModal .config-tab-btn');
    btns.forEach(b => b.classList.remove('active'));
    
    const list = document.getElementById('managerTabView_List');
    const io = document.getElementById('managerTabView_IO');
    
    if(tabName === 'list') {
        list.classList.remove('hidden');
        io.classList.add('hidden');
        btns[0].classList.add('active');
        window.renderManagerList();
    } else {
        list.classList.add('hidden');
        io.classList.remove('hidden');
        btns[1].classList.add('active');
        populateExportImportSelects();
    }
};

window.renderManagerList = function() {
    const tbody = document.getElementById('managerTableBody');
    const filterText = document.getElementById('managerSearch').value.toLowerCase();
    const filterDeck = document.getElementById('managerFilterDeck').value;
    tbody.innerHTML = '';
    
    if(document.getElementById('managerFilterDeck').options.length <= 1) {
        populateDeckSuggestions(); 
        const suggestions = new Set();
        Object.values(allCards).forEach(c => suggestions.add(c.deck));
        suggestions.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d; opt.text = d;
            document.getElementById('managerFilterDeck').appendChild(opt);
        });
    }

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
        if(card.imported) typeBadge += ' <span class="text-[9px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded font-bold ml-1" title="Importado"><i class="fa-solid fa-file-import"></i></span>';

        tr.innerHTML = `<td class="p-4 font-mono text-gray-400 text-xs">${index + 1}</td><td class="p-4">${typeBadge}</td><td class="p-4 font-bold text-gray-600 text-xs">${card.deck}</td><td class="p-4 text-gray-700">${previewFront}</td><td class="p-4 text-center"><button class="text-sky-600 hover:text-sky-800 mr-3" onclick="window.editCard('${card.id}')"><i class="fa-solid fa-pen"></i></button><button class="text-red-400 hover:text-red-600" onclick="window.deleteCard('${card.id}')"><i class="fa-solid fa-trash"></i></button></td>`;
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
    if(!deckName) return alert("Selecione um baralho para exportar.");
    const cardsToExport = Object.values(allCards).filter(c => c.deck === deckName).map(c => {
        const { interval, ease, nextReview, lastReview, lastRating, ...cleanCard } = c;
        cleanCard.exportedDate = new Date().toISOString();
        return cleanCard;
    });
    if(cardsToExport.length === 0) return alert("Baralho vazio.");
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

window.importDeckAction = function() {
    const input = document.getElementById('importFileInput');
    if(input.files.length === 0) return alert("Selecione um arquivo JSON primeiro.");
    
    const mode = document.querySelector('input[name="importMode"]:checked').value;
    let targetDeckName = "";
    if(mode === 'new') {
        targetDeckName = document.getElementById('importNewDeckName').value.trim();
        if(!targetDeckName) return alert("Digite o nome do novo baralho.");
    } else {
        targetDeckName = document.getElementById('importTargetDeck').value;
        if(!targetDeckName) return alert("Selecione o baralho existente.");
    }
    
    const file = input.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const importedCards = JSON.parse(e.target.result);
            if(!Array.isArray(importedCards)) throw new Error("Formato inválido.");
            
            let count = 0;
            const updates = {};
            const now = Date.now();
            
            importedCards.forEach(card => {
                if(!card.front || !card.back) return;
                const newKey = push(ref(db, `users/${currentUserUID}/anki/cards`)).key;
                const newCard = { 
                    ...card, deck: targetDeckName, imported: true, 
                    created: now, interval: 0, ease: 2.5, 
                    nextReview: now, lastReview: 0 
                };
                delete newCard.firebaseKey; 
                updates[`users/${currentUserUID}/anki/cards/${newKey}`] = newCard;
                count++;
            });
            
            if(count > 0) {
                await update(ref(db), updates);
                alert(`${count} cartões importados!`);
                loadAnkiData(); 
                window.closeManagerModal();
                input.value = '';
            } else { alert("Nenhum cartão válido."); }
        } catch(err) { console.error(err); alert("Erro ao importar: " + err.message); }
    };
    reader.readAsText(file);
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
    document.getElementById('inputCardFormat').value = card.format || 'basic';
    window.toggleFormatUI();
};

window.wrapCloze = function() { 
    const s=window.getSelection(); 
    if(!s.rangeCount)return; 
    const r=s.getRangeAt(0); 
    const t=r.toString(); 
    if(!t)return alert("Selecione texto."); 
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