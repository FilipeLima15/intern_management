import { auth } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. Pegar elementos da tela (HTML)
const loginForm = document.getElementById('form-login');
const emailInput = document.getElementById('email');
const passInput = document.getElementById('password');
const errorMsg = document.getElementById('login-error');
const btnLogout = document.getElementById('btn-logout');
const userEmailSpan = document.getElementById('user-email');

// Elementos das Telas Principais
const loginContainer = document.getElementById('app-login');
const dashboardContainer = document.getElementById('app-dashboard');

// 2. MONITOR DE ESTADO: O Firebase avisa se o usuário está logado ou não
onAuthStateChanged(auth, (user) => {
    if (user) {
        // --- USUÁRIO LOGADO ---
        console.log("Login confirmado:", user.email);
        
        // Esconde tela de login e mostra o painel
        loginContainer.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
        
        // Atualiza o email no menu lateral
        userEmailSpan.textContent = user.email;
    } else {
        // --- USUÁRIO DESLOGADO ---
        console.log("Nenhum usuário logado.");
        
        // Mostra tela de login e esconde o painel
        loginContainer.classList.remove('hidden');
        dashboardContainer.classList.add('hidden');
    }
});

// 3. AÇÃO DE ENTRAR (Submit do formulário)
loginForm.addEventListener('submit', (e) => {
    e.preventDefault(); // Evita que a página recarregue sozinha
    
    const email = emailInput.value;
    const senha = passInput.value;

    errorMsg.textContent = "Verificando...";

    // Pede ao Firebase para logar
    signInWithEmailAndPassword(auth, email, senha)
        .then((userCredential) => {
            // Sucesso! O bloco 'onAuthStateChanged' acima fará a troca de tela
            errorMsg.textContent = "";
        })
        .catch((error) => {
            // Erro (Senha errada, usuário não existe, etc)
            console.error("Erro Firebase:", error.code);
            
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
                errorMsg.textContent = "E-mail ou senha incorretos.";
            } else if (error.code === 'auth/too-many-requests') {
                errorMsg.textContent = "Muitas tentativas. Tente mais tarde.";
            } else {
                errorMsg.textContent = "Erro ao entrar. Verifique o console.";
            }
        });
});

// 4. AÇÃO DE SAIR (Logout)
btnLogout.addEventListener('click', () => {
    signOut(auth).then(() => {
        // O 'onAuthStateChanged' vai detectar a saída e mostrar a tela de login
    }).catch((error) => {
        console.error("Erro ao sair:", error);
    });
});