/* view-intern.js - Lógica e renderização da tela do estagiário */

import { escapeHtml, nowISO, uuid, timestamp } from './utils.js';
import { showModal, showProvaBloqueadaModal } from './ui-modals.js';

// Importa funções e variáveis compartilhadas do app principal
import { state, session, save, render, findInternById, downloadBlob, hasPower } from './app.js';

// ------------- Funções movidas de app.js ---------------

function calcHoursSummary(intern) {
    const arr = intern.hoursEntries || [];
    const bank = arr.filter(e => e.hours > 0).reduce((s, e) => s + e.hours, 0);
    const neg = arr.filter(e => e.hours < 0 && !e.compensated).reduce((s, e) => s + Math.abs(e.hours), 0);
    return { bank, negative: neg, net: bank - neg };
}
function formatHours(h) { return Number(h).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }

export function renderIntern(user) {
    const root = document.getElementById('root');
    const intern = findInternById(user.internId);

    // Verificação de 90 dias para atualização cadastral
    const lastUpdate = intern.registrationData?.lastUpdatedAt;
    let daysSinceUpdate = Infinity;
    if (lastUpdate) {
        const lastUpdateDate = new Date(lastUpdate);
        const today = new Date();
        daysSinceUpdate = Math.floor((today - lastUpdateDate) / (1000 * 60 * 60 * 24));
    }
    
    if (daysSinceUpdate >= 90) {
        showRegistrationDataModal(intern, user, { isForcedUpdate: true });
        return; // Impede a renderização da página principal até que os dados sejam atualizados
    }

    root.innerHTML = '';
    root.className = 'app';
    const card = document.createElement('div'); card.className = 'card';
    card.style.maxWidth = '1150px';
    card.style.margin = '28px auto';
    card.style.padding = '20px';

    const totals = calcHoursSummary(intern);
    const totalsHtml = totals.net >= 0
        ? `<div class="total-pill"><div class="small-muted">Banco de horas</div><div class="num">${formatHours(totals.net)} h</div></div>`
        : `<div class="total-pill"><div class="small-muted">Horas negativas</div><div class="num" style="color:var(--danger)">${formatHours(Math.abs(totals.net))} h</div></div>`;
    
    // NOVO: Lógica para calcular e criar o quadro de período de bloqueio
    const blockDays = state.meta.provaBlockDays || 0;
    const today = new Date();
    const lastBlockedDate = new Date();
    lastBlockedDate.setDate(today.getDate() + blockDays);
    const formattedBlockedDate = lastBlockedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const blockPillHtml = `
        <div class="total-pill" title="Entrar em contato com a supervisão">
            <div class="small-muted">Período de Bloqueio</div>
            <div class="num" style="color:var(--muted); font-size: 16px;">Até ${formattedBlockedDate}</div>
        </div>
    `;

    // NOVO: Lógica para criar os botões de troca de perfil (se aplicável)
    let profileSwitcherHtml = '';
    if (user.delegatedAdmin?.enabled) {
        profileSwitcherHtml = `
            <button class="button" id="btnSwitchToIntern" disabled>Perfil Estagiário</button>
            <button class="button ghost" id="btnSwitchToAdmin">Perfil admin</button>
        `;
    }

    card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div>
        <h2>${escapeHtml(intern?.name || user.username)}</h2>
        <div class="muted small">Área do estagiário — insira folgas-prova e veja calendário/horas.</div>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <button class="button ghost" id="btnLogout">Sair</button>
        <button class="button" id="btnExportSelf">Exportar</button>
        ${profileSwitcherHtml}
        ${user.selfPasswordChange ? '<button class="button ghost" id="btnChangePwdSelf">Alterar senha</button>' : ''}
        <button class="button alt" id="btnRegistrationData">Dados cadastrais</button>
      </div>
    </div>

    <hr style="margin:12px 0"/>

    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <div style="min-width:320px">
        <div class="small-muted">Adicionar folga-prova</div>
        <a href="regras-folga.html" target="_blank" class="rules-link">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            <span>Regras para agendar folga prova</span>
        </a>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
            <input type="date" id="inpMyProva" class="input" />
            <input type="text" id="inpMyProvaLink" class="input" placeholder="Link da prova (opcional)" />
            <button class="button alt" id="btnAddMyProva">Adicionar</button>
        </div>
        <div id="provaMsg" class="small-muted" style="margin-top:6px"></div>
      </div>

      <div style="margin-left:auto; display:flex; gap:12px;" id="totalsArea">
        ${blockPillHtml}
        ${totalsHtml}
      </div>
    </div>

    <div style="margin-top:12px;display:flex;gap:16px;flex-direction:column">
      <div id="calendarWrap" class="card" style="padding:12px"></div>

      <div class="card" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <h3>Histórico de lançamentos</h3>
            <div class="muted small">Banco / Negativas</div>
          </div>
          <div>
            ${hasPower(state.users.find(u => u.id === session.userId), 'manage_hours') ? '<button class="button" id="btnAddEntry">Lançar horas (admin)</button>' : ''}
          </div>
        </div>
        <div id="entriesList" style="margin-top:10px"></div>
      </div>
    </div>
  `;
    root.appendChild(card);

    // NOVO: Adiciona o listener para o botão de troca de perfil, se ele existir
    const btnSwitchToAdmin = document.getElementById('btnSwitchToAdmin');
    if (btnSwitchToAdmin) {
        btnSwitchToAdmin.addEventListener('click', () => {
            session.viewMode = 'admin'; // Define o modo de visualização
            render(); // Re-renderiza a aplicação
        });
    }

    document.getElementById('inpMyProva').value = nowISO();

    document.getElementById('btnAddMyProva').addEventListener('click', () => {
        const d = document.getElementById('inpMyProva').value;
        if (!d) return alert('Escolha uma data');
        
        const blockDays = Number(state.meta.provaBlockDays || 0);
        const today = new Date(); today.setHours(0, 0, 0, 0);

        // CORREÇÃO: Removido o "+ 1" extra que causava o bloqueio de um dia a mais.
        const allowedFrom = new Date(today.getTime() + blockDays * 24 * 60 * 60 * 1000);

        const selected = new Date(d + 'T00:00:00');
        const allowedDate = new Date(allowedFrom.getFullYear(), allowedFrom.getMonth(), allowedFrom.getDate());

        if (selected.getTime() <= allowedDate.getTime()) {
            showProvaBloqueadaModal();
            return;
        }

        const internName = escapeHtml(intern?.name || user.username);
        const formattedDate = d.split('-').reverse().join('/');

        const declarationHtml = `
            <div style="padding: 10px; text-align: center;">
                <h3 style="margin-top: 0; color: var(--accent);">Confirmação de Agendamento</h3>
                <p style="font-size: 1.1em; line-height: 1.6;">
                    “Eu, <strong>${internName}</strong>, declaro que desejo agendar folga no dia <strong>${formattedDate}</strong>, para realização de prova, e que apresentei previamente o calendário de provas à supervisão do e-Cejusc 3.”
                </p>
                <div style="display:flex;justify-content:center;gap:15px;margin-top: 25px;">
                    <button class="button ghost" id="btnCancelDeclaration" style="min-width: 100px;">Sair</button>
                    <button class="button" id="btnConfirmDeclaration" style="min-width: 100px;">Confirmar</button>
                </div>
            </div>
        `;

        const m = showModal(declarationHtml, { allowBackdropClose: true });

        m.modal.querySelector('#btnCancelDeclaration').addEventListener('click', () => {
            m.close();
            m.cleanup();
        });

        m.modal.querySelector('#btnConfirmDeclaration').addEventListener('click', async () => {
            const link = document.getElementById('inpMyProvaLink').value;

            intern.dates = intern.dates || [];
            if (!intern.dates.some(p => p.date === d)) {
                intern.dates.push({ date: d, link: link });
                intern.auditLog = intern.auditLog || [];
                intern.auditLog.push({ id: uuid(), action: 'create_prova', byUserId: session.userId, byUserName: user.username, at: timestamp(), details: `Solicitou folga-prova para a data ${d}` });
            }

            await save(state);
            document.getElementById('inpMyProva').value = nowISO();
            document.getElementById('inpMyProvaLink').value = '';
            
            m.close();
            m.cleanup();
            render();
        });
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        window.logout();
    });
    document.getElementById('btnExportSelf').addEventListener('click', () => { downloadBlob(JSON.stringify({ intern, user }, null, 2), `${(intern.name || user.username).replaceAll(' ', '_')}_dados.json`); });
    
    document.getElementById('btnRegistrationData').addEventListener('click', () => {
        showRegistrationDataModal(intern, user);
    });

    if (user.selfPasswordChange) {
        document.getElementById('btnChangePwdSelf').addEventListener('click', () => {
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
            toggleCurPwd.style.position = 'absolute'; toggleCurPwd.style.right = '10px'; toggleCurPwd.style.top = '50%'; toggleCurPwd.style.transform = 'translateY(-50%)'; toggleCurPwd.style.cursor = 'pointer';
            toggleCurPwd.addEventListener('click', () => {
                const type = curPwd.getAttribute('type') === 'password' ? 'text' : 'password';
                curPwd.setAttribute('type', type);
                toggleCurPwd.textContent = type === 'password' ? '🔒' : '🔓';
            });

            const toggleNewPwd = m.modal.querySelector('#toggleNewPwd');
            const newPwd = m.modal.querySelector('#newPwd');
            toggleNewPwd.style.position = 'absolute'; toggleNewPwd.style.right = '10px'; toggleNewPwd.style.top = '50%'; toggleNewPwd.style.transform = 'translateY(-50%)'; toggleNewPwd.style.cursor = 'pointer';
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
        });
    }

    let viewing = new Date();
    function renderCalendar() {
        renderCalendarForIntern(intern, viewing);
    }
    renderCalendar();
    renderEntriesList(intern);

    const addBtn = document.getElementById('btnAddEntry');
    if (addBtn) addBtn.addEventListener('click', () => showHourEntryForm(intern.id));
}

function renderCalendarForIntern(intern, viewing) {
    const wrap = document.getElementById('calendarWrap');
    const monthStart = new Date(viewing.getFullYear(), viewing.getMonth(), 1);
    const label = monthStart.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div><strong>Calendário</strong></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="button ghost" id="prevMonth">&lt;</button>
        <div class="small-muted" id="monthLabel">${label}</div>
        <button class="button ghost" id="nextMonth">&gt;</button>
      </div>
    </div>
    <div class="calendar" style="grid-template-columns:repeat(7,1fr);font-weight:700;color:var(--muted)">
      <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
    </div>
    <div id="monthGrid" class="calendar" style="margin-top:10px"></div>
  `;
    const grid = document.getElementById('monthGrid');
    grid.innerHTML = '';
    const firstDay = new Date(viewing.getFullYear(), viewing.getMonth(), 1).getDay();
    const daysInMonth = new Date(viewing.getFullYear(), viewing.getMonth() + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const blank = document.createElement('div'); blank.className = 'day'; blank.style.visibility = 'hidden'; blank.innerHTML = '&nbsp;'; grid.appendChild(blank);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(viewing.getFullYear(), viewing.getMonth(), d);
        const iso = date.toISOString().slice(0, 10);
        const dayEl = document.createElement('div'); dayEl.className = 'day';
        dayEl.innerHTML = `<div class="date">${d}</div>`;

        const prova = (intern.dates || []).find(p => p.date === iso);
        if (prova) {
            const pill = document.createElement('div'); pill.className = 'tag bank'; pill.textContent = 'Folga-prova';
            const currentUser = (state.users || []).find(u => u.id === session.userId);
            if (currentUser && currentUser.role === 'intern' && currentUser.internId === intern.id) {
                const rem = document.createElement('button'); rem.className = 'button ghost'; rem.textContent = '🗑️';
                const wrapper = document.createElement('div'); wrapper.className = 'wrapper';
                rem.addEventListener('click', async (ev) => { 
                    ev.stopPropagation(); 
                    if (confirm('Remover sua folga-prova nesta data?')) { 
                        intern.auditLog = intern.auditLog || [];
                        intern.auditLog.push({ id: uuid(), action: 'remove_prova', byUserId: session.userId, byUserName: currentUser.username, at: timestamp(), details: `Excluiu solicitação de folga-prova da data ${iso}` });
                        intern.dates = intern.dates.filter(x => x.date !== iso); 
                        await save(state); 
                        render(); 
                    } 
                });

                wrapper.appendChild(pill); wrapper.appendChild(rem);
                dayEl.appendChild(wrapper);
            } else {
                dayEl.appendChild(pill);
            }
        }
        ((intern.hoursEntries) || []).filter(e => e.date === iso).forEach(e => {
            const tag = document.createElement('div'); tag.className = 'tag ' + (e.hours > 0 ? 'bank' : 'neg'); tag.textContent = `${e.hours > 0 ? '+' : ''}${e.hours}h`;
            dayEl.appendChild(tag);
        });
        dayEl.addEventListener('click', () => openDayDetails(intern, iso));
        grid.appendChild(dayEl);
    }

    document.getElementById('prevMonth').addEventListener('click', () => {
        viewing.setMonth(viewing.getMonth() - 1);
        renderCalendarForIntern(intern, viewing);
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
        viewing.setMonth(viewing.getMonth() + 1);
        renderCalendarForIntern(intern, viewing);
    });
}

