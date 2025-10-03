/* ui-modals.js - Funções para criação de modais */

import { uuid, timestamp } from './utils.js';

// --- ATENÇÃO ---
// Para que os modais funcionem, eles precisam de acesso a algumas funções e variáveis
// do arquivo principal (app.js). Por isso, vamos importá-los aqui.
// Esta é uma etapa comum durante a refatoração.
import { state, session, save, render } from './app.js';


// Função genérica para criar um modal
export function showModal(innerHtml, options = {}) {
    const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div'); modal.className = 'modal';
    modal.innerHTML = innerHtml;
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    function close() { if (backdrop.parentNode) backdrop.remove(); if (options.onClose) options.onClose(); }
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop && options.allowBackdropClose !== false) close(); });
    return { backdrop, modal, close, cleanup: () => { document.removeEventListener('keydown', onKey); } };
}

// Modal "Esqueci a senha"
export function showForgotPasswordModal() {
    const html = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0;">Redefinição de Senha</h3>
            <p>Prezado(a), tendo em vista que esqueceu a senha, entre em contato com 
            <strong style="text-decoration: underline;">supervisor</strong> do setor e peça para ele redefinir.</p>
            <div style="display:flex;justify-content:flex-end;margin-top: 15px;">
                <button class="button" id="btnUnderstood">Entendido</button>
            </div>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: true });

    // Configura o evento para fechar o modal
    m.modal.querySelector('#btnUnderstood').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });
}

// Modal "Folga Bloqueada"
export function showProvaBloqueadaModal() {
    const html = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0; color: var(--danger);">Folga Bloqueada</h3>
            <p>Prezado(a) estagiário(a), a data que escolheu está bloqueada, tendo em vista o prazo determinado pela supervisão. 
            Caso tenha interesse na folga-prova nessa data, <strong style="color:var(--danger); text-decoration: underline;">entrar em contato com a supervisão</strong>.</p>
            <div style="display:flex;justify-content:flex-end;margin-top: 15px;">
                <button class="button" id="btnUnderstood">Entendido</button>
            </div>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: true });
    m.modal.querySelector('#btnUnderstood').addEventListener('click', () => {
        m.close();
        m.cleanup();
    });
}

