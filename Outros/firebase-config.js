// firebase-config.js
// Configuração central do Firebase usando CDN (não precisa instalar nada)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBYtjtMWDSTd46fRWw0xwPym3DBVeDUn4Q",
  authDomain: "cronograma-c93df.firebaseapp.com",
  projectId: "cronograma-c93df",
  storageBucket: "cronograma-c93df.firebasestorage.app",
  messagingSenderId: "544306902746",
  appId: "1:544306902746:web:d4d76b0df9542edbb157e3",
  measurementId: "G-ZRWPG9SBK1"
};

// Inicializa os serviços
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Exporta para ser usado nos outros arquivos
export { auth, db };