function openDayDetails(intern, iso) {
    const provas = (intern.dates || []).filter(p => p.date === iso);
    const entries = (intern.hoursEntries || []).filter(e => e.date === iso);
    const htmlParts = [];
    htmlParts.push(`<div style="display:flex;justify-content:space-between;align-items:center"><h3>Detalhes — ${iso}</h3><button id="closeD" class="button ghost">Fechar</button></div>`);
    htmlParts.push('<div style="margin-top:8px">');
    htmlParts.push('<h4>Folgas-prova</h4>');
    if (provas.length === 0) htmlParts.push('<div class="muted small">Nenhuma folga-prova nesta data</div>');
    else provas.forEach(p => htmlParts.push(`<div class="row"><div>${p.date} • <span class="small-muted">Folga-prova registrada</span></div> ${p.link ? `<a href="${p.link}" target="_blank" class="button ghost">Ver prova</a>` : ''}</div>`));
    htmlParts.push('<hr/>');
    htmlParts.push('<h4>Lançamentos</h4>');
    if (entries.length === 0) htmlParts.push('<div class="muted small">Nenhum lançamento</div>');
    else entries.forEach(e => {
        const currentUser = (state.users || []).find(u => u.id === session.userId);
        const canManageHours = hasPower(currentUser, 'manage_hours');

        const actions = canManageHours
            ? `<div style="display:flex;gap:6px;"><button class="button ghost" data-edit="${e.id}">Editar</button><button class="button" data-delete="${e.id}">Excluir</button></div>`
            : '';
        const compensation = e.hours < 0 && canManageHours
            ? (e.compensated
                ? `<button class="button ghost" data-uncomp="${e.id}">Desfazer comp.</button>`
                : `<button class="button" data-comp="${e.id}">Marcar comp.</button>`)
            : '';

        htmlParts.push(`
      <div class="row" style="flex-direction:column;align-items:flex-start;gap:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
          <div style="font-weight:700;">${e.date} • ${e.hours > 0 ? '+' : ''}${e.hours}h ${e.type === 'bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div>
          <div style="display:flex;gap:6px">${actions}</div>
        </div>
        <div class="small-muted" style="margin-left:8px;">${escapeHtml(e.reason || 'Sem justificativa')}</div>
        <div class="audit" style="margin-left:8px;">Criado por: ${escapeHtml(e.createdByName || '—')} em ${e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}${e.lastModifiedBy ? ' • Alterado por: ' + escapeHtml(e.lastModifiedBy) : ''}${e.compensatedBy ? ' • Compensado por: ' + escapeHtml(e.compensatedBy) + ' em ' + (e.compensatedAt ? new Date(e.compensatedAt).toLocaleString() : '') : ''}</div>
        ${compensation ? `<div style="margin-top:8px;">${compensation}</div>` : ''}
      </div>
    `);
    });
    htmlParts.push('</div>');

    const m = showModal(htmlParts.join(''), { allowBackdropClose: true });
    m.modal.querySelector('#closeD').addEventListener('click', () => { m.close(); m.cleanup(); });

    m.modal.querySelectorAll('[data-delete]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-delete');
        if (!confirm('Excluir lançamento?')) return;
        const entry = (intern.hoursEntries || []).find(x => x.id === id);
        const manager = (state.users || []).find(u => u.id === session.userId);
        if (entry) {
            const detailsText = `Excluído lançamento de ${Math.abs(entry.hours)} horas (${entry.type === 'bank' ? 'positivas' : 'negativas'}) da data ${entry.date}`;
            intern.auditLog.push({ id: uuid(), action: 'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: detailsText });
            intern.hoursEntries = intern.hoursEntries.filter(x => x.id !== id);
            await save(state);
            m.close();
            m.cleanup();
            render();
        }
    }));

    m.modal.querySelectorAll('[data-comp]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-comp');
        markCompensated(intern.id, id, true);
        intern.auditLog.push({ id: uuid(), action: 'compensated', byUserId: session.userId, at: timestamp(), details: `Compensou ${id}` });
        await save(state);
        m.close();
        m.cleanup();
        render();
    }));

    m.modal.querySelectorAll('[data-uncomp]').forEach(btn => btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-uncomp');
        markCompensated(intern.id, id, false);
        intern.auditLog.push({ id: uuid(), action: 'uncompensated', byUserId: session.userId, at: timestamp(), details: `Desfez compensação ${id}` });
        await save(state);
        m.close();
        m.cleanup();
        render();
    }));

    m.modal.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit');
        m.close();
        m.cleanup();
        showHourEntryForm(intern.id, id);
    }));
}