// Modal de alteração de senha (Admin / Super)
export function showChangePwdModalManager(user, isSuperAdmin = false) {
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>Alterar minha senha</h3><button id="closeP" class="button ghost">Fechar</button></div>
    <form id="formPwd" style="margin-top:8px;display:flex;flex-direction:column;gap:8px">
      <label style="position:relative;"><span class="small-muted">Senha atual</span>
        <input type="password" id="curPwd" required style="padding-right: 36px;"/>
        <span class="password-toggle-icon" id="toggleCurPwd">🔒️</span>
      </label>
      <label style="position:relative;"><span class="small-muted">Nova senha</span>
        <input type="password" id="newPwd" required style="padding-right: 36px;"/>
        <span class="password-toggle-icon" id="toggleNewPwd">🔒️</span>
      </label>
      <div style="display:flex;justify-content:flex-end;gap:8px"><button type="submit" class="button">Alterar</button></div>
    </form>
  `;
    const m = showModal(html);
    m.modal.querySelector('#closeP').addEventListener('click', () => { m.close(); m.cleanup(); });

    const toggleCurPwd = m.modal.querySelector('#toggleCurPwd');
    const curPwd = m.modal.querySelector('#curPwd');
    toggleCurPwd.style.position = 'absolute';
    toggleCurPwd.style.right = '10px';
    toggleCurPwd.style.top = '50%';
    toggleCurPwd.style.transform = 'translateY(-50%)';
    toggleCurPwd.style.cursor = 'pointer';
    toggleCurPwd.addEventListener('click', () => {
        const type = curPwd.getAttribute('type') === 'password' ? 'text' : 'password';
        curPwd.setAttribute('type', type);
        toggleCurPwd.textContent = type === 'password' ? '🔒' : '🔓';
    });

    const toggleNewPwd = m.modal.querySelector('#toggleNewPwd');
    const newPwd = m.modal.querySelector('#newPwd');
    toggleNewPwd.style.position = 'absolute';
    toggleNewPwd.style.right = '10px';
    toggleNewPwd.style.top = '50%';
    toggleNewPwd.style.transform = 'translateY(-50%)';
    toggleNewPwd.style.cursor = 'pointer';
    toggleNewPwd.addEventListener('click', () => {
        const type = newPwd.getAttribute('type') === 'password' ? 'text' : 'password';
        newPwd.setAttribute('type', type);
        toggleNewPwd.textContent = type === 'password' ? '🔒' : '🔓';
    });

    m.modal.querySelector('#formPwd').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const cur = m.modal.querySelector('#curPwd').value;
        const np = m.modal.querySelector('#newPwd').value;
        const u = (state.users || []).find(x => x.id === session.userId);
        if (!u) return alert('Usuário não encontrado');
        if (u.password !== cur) return alert('Senha atual incorreta');
        if (!np) return alert('Senha nova inválida');
        u.password = np;
        await save(state);
        alert('Senha alterada');
        m.close();
        m.cleanup();
    });
}


// Modal de pré-cadastro para estagiários
export function showPreRegistrationModal() {
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <h3>PRÉ-CADASTRO</h3>
        <div class="muted small">Seu cadastro será analisado pelo supervisor ou Gabriel, entre em contato com eles.</div>
      </div>
      <button id="closePreReg" class="button ghost">Cancelar</button>
    </div>
    <form id="formPreReg" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      <label><span class="small-muted">Tipo</span><input value="Estagiário" disabled class="input" /></label>
      <label><span class="small-muted">Nome completo do estagiário</span><input id="preRegName" required/></label>
      
      <label><span class="small-muted">Quero me cadastrar com</span>
        <select id="preRegIdType"><option value="matricula">Matrícula</option><option value="cpf">CPF</option></select>
      </label>
      <label id="preRegUserLabel"><span class="small-muted">Usuário (matrícula: ex. e710856 ou t320239)</span><input id="preRegUser" required/></label>
      
      <label style="position:relative;"><span class="small-muted">Senha</span>
        <input type="password" id="preRegPass" required style="padding-right: 36px;"/>
        <span class="password-toggle-icon" id="togglePreRegPass1">🔒</span>
      </label>
      <label style="position:relative;"><span class="small-muted">Confirmar senha</span>
        <input type="password" id="preRegPassConfirm" required style="padding-right: 36px;"/>
        <span class="password-toggle-icon" id="togglePreRegPass2">🔒</span>
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">Enviar pré-cadastro</button>
      </div>
    </form>
  `;
    const m = showModal(html);
    m.modal.querySelector('#closePreReg').addEventListener('click', () => { m.close(); m.cleanup(); });

    const idTypeSelect = m.modal.querySelector('#preRegIdType');
    const userLabel = m.modal.querySelector('#preRegUserLabel .small-muted');
    const userInput = m.modal.querySelector('#preRegUser');

    const updatePreRegField = () => {
      if (idTypeSelect.value === 'cpf') {
        userLabel.textContent = "CPF";
        userInput.placeholder = "Digite os 11 números do seu CPF";
        userInput.maxLength = 11;
        userInput.oninput = () => { userInput.value = userInput.value.replace(/[^0-9]/g, ''); };
      } else {
        userLabel.textContent = "Matrícula";
        userInput.placeholder = "ex: e123456";
        userInput.maxLength = 7;
        userInput.oninput = null;
      }
      userInput.value = '';
    };

    idTypeSelect.addEventListener('change', updatePreRegField);
    updatePreRegField(); // Chama uma vez para iniciar corretamente

    const togglePreRegPass1 = m.modal.querySelector('#togglePreRegPass1');
    const preRegPass = m.modal.querySelector('#preRegPass');
    togglePreRegPass1.addEventListener('click', () => {
        const type = preRegPass.getAttribute('type') === 'password' ? 'text' : 'password';
        preRegPass.setAttribute('type', type);
        togglePreRegPass1.textContent = type === 'password' ? '🔒️' : '🔓';
    });

    const togglePreRegPass2 = m.modal.querySelector('#togglePreRegPass2');
    const preRegPassConfirm = m.modal.querySelector('#preRegPassConfirm');
    togglePreRegPass2.addEventListener('click', () => {
        const type = preRegPassConfirm.getAttribute('type') === 'password' ? 'text' : 'password';
        preRegPassConfirm.setAttribute('type', type);
        togglePreRegPass2.textContent = type === 'password' ? '🔒' : '🔓';
    });

    m.modal.querySelector('#formPreReg').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const name = m.modal.querySelector('#preRegName').value.trim();
        const identifier = userInput.value.trim();
        const identifierType = idTypeSelect.value;
        const pass = m.modal.querySelector('#preRegPass').value;
        const passConfirm = m.modal.querySelector('#preRegPassConfirm').value;

        if (!name || !identifier || !pass || !passConfirm) return alert('Por favor, preencha todos os campos.');
        if (pass !== passConfirm) return alert('As senhas não coincidem.');

        if (identifierType === 'matricula') {
            const matriculaRegex = /^[et]\d{6}$/i;
            if (!matriculaRegex.test(identifier)) {
                alert("Formato de matrícula inválido. Use a letra 'e' ou 't' seguida por 6 números (ex: e123456 ou t123456).");
                return;
            }
        } else { // cpf
            if (identifier.length !== 11 || !/^\d+$/.test(identifier)) {
                alert('CPF inválido. Deve conter exatamente 11 números.');
                return;
            }
        }

        const newPreReg = {
            id: uuid(),
            name,
            identifier: identifier,
            identifierType: identifierType,
            password: pass,
            createdAt: timestamp(),
            status: 'pending'
        };

        state.pendingRegistrations.push(newPreReg);
        await save(state);
        alert('Pré-cadastro enviado com sucesso! Aguarde a aprovação do supervisor.');
        m.close(); m.cleanup();
    });
}

