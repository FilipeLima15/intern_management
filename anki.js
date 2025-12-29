// anki.js - Sistema SRS (Spaced Repetition System)
import { db, auth } from "./firebase-config.js";
import { ref, set, get, update, push, remove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- ESTADO GLOBAL ---
let currentUserUID = null;
let allCards = {}; // Todos os cards baixados
let studyQueue = []; // Fila de estudo atual
let currentCardIndex = 0;
let currentDeckName = null;

// --- INICIALIZAÇÃO ---
console.log("🧠 Iniciando Anki System...");

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUID = user.uid;
        loadAnkiData();
    } else {
        window.location.href = 'index.html';
    }
});

// --- FUNÇÕES DE DADOS (FIREBASE) ---

async function loadAnkiData() {
    const dbRef = ref(db, `users/${currentUserUID}/anki/cards`);
    try {
        const snapshot = await get(dbRef);
        if (snapshot.exists()) {
            allCards = snapshot.val();
        } else {
            allCards = {};
        }
        renderDecksView();
        populateDeckSuggestions();
    } catch (error) {
        console.error("Erro ao carregar cards:", error);
    }
}

// --- FUNÇÕES DE UI (VIEWS) ---

window.showDecksView = function() {
    document.getElementById('viewStudy').classList.add('hidden');
    document.getElementById('viewEmpty').classList.add('hidden');
    document.getElementById('viewDecks').classList.remove('hidden');
    document.getElementById('btnBackToDecks').classList.add('hidden');
    loadAnkiData(); // Recarrega para atualizar contadores
};

