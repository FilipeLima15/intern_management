/* app.js - Arquivo Principal da Aplicação (Orquestrador) */

// ------------------- IMPORTAÇÕES DOS MÓDulos -------------------
import { database, initAuth } from './firebase-config.js';
import { uuid, nowISO, timestamp, escapeHtml, formatDate } from './utils.js';
import { showModal, showForgotPasswordModal, showPreRegistrationModal } from './ui-modals.js';
import { renderIntern } from './view-intern.js';
import { renderManager, cleanupRejectedRegistrations } from './view-manager.js';

// ------------------- ESTADO E VARIÁVEIS GLOBAIS -------------------
export let state = null;
export let session = null;
const root = document.getElementById('root');

// ------------------- FUNÇÕES GLOBAIS EXPORTADAS -------------------
export {
    findUserByIntern,
    findInternById,
    hasPower,
    downloadBlob,
    render,
    defaultPowersFor
};

export async function save(stateObj) {
    if (!stateObj || typeof stateObj !== 'object') {
        console.warn('Recusando salvar estado inválido:', stateObj);
        return false;
    }
    try {
        await database.ref('/appState').set(stateObj);
        return true;
    } catch (e) {
        console.error("Erro ao salvar dados no Firebase:", e);
        return false;
    }
}

function downloadBlob(txt, filename, mimeType = 'application/json') {
    const blob = new Blob([txt], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function defaultPowersFor(role) {
    if (role === 'super') return { create_intern: true, edit_user: true, delete_user: true, reset_password: true, delegate_admins: true, manage_hours: true, manage_provas: true };
    if (role === 'admin') return { create_intern: true, edit_user: true, delete_user: true, reset_password: true, delegate_admins: false, manage_hours: true, manage_provas: false };
    return { manage_hours: false, manage_provas: false };
}

// Objeto padrão para os dados cadastrais do estagiário
const defaultRegistrationData = {
    fullName: '',
    cpf: '',
    birthDate: '',
    mainPhone: '',
    altPhone: '',
    address: '',
    instEmail: '',
    enrollmentId: '',
    internshipHours: '',
    internshipStartDate: '',
    emergencyContactName: '',
    emergencyContactRelation: '',
    emergencyContactPhone: '',
    emergencyContactWhatsapp: 'nao',
    university: '',
    universityOther: '',
    currentSemester: '',
    lastUpdatedAt: null
};

// ----------------- CARREGAMENTO E DADOS INICIAIS -----------------
function sampleData() {
    const now = timestamp();
    const interns = [{ id: 'intern-1', name: `Estagiário 1`, dates: [], hoursEntries: [], auditLog: [], registrationData: { ...defaultRegistrationData } }];
    const users = [
        { id: uuid(), username: 'admin', name: 'Administrador Principal', password: '', role: 'super', powers: defaultPowersFor('super'), selfPasswordChange: true, createdAt: now },
        { id: uuid(), username: 'est1', password: '123456', role: 'intern', internId: 'intern-1', powers: defaultPowersFor('intern'), selfPasswordChange: true, createdAt: now }
    ];
    return { users, interns, meta: { created: now, provaBlockDays: 0, trashRetentionDays: 10 }, pendingRegistrations: [], trash: [], systemLog: [], loginLog: [] };
}

async function load() {
    try {
        const snapshot = await database.ref('/appState').once('value');
        const data = snapshot.val();
        if (!data) {
            return { users: [], interns: [], meta: { created: timestamp(), provaBlockDays: 0, trashRetentionDays: 10 }, pendingRegistrations: [], trash: [], systemLog: [], loginLog: [] };
        }
        const parsed = data;
        parsed.meta = parsed.meta || {};
        parsed.interns = (parsed.interns || []).map(i => ({ 
            ...{ dates: [], hoursEntries: [], auditLog: [] }, 
            ...i,
            registrationData: { ...defaultRegistrationData, ...(i.registrationData || {}) }
        }));
        parsed.pendingRegistrations = parsed.pendingRegistrations || [];
        parsed.trash = parsed.trash || [];
        parsed.systemLog = parsed.systemLog || [];
        parsed.loginLog = parsed.loginLog || []; // NOVO: Garante que o log de login exista
        parsed.users = (parsed.users || []).map(u => ({
            id: u.id || uuid(),
            ...u,
            powers: u.powers || defaultPowersFor(u.role || 'intern'),
        }));
        return parsed;
    } catch (e) {
        console.error("Erro ao carregar dados do Firebase:", e);
        return { users: [], interns: [], meta: { created: timestamp(), provaBlockDays: 0, trashRetentionDays: 10 }, pendingRegistrations: [], trash: [], systemLog: [], loginLog: [] };
    }
}

// ----------------- LÓGICA PRINCIPAL DA APLICAÇÃO -----------------
async function initApp() {
    root.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;"><h2>Inicializando aplicação...</h2></div>';
    
    const authSuccess = await initAuth();
    
    if (!authSuccess) {
        root.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;min-height:100vh;flex-direction:column;gap:20px;"><h2 style="color:var(--danger);">Erro na autenticação</h2><p>Não foi possível conectar ao Firebase. Verifique sua conexão.</p></div>';
        return;
    }

    const savedSession = sessionStorage.getItem('app_session');
    if (savedSession) {
        try { session = JSON.parse(savedSession); } catch (e) { session = null; }
    }

    state = await load();

    if ((state.users || []).length === 0) {
        state = sampleData();
        const adminUser = state.users.find(u => u.role === 'super');
        if (adminUser) {
            adminUser.password = 'default_init_pass_12345';
        }
        await save(state);
    }

    render();
    cleanupRejectedRegistrations();
}

function findUserByIntern(internId) { return state.users.find(u => u.internId === internId); }
function findInternById(id) { return (state.interns || []).find(i => i.id === id); }
function hasPower(user, power) {
    if (!user) return false;
    if (user.role === 'super') return true;

    if (user.delegatedAdmin?.enabled && session.viewMode === 'admin') {
        return !!(user.delegatedAdmin.powers && user.delegatedAdmin.powers[power]);
    }

    return !!(user.powers && user.powers[power]);
}

window.logout = () => {
    session = null;
    sessionStorage.removeItem('app_session');
    render();
};

// ----------------- ROTEADOR DE RENDERIZAÇÃO -----------------
function render() {
    if (!state) {
        root.innerHTML = '<h2>Carregando...</h2>';
        return;
    }
    if (!session) {
        return renderLogin();
    }
    const user = (state.users || []).find(u => u.id === session.userId);
    if (!user) {
        window.logout();
        return;
    }

    if (user.role === 'intern') {
        if (user.delegatedAdmin?.enabled && session.viewMode === 'admin') {
            renderManager(user, true);
        } else {
            session.viewMode = 'intern';
            renderIntern(user);
        }
    } else {
        renderManager(user);
    }
}

// ----------------- TELA DE LOGIN -----------------
function renderLogin() {
    root.innerHTML = '';
    root.className = 'login-screen';
    const card = document.createElement('div'); card.className = 'login-card';
    card.innerHTML = `
    <h2>Entrar</h2>
    <div class="login-input-group">
      <input id="inpUser" placeholder="Usuário" class="input-modern" />
      <div class="password-wrapper">
        <input id="inpPass" placeholder="Senha" type="password" class="input-modern" />
        <span class="password-toggle-icon" id="toggleLoginPass">🔒</span>
      </div>

      <div class="form-check" style="justify-content: flex-start; margin-top: 5px;">
          <input type="checkbox" id="rememberMeCheckbox" style="width: auto; height: auto;">
          <label for="rememberMeCheckbox" style="font-size: 14px; color: var(--muted); cursor: pointer;">Lembrar-me</label>
      </div>
      
      <div class="login-buttons">
        <button class="button" id="btnLogin">Entrar</button>
        <button class="button ghost" id="btnNewUserLogin">Novo usuário</button>
        <button class="button ghost small" id="btnForgotPass">Esqueci a senha</button>
      </div>
    </div>
  `;
    root.appendChild(card);

    document.getElementById('btnLogin').addEventListener('click', async () => {
        const u = document.getElementById('inpUser').value.trim();
        const p = document.getElementById('inpPass').value;
        const rememberMe = document.getElementById('rememberMeCheckbox').checked;
        const user = (state.users || []).find(x => x.username === u && x.password === p);
        
        if (!user) return alert('Usuário ou senha inválidos');

        if (rememberMe) {
            localStorage.setItem('rememberedUser', u);
        } else {
            localStorage.removeItem('rememberedUser');
        }

        // NOVO: Lógica para registrar o login
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            const ip = data.ip;

            state.loginLog = state.loginLog || [];
            state.loginLog.push({
                id: uuid(),
                userId: user.id,
                username: user.username,
                name: user.name || (findInternById(user.internId) || {}).name || 'N/A',
                at: timestamp(),
                ip: ip
            });
            await save(state); // Salva o estado com o novo registro de login

        } catch (error) {
            console.error("Não foi possível obter o IP. Registrando login sem IP.", error);
            state.loginLog.push({
                id: uuid(),
                userId: user.id,
                username: user.username,
                name: user.name || (findInternById(user.internId) || {}).name || 'N/A',
                at: timestamp(),
                ip: 'IP não obtido'
            });
            await save(state);
        }

        session = { userId: user.id };
        sessionStorage.setItem('app_session', JSON.stringify(session));
        root.className = 'app';
        render();
    });

    document.getElementById('btnNewUserLogin').addEventListener('click', showPreRegistrationModal);
    document.getElementById('btnForgotPass').addEventListener('click', showForgotPasswordModal);

    const toggleLoginPass = document.getElementById('toggleLoginPass');
    toggleLoginPass.addEventListener('click', () => {
        const inpPass = document.getElementById('inpPass');
        const type = inpPass.getAttribute('type') === 'password' ? 'text' : 'password';
        inpPass.setAttribute('type', type);
        toggleLoginPass.textContent = type === 'password' ? '🔒' : '🔓';
    });

    const rememberedUser = localStorage.getItem('rememberedUser');
    if (rememberedUser) {
        document.getElementById('inpUser').value = rememberedUser;
        document.getElementById('rememberMeCheckbox').checked = true;
        document.getElementById('inpPass').focus();
    }
}

// ------------------- INICIALIZAÇÃO DA APLICAÇÃO -------------------
initApp();