// NOVO: Modal de confirmação de exclusão
export function showDeleteConfirmationModal(onConfirm, count = 1) {
    const plural = count > 1 ? 'perfis' : 'perfil';
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="color: var(--danger);">Confirmar Exclusão</h3>
        <button id="cancelDeleteBtn" class="button ghost">Cancelar</button>
    </div>
    <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 12px;">
           <p>Para confirmar a <strong style="color: var(--danger);">exclusão de ${count} ${plural}</strong>, digite <strong style="color: var(--danger);">Excluir</strong> no campo abaixo e clique em "OK".</p>
        <input type="text" id="deleteConfirmInput" placeholder="Excluir" />
        <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button id="confirmDeleteBtn" class="button danger" disabled>OK</button>
        </div>
    </div>
    `;

    const m = showModal(html, { allowBackdropClose: true });
    const confirmInput = m.modal.querySelector('#deleteConfirmInput');
    const confirmBtn = m.modal.querySelector('#confirmDeleteBtn');
    const cancelBtn = m.modal.querySelector('#cancelDeleteBtn');

    confirmInput.addEventListener('input', () => {
        confirmBtn.disabled = confirmInput.value !== 'Excluir';
    });

    confirmInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter' && !confirmBtn.disabled) {
            confirmBtn.click();
        }
    });

    confirmBtn.addEventListener('click', () => {
        onConfirm();
        m.close();
        m.cleanup();
    });

    cancelBtn.addEventListener('click', () => {
        m.close();
        m.cleanup();
    });
}