function renderEntriesList(intern) {
    const list = document.getElementById('entriesList'); if (!list) return;
    list.innerHTML = '';
    const arr = ((intern.hoursEntries) || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (arr.length === 0) { list.innerHTML = '<div class="muted">Nenhum lançamento</div>'; return; }
    arr.forEach(e => {
        const row = document.createElement('div'); row.className = 'row';
        const currentUser = (state.users || []).find(u => u.id === session.userId);
        const left = document.createElement('div');
        left.innerHTML = `<div style="font-weight:700">${e.date} — ${e.hours > 0 ? '+' : ''}${e.hours}h ${e.type === 'bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div><div class="small-muted">${escapeHtml(e.reason || '')}</div><div class="audit">Criado por: ${escapeHtml(e.createdByName || '—')} em ${e.createdAt ? new Date(e.createdAt).toLocaleString() : ''}</div>`;
        const right = document.createElement('div');
        if (hasPower(currentUser, 'manage_hours')) {
            const btnEdit = document.createElement('button'); btnEdit.className = 'button ghost'; btnEdit.textContent = 'Editar'; btnEdit.addEventListener('click', () => showHourEntryForm(intern.id, e.id));
            const btnDel = document.createElement('button'); btnDel.className = 'button'; btnDel.textContent = 'Excluir'; 
            btnDel.addEventListener('click', async () => { 
                if (confirm('Excluir lançamento?')) { 
                    const manager = (state.users || []).find(u => u.id === session.userId); 
                    intern.auditLog = intern.auditLog || []; 
                    const detailsText = `Excluído lançamento de ${Math.abs(e.hours)} horas (${e.type === 'bank' ? 'positivas' : 'negativas'}) da data ${e.date}`;
                    intern.auditLog.push({ id: uuid(), action: 'delete_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: detailsText }); 
                    intern.hoursEntries = intern.hoursEntries.filter(x => x.id !== e.id); 
                    await save(state); 
                    render(); 
                } 
            });
            right.appendChild(btnEdit); right.appendChild(btnDel);
            if (e.hours < 0) {
                const btnComp = document.createElement('button'); btnComp.className = e.compensated ? 'button ghost' : 'button'; btnComp.textContent = e.compensated ? 'Desfazer comp.' : 'Marcar compensado';
                btnComp.addEventListener('click', async () => { 
                    markCompensated(intern.id, e.id, !e.compensated); 
                    const manager = (state.users || []).find(u => u.id === session.userId); 
                    intern.auditLog = intern.auditLog || []; 
                    const actionText = e.compensated ? 'uncompensated' : 'compensated';
                    const detailsText = `${!e.compensated ? 'Marcou como compensado o' : 'Desfez a compensação do'} lançamento de ${Math.abs(e.hours)} horas negativas da data ${e.date}`;
                    intern.auditLog.push({ id: uuid(), action: actionText, byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: detailsText }); 
                    await save(state); 
                    render(); 
                });
                right.appendChild(btnComp);
            }
        }
        row.appendChild(left); row.appendChild(right); list.appendChild(row);
    });
}

export function showHourEntryForm(internId, entryId) {
    const intern = findInternById(internId);
    if (!intern) return;
    const isEdit = !!entryId;
    const existing = isEdit ? ((intern.hoursEntries) || []).find(e => e.id === entryId) : null;
    const currentManager = (state.users || []).find(u => u.id === session.userId);
    if (!hasPower(currentManager, 'manage_hours')) return alert('Sem permissão para gerenciar horas.');
    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>${isEdit ? 'Editar' : 'Lançar'} horas — ${escapeHtml(intern.name)}</h3><button id="closeH" class="button ghost">Fechar</button></div>
    <form id="formHours" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
      <label><span class="small-muted">Data</span><input type="date" id="h_date" value="${existing ? existing.date : nowISO()}" required /></label>
      <label><span class="small-muted">Tipo</span>
        <select id="h_type"><option value="bank">Banco (crédito)</option><option value="negative">Negativa (falta)</option></select>
      </label>
      <label><span class="small-muted">Quantidade de horas (número)</span><input id="h_hours" value="${existing ? Math.abs(existing.hours) : 8}" type="number" min="0.25" step="0.25" required /></label>
      <label><span class="small-muted">Justificativa / observações</span><textarea id="h_reason" rows="3">${existing ? escapeHtml(existing.reason || '') : ''}</textarea></label>
      <label><input type="checkbox" id="h_comp" ${existing && existing.compensated ? 'checked' : ''}/> Marcar como compensado (aplica-se a negativas)</label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">${isEdit ? 'Salvar' : 'Lançar'}</button>
      </div>
    </form>
  `;
    const m = showModal(html);
    const modal = m.modal;
    modal.querySelector('#closeH').addEventListener('click', () => { m.close(); m.cleanup(); });
    if (existing) modal.querySelector('#h_type').value = existing.type;
    modal.querySelector('#formHours').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const date = modal.querySelector('#h_date').value;
        const type = modal.querySelector('#h_type').value;
        const hoursRaw = modal.querySelector('#h_hours').value;
        const hoursNum = Number(hoursRaw);
        if (!date || !hoursNum || isNaN(hoursNum) || hoursNum <= 0) return alert('Dados inválidos');
        const reason = modal.querySelector('#h_reason').value || '';
        const comp = !!modal.querySelector('#h_comp').checked;
        const manager = (state.users || []).find(u => u.id === session.userId);
        const detailsText = `Lançamento de ${hoursNum} horas ${type === 'bank' ? 'positivas' : 'negativas'} para a data ${date}. Razão: ${reason || 'N/A'}`;

        if (isEdit && existing) {
            existing.date = date;
            existing.type = type;
            existing.hours = type === 'bank' ? hoursNum : -hoursNum;
            existing.reason = reason;
            existing.lastModifiedBy = manager.username;
            existing.lastModifiedAt = timestamp();
            existing.compensated = comp;
            intern.auditLog.push({ id: uuid(), action: 'edit_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Editou ${detailsText}` });
        } else {
            const entry = { id: uuid(), date, type, hours: type === 'bank' ? hoursNum : -hoursNum, reason, compensated: comp, createdById: manager.id, createdByName: manager.username, createdAt: timestamp() };
            intern.hoursEntries = intern.hoursEntries || [];
            intern.hoursEntries.push(entry);
            intern.auditLog.push({ id: uuid(), action: 'create_entry', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Criou ${detailsText}` });
        }
        await save(state);
        m.close();
        m.cleanup();
        render();
    });
}

export async function markCompensated(internId, entryId, flag) {
    const intern = findInternById(internId);
    if (!intern) return;
    const entry = ((intern.hoursEntries) || []).find(e => e.id === entryId);
    if (!entry) return;
    entry.compensated = !!flag;
    if (flag) {
        entry.compensatedBy = ((state.users || []).find(u => u.id === session.userId) || {}).username;
        entry.compensatedAt = timestamp();
    } else {
        entry.compensatedBy = null;
        entry.compensatedAt = null;
    }
    await save(state);
}

export function showRegistrationDataModal(intern, user, options = {}) {
    let dataToRender = { ...(intern.registrationData || {}) };

    if (options.isForcedUpdate) {
        dataToRender.address = '';
        dataToRender.emergencyContactName = '';
        dataToRender.emergencyContactRelation = '';
        dataToRender.emergencyContactPhone = '';
        dataToRender.university = '';
        dataToRender.universityOther = '';
        dataToRender.currentSemester = '';
    }

    const universities = [
        'Centro Universitário de Brasília (UniCEUB)', 'Centro Universitário do Distrito Federal (UDF)', 
        'Centro Universitário Estácio de Brasília', 'Centro Universitário IESB', 'Faculdade Presbiteriana Mackenzie Brasília',
        'Instituto Brasileiro de Ensino, Desenvolvimento e Pesquisa (IDP)', 'Universidade Católica de Brasília (UCB)',
        'Universidade de Brasília (UnB)', 'UniProcessus', 'UNIEURO - Centro Universitário', 'UNIP - Universidade Paulista (Campus Brasília)',
        'UPIS - Faculdades Integradas'
    ];

    let lastUpdateText = 'Nunca atualizado.';
    if (intern.registrationData?.lastUpdatedAt) {
        const days = Math.floor((new Date() - new Date(intern.registrationData.lastUpdatedAt)) / (1000 * 60 * 60 * 24));
        lastUpdateText = `Dados atualizados há ${days} dia(s).`;
    }

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
            <h3>${options.isAdminView ? `Dados de ${intern.name}` : 'Dados Cadastrais'}</h3>
            <span id="error-message" style="color:var(--danger); font-weight: bold; display: none; text-align:center; flex-grow:1;">Preencha os campos obrigatórios!</span>
            ${options.isForcedUpdate ? '' : '<button id="closeRegData" class="button ghost">Fechar</button>'}
        </div>

        <div class="muted small" style="margin-top: 4px; margin-bottom: 10px; text-align: center; font-weight: bold; color: var(--accent);">
            ${options.isForcedUpdate ? 'Por favor, revise e atualize seus dados para continuar.' : lastUpdateText}
        </div>
        
        <form id="formRegData" style="margin-top:10px; max-height: 70vh; overflow-y: auto; padding-right: 15px;">
            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Dados Pessoais</legend>
                <div class="form-row">
                    <label id="label-fullName" for="fullName"><strong>Nome completo *</strong></label>
                    <input id="fullName" value="${escapeHtml(dataToRender.fullName || intern.name)}">
                </div>
                <div class="form-row">
                    <label id="label-cpf" for="cpf"><strong>CPF (somente números) *</strong></label>
                    <input id="cpf" value="${escapeHtml(dataToRender.cpf)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                </div>
                <div class="form-row">
                    <label id="label-birthDate" for="birthDate"><strong>Data de nascimento *</strong></label>
                    <input id="birthDate" type="date" value="${escapeHtml(dataToRender.birthDate)}">
                </div>
                <div class="form-row">
                    <label id="label-mainPhone" for="mainPhone"><strong>Telefone principal (WhatsApp) *</strong></label>
                    <input id="mainPhone" value="${escapeHtml(dataToRender.mainPhone)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                </div>
                <div class="form-row">
                    <label id="label-altPhone" for="altPhone"><strong>Telefone alternativo</strong></label>
                    <input id="altPhone" value="${escapeHtml(dataToRender.altPhone)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                </div>
                <div class="form-row">
                    <label id="label-address" for="address"><strong>Endereço residencial com CEP *</strong></label>
                    <textarea id="address" rows="3">${escapeHtml(dataToRender.address)}</textarea>
                </div>
                 <div class="form-row">
                    <label id="label-instEmail" for="instEmail"><strong>E-mail institucional</strong></label>
                    <input id="instEmail" type="email" value="${escapeHtml(dataToRender.instEmail)}">
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Estágio</legend>
                <div class="form-row">
                    <label id="label-enrollmentId" for="enrollmentId"><strong>Matrícula</strong></label>
                    <input id="enrollmentId" value="${escapeHtml(user.username)}" disabled>
                </div>
                <div class="form-row">
                    <label id="label-internshipHours" for="internshipHours"><strong>Horário de estágio *</strong></label>
                    <select id="internshipHours">
                        <option value="" ${dataToRender.internshipHours === '' ? 'selected' : ''}>Selecione...</option>
                        <option value="13h-17h" ${dataToRender.internshipHours === '13h-17h' ? 'selected' : ''}>13h–17h</option>
                        <option value="14h-18h" ${dataToRender.internshipHours === '14h-18h' ? 'selected' : ''}>14h–18h</option>
                    </select>
                </div>
                <div class="form-row">
                    <label id="label-internshipStartDate" for="internshipStartDate"><strong>Data de início do estágio</strong></label>
                    <input id="internshipStartDate" type="date" value="${escapeHtml(dataToRender.internshipStartDate)}">
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Contato de Emergência</legend>
                <div class="form-row">
                    <label id="label-emergencyContactName" for="emergencyContactName"><strong>Nome da pessoa *</strong></label>
                    <input id="emergencyContactName" value="${escapeHtml(dataToRender.emergencyContactName)}">
                </div>
                <div class="form-row">
                    <label id="label-emergencyContactRelation" for="emergencyContactRelation"><strong>Parentesco *</strong></label>
                    <input id="emergencyContactRelation" value="${escapeHtml(dataToRender.emergencyContactRelation)}">
                </div>
                <div class="form-row">
                    <label id="label-emergencyContactPhone" for="emergencyContactPhone"><strong>Telefone *</strong></label>
                    <input id="emergencyContactPhone" value="${escapeHtml(dataToRender.emergencyContactPhone)}" oninput="this.value = this.value.replace(/[^0-9]/g, '')">
                </div>
                <div class="form-row">
                     <label id="label-emergencyContactWhatsapp"><strong>Funciona WhatsApp? *</strong></label>
                     <select id="emergencyContactWhatsapp">
                        <option value="sim" ${dataToRender.emergencyContactWhatsapp === 'sim' ? 'selected' : ''}>Sim</option>
                        <option value="nao" ${dataToRender.emergencyContactWhatsapp === 'nao' ? 'selected' : ''}>Não</option>
                     </select>
                </div>
            </fieldset>

            <fieldset style="border:1px solid #eee; border-radius:8px; padding:12px; margin-bottom:12px;">
                <legend style="font-weight:bold; color:var(--accent);">Formação Acadêmica</legend>
                 <div class="form-row">
                    <label id="label-university" for="university"><strong>Instituição de Ensino Superior *</strong></label>
                    <select id="university">
                        <option value="">Selecione...</option>
                        ${universities.map(u => `<option value="${u}" ${dataToRender.university === u ? 'selected' : ''}>${u}</option>`).join('')}
                        <option value="outros" ${dataToRender.university === 'outros' ? 'selected' : ''}>Outros</option>
                    </select>
                </div>
                <div class="form-row" id="otherUniversityWrapper" style="display: none;">
                    <label id="label-universityOther" for="universityOther"><strong>Qual instituição? *</strong></label>
                    <input id="universityOther" value="${escapeHtml(dataToRender.universityOther || '')}">
                </div>
                <div class="form-row">
                    <label id="label-currentSemester" for="currentSemester"><strong>Semestre cursando *</strong></label>
                    <input id="currentSemester" value="${escapeHtml(dataToRender.currentSemester)}">
                </div>
            </fieldset>

            <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:15px;">
                <button type="submit" class="button">Salvar e Atualizar</button>
            </div>
        </form>
    `;

    const m = showModal(html, { allowBackdropClose: !options.isForcedUpdate && !options.isAdminView });
    const form = m.modal.querySelector('#formRegData');
    const universitySelect = m.modal.querySelector('#university');
    const otherUniversityWrapper = m.modal.querySelector('#otherUniversityWrapper');

    const checkOtherUniversity = () => {
        otherUniversityWrapper.style.display = universitySelect.value === 'outros' ? 'block' : 'none';
    };
    universitySelect.addEventListener('change', checkOtherUniversity);
    checkOtherUniversity();

    const closeBtn = m.modal.querySelector('#closeRegData');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => { m.close(); m.cleanup(); });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!options.isAdminView) {
            const mandatoryFields = [
                'fullName', 'cpf', 'birthDate', 'mainPhone', 'address', 'internshipHours',
                'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone',
                'university', 'currentSemester'
            ];
            let isValid = true;
            m.modal.querySelectorAll('label').forEach(label => label.style.color = '');
            m.modal.querySelector('#error-message').style.display = 'none';
            mandatoryFields.forEach(id => {
                const input = m.modal.querySelector(`#${id}`);
                if (!input.value.trim()) {
                    m.modal.querySelector(`#label-${id}`).style.color = 'var(--danger)';
                    isValid = false;
                }
            });
            if (universitySelect.value === 'outros' && !m.modal.querySelector('#universityOther').value.trim()) {
                m.modal.querySelector(`#label-universityOther`).style.color = 'var(--danger)';
                isValid = false;
            }
            if (!isValid) {
                m.modal.querySelector('#error-message').style.display = 'block';
                return;
            }
        }

        intern.registrationData = {
            fullName: m.modal.querySelector('#fullName').value,
            cpf: m.modal.querySelector('#cpf').value,
            birthDate: m.modal.querySelector('#birthDate').value,
            mainPhone: m.modal.querySelector('#mainPhone').value,
            altPhone: m.modal.querySelector('#altPhone').value,
            address: m.modal.querySelector('#address').value,
            instEmail: m.modal.querySelector('#instEmail').value,
            enrollmentId: m.modal.querySelector('#enrollmentId').value,
            internshipHours: m.modal.querySelector('#internshipHours').value,
            internshipStartDate: m.modal.querySelector('#internshipStartDate').value,
            emergencyContactName: m.modal.querySelector('#emergencyContactName').value,
            emergencyContactRelation: m.modal.querySelector('#emergencyContactRelation').value,
            emergencyContactPhone: m.modal.querySelector('#emergencyContactPhone').value,
            emergencyContactWhatsapp: m.modal.querySelector('#emergencyContactWhatsapp').value,
            university: universitySelect.value,
            universityOther: m.modal.querySelector('#universityOther').value,
            currentSemester: m.modal.querySelector('#currentSemester').value,
            // LÓGICA CONDICIONAL: SÓ ATUALIZA O TIMESTAMP SE NÃO FOR ADMIN
            lastUpdatedAt: options.isAdminView 
                ? intern.registrationData.lastUpdatedAt // Mantém o timestamp antigo se o admin estiver editando
                : new Date().toISOString() // Cria um novo timestamp se o estagiário estiver editando
        };
        
        await save(state);
        alert('Dados cadastrais atualizados com sucesso!');
        m.close();
        m.cleanup();
        
        if (options.isForcedUpdate) {
            render();
        }
    });
}