function renderDecksView() {
    const container = document.getElementById('viewDecks');
    container.innerHTML = '';

    // Agrupar cards por Baralho
    const decks = {};
    const now = Date.now();

    Object.keys(allCards).forEach(key => {
        const card = allCards[key];
        const deckName = card.deck || 'Geral';
        
        if (!decks[deckName]) decks[deckName] = { total: 0, due: 0 };
        
        decks[deckName].total++;
        if (card.nextReview <= now) {
            decks[deckName].due++;
        }
    });

    // Se não tiver decks
    if (Object.keys(decks).length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 opacity-60">
                <i class="fa-solid fa-layer-group text-6xl mb-4"></i>
                <p>Nenhum baralho criado.</p>
                <p class="text-sm">Clique em "Novo Card" para começar.</p>
            </div>
        `;
        return;
    }

    // Renderizar Cards dos Decks
    Object.keys(decks).sort().forEach(deckName => {
        const info = decks[deckName];
        const isDue = info.due > 0;
        
        const cardHTML = document.createElement('div');
        cardHTML.className = `bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg transition cursor-pointer flex flex-col justify-between h-40 group relative overflow-hidden`;
        
        // Efeito visual se tiver revisão pendente
        const statusBorder = isDue ? 'border-l-4 border-l-sky-500' : 'border-l-4 border-l-gray-200';
        cardHTML.className += ` ${statusBorder}`;

        cardHTML.onclick = () => startStudySession(deckName);

        cardHTML.innerHTML = `
            <div>
                <h3 class="font-bold text-gray-800 text-lg group-hover:text-sky-600 transition">${deckName}</h3>
                <p class="text-xs text-gray-400 font-bold uppercase mt-1">${info.total} Cartas</p>
            </div>
            
            <div class="flex items-end justify-between mt-4">
                <div>
                    <span class="text-3xl font-extrabold ${isDue ? 'text-sky-600' : 'text-gray-300'}">${info.due}</span>
                    <span class="text-xs font-bold text-gray-400 uppercase ml-1">Para Revisar</span>
                </div>
                <div class="w-8 h-8 rounded-full ${isDue ? 'bg-sky-100 text-sky-600' : 'bg-gray-100 text-gray-300'} flex items-center justify-center">
                    <i class="fa-solid fa-play ml-0.5"></i>
                </div>
            </div>
        `;
        container.appendChild(cardHTML);
    });
}

function populateDeckSuggestions() {
    const datalist = document.getElementById('deckSuggestions');
    datalist.innerHTML = '';
    const decks = new Set();
    Object.values(allCards).forEach(c => decks.add(c.deck));
    decks.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        datalist.appendChild(opt);
    });
}

// --- LÓGICA DE ESTUDO ---

function startStudySession(deckName) {
    currentDeckName = deckName;
    const now = Date.now();
    
    // Filtrar cards do deck que estão vencidos (nextReview <= now)
    studyQueue = Object.keys(allCards)
        .filter(key => {
            const card = allCards[key];
            return card.deck === deckName && card.nextReview <= now;
        })
        .map(key => ({ ...allCards[key], firebaseKey: key })); // Adiciona a chave para salvar depois

    // Embaralhar levemente para não ficar viciado na ordem de criação
    studyQueue.sort(() => Math.random() - 0.5);

    if (studyQueue.length === 0) {
        alert("Tudo em dia! Nenhuma revisão pendente para este baralho.");
        return;
    }

    currentCardIndex = 0;
    
    // Mudar telas
    document.getElementById('viewDecks').classList.add('hidden');
    document.getElementById('viewEmpty').classList.add('hidden');
    document.getElementById('viewStudy').classList.remove('hidden');
    document.getElementById('btnBackToDecks').classList.remove('hidden');
    document.getElementById('deckTitleDisplay').innerText = deckName;

    showCurrentCard();
}

function showCurrentCard() {
    const card = studyQueue[currentCardIndex];
    const counter = document.getElementById('studyCounter');
    counter.innerText = `${studyQueue.length - currentCardIndex} restantes`;

    // Resetar Flip
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.remove('flipped');
    
    // Esconder Controles
    const controls = document.getElementById('studyControls');
    controls.classList.remove('opacity-100', 'pointer-events-auto');
    controls.classList.add('opacity-0', 'pointer-events-none');

    // Preencher Texto (com pequeno delay para não ver a troca)
    setTimeout(() => {
        document.getElementById('cardFrontText').innerText = card.front;
        document.getElementById('cardBackText').innerText = card.back;
    }, 200);
}

window.flipCard = function() {
    const flashcard = document.getElementById('flashcard');
    const controls = document.getElementById('studyControls');
    
    if (!flashcard.classList.contains('flipped')) {
        flashcard.classList.add('flipped');
        // Mostrar botões de resposta
        setTimeout(() => {
            controls.classList.remove('opacity-0', 'pointer-events-none');
            controls.classList.add('opacity-100', 'pointer-events-auto');
        }, 300);
    }
};

// --- O ALGORITMO SM-2 SIMPLIFICADO ---

window.rateCard = async function(rating) {
    const card = studyQueue[currentCardIndex];
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    let nextInterval = 1; // Dias
    let nextEase = card.ease || 2.5; // Fator multiplicador

    // Lógica do Algoritmo
    if (rating === 'again') {
        // Errou: Reseta intervalo, mantém ease, joga pro final da fila de hoje? 
        // No Anki real, 'Again' em learning steps é minutos. Aqui vamos simplificar:
        // Se errou, volta amanhã (intervalo 0 ou 1) e reduz ease.
        nextInterval = 0; // 0 significa "Revisar Agora/Amanhã cedo"
        nextEase = Math.max(1.3, nextEase - 0.2);
    } else if (rating === 'hard') {
        nextInterval = Math.max(1, (card.interval || 0) * 1.2);
        nextEase = Math.max(1.3, nextEase - 0.15);
    } else if (rating === 'good') {
        nextInterval = Math.max(1, (card.interval || 0) * 2.5);
        // Ease mantém
    } else if (rating === 'easy') {
        nextInterval = Math.max(4, (card.interval || 0) * 3.5); // Bônus maior
        nextEase += 0.15;
    }

    // Arredondar dias
    nextInterval = Math.round(nextInterval);
    if (nextInterval < 1) nextInterval = 1; // Mínimo 1 dia para simplificar UX

    // Calcular data da próxima revisão
    const nextReviewDate = now + (nextInterval * oneDay);

    // Atualizar no Firebase
    const updates = {};
    updates[`users/${currentUserUID}/anki/cards/${card.firebaseKey}`] = {
        ...card, // Mantém frente/verso/deck
        interval: nextInterval,
        ease: nextEase,
        nextReview: nextReviewDate,
        lastReview: now
    };

    try {
        await update(ref(db), updates);
        
        // Próximo Card
        currentCardIndex++;
        if (currentCardIndex < studyQueue.length) {
            showCurrentCard();
        } else {
            // Fim do Baralho
            document.getElementById('viewStudy').classList.add('hidden');
            document.getElementById('viewEmpty').classList.remove('hidden');
            // Recarrega dados globais
            loadAnkiData();
        }

    } catch (e) {
        console.error("Erro ao salvar revisão:", e);
        alert("Erro ao salvar progresso.");
    }
};

// --- FUNÇÕES DE CRIAÇÃO (MODAL) ---

window.openCreateModal = function() {
    document.getElementById('createModal').classList.remove('hidden');
    document.getElementById('inputDeckName').value = currentDeckName || '';
    document.getElementById('inputFront').value = '';
    document.getElementById('inputBack').value = '';
    document.getElementById('inputFront').focus();
};

window.closeCreateModal = function() {
    document.getElementById('createModal').classList.add('hidden');
};

window.saveNewCard = async function() {
    const deck = document.getElementById('inputDeckName').value.trim();
    const front = document.getElementById('inputFront').value.trim();
    const back = document.getElementById('inputBack').value.trim();

    if (!deck || !front || !back) return alert("Preencha todos os campos.");

    const newCard = {
        deck: deck,
        front: front,
        back: back,
        interval: 0,
        ease: 2.5,
        nextReview: Date.now(), // Já nasce disponível para estudar
        created: Date.now()
    };

    try {
        const newCardRef = push(ref(db, `users/${currentUserUID}/anki/cards`));
        await set(newCardRef, newCard);
        
        alert("Card criado!");
        document.getElementById('inputFront').value = '';
        document.getElementById('inputBack').value = '';
        document.getElementById('inputFront').focus(); // Foco para criar o próximo rápido
        
        loadAnkiData(); // Atualiza fundo
    } catch (e) {
        console.error(e);
        alert("Erro ao criar.");
    }
};

// Logout handler (se precisar, mas o menu.js já deve tratar)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('#btnLogout');
    if (btn) {
        e.preventDefault();
        if(confirm("Sair?")) signOut(auth).then(()=>window.location.href='index.html');
    }
});