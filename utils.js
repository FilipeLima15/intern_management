/* utils.js - Funções utilitárias */

// Exportamos cada função para que outros arquivos possam usá-las
export function uuid() { 
  return 'id-' + Math.random().toString(36).slice(2, 9); 
}

export function nowISO() { 
  return new Date().toISOString().slice(0, 10); 
}

export function timestamp() { 
  return new Date().toISOString(); 
}

export function escapeHtml(s) { 
  return String(s || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); 
}

// Função para download de blob (agora movida para o contexto do Manager)
// A função downloadBlob foi mantida no app.js por enquanto, pois ela é específica do contexto do Manager.
// Se quisermos movê-la depois para um utils de UI, podemos fazer isso.

// Novo helper para formatar a data (dd/mm/aaaa)
export function formatDate(isoString) {
    if (!isoString) return new Date().toLocaleDateString('pt-BR');
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('pt-BR');
    } catch (e) {
        return new Date().toLocaleDateString('pt-BR');
    }
}