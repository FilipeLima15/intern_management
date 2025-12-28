// auth.js
// Gerencia Login, Logout e Recuperação de Senha

import { auth } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    sendPasswordResetEmail // <--- IMPORTANTE: Nova importação
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Elementos da Interface
const loadingOverlay = document.getElementById('loadingOverlay');
const landingPage = document.getElementById('landingPage');
const loginModal = document.getElementById('loginModal');
const appContent = document.getElementById('appContent');

const emailInput = document.getElementById('loginEmail');
const passInput = document.getElementById('loginPass');
const loginBtn = document.getElementById('btnLogin');
const loginError = document.getElementById('loginError');
const forgotPassBtn = document.getElementById('forgotPassBtn'); // <--- Novo seletor

// Variável para guardar o usuário atual
let currentUser = null;

// === MONITORAMENTO DE ESTADO ===
onAuthStateChanged(auth, (user) => {
    
    if (loadingOverlay) loadingOverlay.style.display = 'none';

    if (user) {
        // USUÁRIO CONECTADO
        currentUser = user;
        console.log("Usuário conectado:", user.email);
        
        if (landingPage) landingPage.style.display = 'none';
        if (loginModal) {
            loginModal.classList.remove('active');
            loginModal.style.display = 'none';
        }
        if (appContent) appContent.style.display = 'flex'; 
        
        window.dispatchEvent(new CustomEvent('auth-ready', { detail: user }));
    } else {
        // USUÁRIO DESCONECTADO
        currentUser = null;
        console.log("Usuário desconectado");
        
        if (appContent) appContent.style.display = 'none';
        
        if (landingPage) {
            landingPage.style.display = 'flex';
        } else {
            const inSubfolder = window.location.pathname.includes('/outros/');
            const targetPage = inSubfolder ? 'index.html' : 'outros/index.html';
            window.location.href = targetPage;
        }
    }
});

// === AÇÃO DE LOGIN ===
if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value;
        const pass = passInput.value;
        
        if (!email || !pass) {
            loginError.textContent = "Preencha e-mail e senha.";
            return;
        }

        loginError.textContent = ""; // Limpa erros anteriores
        const originalBtnText = loginBtn.innerHTML;
        loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verificando...';
        
        try {
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (error) {
            loginBtn.innerHTML = originalBtnText;
            console.error("Erro login:", error);
            if(error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                loginError.textContent = "E-mail ou senha incorretos.";
            } else if (error.code === 'auth/too-many-requests') {
                loginError.textContent = "Muitas tentativas. Aguarde um pouco.";
            } else {
                loginError.textContent = "Erro: " + error.message;
            }
        }
    });
}

// === NOVA FUNÇÃO: RECUPERAR SENHA ===
if (forgotPassBtn) {
    forgotPassBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        // 1. Tenta pegar o email do campo de input, se estiver vazio, pede via prompt
        let email = emailInput.value.trim();
        
        if (!email) {
            email = prompt("Por favor, digite seu e-mail para redefinir a senha:");
        }

        if (!email) return; // Se a pessoa cancelou ou não digitou nada

        try {
            // 2. Envia o email usando Firebase
            await sendPasswordResetEmail(auth, email);
            
            // 3. Feedback visual
            alert(`Um e-mail de redefinição de senha foi enviado para: ${email}.\n\nVerifique sua caixa de entrada (e spam).`);
            
            // Opcional: Limpar erro se houver
            if(loginError) loginError.textContent = "";
            
        } catch (error) {
            console.error("Erro reset senha:", error);
            if (error.code === 'auth/user-not-found') {
                alert("Este e-mail não está cadastrado no sistema.");
            } else if (error.code === 'auth/invalid-email') {
                alert("O formato do e-mail é inválido.");
            } else {
                alert("Erro ao enviar e-mail: " + error.message);
            }
        }
    });
}

// === AÇÃO DE LOGOUT ===
document.addEventListener('click', (e) => {
    const btn = e.target.closest('#btnLogout');
    
    if (btn) {
        e.preventDefault();
        if(confirm("Deseja realmente sair?")) {
            signOut(auth).then(() => {
                console.log("Deslogado com sucesso.");
            }).catch((error) => {
                console.error("Erro ao sair:", error);
            });
        }
    }
});

// === ATALHO: ENTER PARA LOGAR ===
if (passInput && loginBtn) {
    passInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });
}

export { currentUser };