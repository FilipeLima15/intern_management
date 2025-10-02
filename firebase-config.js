/* firebase-config.js - Configuração e inicialização do Firebase */

// Cole suas credenciais do Firebase aqui.
const firebaseConfig = {
apiKey: "AIzaSyDyKpb3zufuwHg-ZhXtoVNkds-JnPykg0s",
authDomain: "estagiario-sistema.firebaseapp.com",
databaseURL: "https://estagiario-sistema-default-rtdb.firebaseio.com",
projectId: "estagiario-sistema",
storageBucket: "estagiario-sistema.firebasestorage.app",
messagingSenderId: "155914973061",
appId: "1:155914973061:web:fc8c3cb9f4270a77dc9eec"
};

// Inicializa o Firebase
const app = firebase.initializeApp(firebaseConfig);

// Exporta a instância do database para ser usada no app principal
export const database = firebase.database();

// Autenticação anônima para proteger o banco de dados
export async function initAuth() {
    try {
        const auth = firebase.auth();
        
        // Verifica se já está autenticado
        if (!auth.currentUser) {
            // Faz login anônimo automaticamente
            await auth.signInAnonymously();
            console.log('Autenticação anônima realizada com sucesso');
        }
        
        return true;
    } catch (error) {
        console.error('Erro na autenticação:', error);
        return false;
    }
}