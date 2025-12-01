// Importando do Google (Versão Web/CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Suas configurações (Copiadas do que você me mandou)
const firebaseConfig = {
  apiKey: "AIzaSyBZEqQuMRMGXli4nQhn9WTBEYoIUgOvxzM",
  authDomain: "projeto-fadc7.firebaseapp.com",
  databaseURL: "https://projeto-fadc7-default-rtdb.firebaseio.com",
  projectId: "projeto-fadc7",
  storageBucket: "projeto-fadc7.firebasestorage.app",
  messagingSenderId: "384434888132",
  appId: "1:384434888132:web:8b173438b27625d7939891",
  measurementId: "G-8T2S7N1JSE"
};

// 1. Inicializa o aplicativo Firebase
const app = initializeApp(firebaseConfig);

// 2. Inicializa o serviço de Autenticação (Login)
const auth = getAuth(app);

// 3. Inicializa o Banco de Dados (Firestore)
const db = getFirestore(app);

// Exporta para ser usado nos outros arquivos
export { auth, db };