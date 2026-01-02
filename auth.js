// auth.js
// Gerencia Login, Logout, Recuperação de Senha e Redirecionamento

import { auth } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged,
    sendPasswordResetEmail 
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
const forgotPassBtn = document.getElementById('forgotPassBtn');

// Variável para guardar o usuário atual
let currentUser = null;

// === 1. MONITORAMENTO DE ESTADO ===
onAuthStateChanged(auth, (user) => {
    
    // Remove o Loader
    if (loadingOverlay) loadingOverlay.style.display = 'none';

    if (user) {
        // --- USUÁRIO CONECTADO ---
        currentUser = user;
        console.log("Usuário conectado:", user.email);
        
        // Esconde telas de login/capa e mostra o sistema
        if (landingPage) landingPage.style.display = 'none';
        if (loginModal) {
            loginModal.classList.remove('active');
            loginModal.style.display = 'none';
        }
        if (appContent) appContent.style.display = 'flex'; 
        
        // Avisa outros scripts que o login terminou
        window.dispatchEvent(new CustomEvent('auth-ready', { detail: user }));
    } else {
        // --- USUÁRIO DESCONECTADO ---
        currentUser = null;
        console.log("Usuário desconectado");
        
        // Esconde o sistema
        if (appContent) appContent.style.display = 'none';
        
        // Lógica de Redirecionamento (Versão Raiz)
        if (landingPage) {
            // Se estamos na index.html, mostra a capa
            landingPage.style.display = 'flex'; 
        } else {
            // Se estamos em páginas internas (home, cronograma, etc), chuta para o login
            window.location.href = 'index.html';
        }
    }
});

// Ação do Botão Entrar
if(loginBtn) {
    loginBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const email = emailInput.value;
        const pass = passInput.value;

        try {
            // Tenta logar
            await signInWithEmailAndPassword(auth, email, pass);
            
            // --- REDIRECIONAMENTO ADICIONADO ---
            // Se der certo, manda para a Home
            window.location.href = 'home.html'; 
            
        } catch (error) {
            console.error("Erro login:", error);
            if(loginError) {
                if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                    loginError.textContent = "E-mail ou senha incorretos.";
                } else {
                    loginError.textContent = "Erro ao entrar. Tente novamente.";
                }
            }
        }
    });
}

// Atalho ENTER para logar (Também precisa redirecionar)
if(passInput) {
    passInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const email = emailInput.value;
            const pass = passInput.value;
            try {
                await signInWithEmailAndPassword(auth, email, pass);
                window.location.href = 'home.html'; // <--- Redireciona aqui também
            } catch (error) {
                // Tratamento de erro silencioso ou igual ao de cima
                console.error("Erro login (Enter):", error);
                if(loginError) loginError.textContent = "E-mail ou senha incorretos.";
            }
        }
    });
}

// === 3. RECUPERAR SENHA ===
if (forgotPassBtn) {
    forgotPassBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        // Pega o email digitado ou pede num prompt
        let email = emailInput.value.trim();
        
        if (!email) {
            email = prompt("Por favor, digite seu e-mail para redefinir a senha:");
        }

        if (!email) return;

        try {
            await sendPasswordResetEmail(auth, email);
            alert(`Um e-mail de redefinição de senha foi enviado para: ${email}.\n\nVerifique sua caixa de entrada (e spam).`);
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

// === 4. AÇÃO DE LOGOUT (Delegação de Eventos) ===
document.addEventListener('click', (e) => {
    // Procura o botão de logout mesmo que criado dinamicamente
    const btn = e.target.closest('#btnLogout');
    
    if (btn) {
        e.preventDefault();
        if(confirm("Deseja realmente sair?")) {
            signOut(auth).then(() => {
                console.log("Deslogado com sucesso.");
                // O onAuthStateChanged vai cuidar do redirecionamento
            }).catch((error) => {
                console.error("Erro ao sair:", error);
            });
        }
    }
});

// === 5. ATALHO: ENTER PARA LOGAR ===
if (passInput && loginBtn) {
    passInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });
}

export { currentUser };