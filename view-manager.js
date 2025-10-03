/* view-manager.js - Lógica e renderização da tela do gestor */

import { escapeHtml, formatDate, nowISO, uuid, timestamp } from './utils.js';
import { showModal, showChangePwdModalManager, showDeleteConfirmationModal } from './ui-modals.js';

// Funções de outros módulos que a view do manager precisa
import {
    state,
    session,
    save,
    render,
    findUserByIntern,
    findInternById,
    hasPower,
    defaultPowersFor,
    downloadBlob
} from './app.js';

// Funções da view do estagiário que o manager também usa
import { showHourEntryForm, markCompensated, showRegistrationDataModal } from './view-intern.js';

// Variáveis de estado específicas deste módulo
let adminCalendarViewing = new Date();
let adminProvasView = 'list';
let importedUserData = [];
let userFilter = 'all';

// Função principal de renderização, que será exportada
export function renderManager(user, isDelegatedView = false) {
    const root = document.getElementById('root');
    root.innerHTML = '';
    root.className = 'app-grid';

    const pendingCount = (state.pendingRegistrations || []).length;
    const pendingClass = pendingCount > 0 ? 'has-pending' : '';
    const isSuperAdmin = user.role === 'super';

const backToInternButton = `
    <div class="sidebar-item" id="btnBackToInternView" 
        style="
            background: linear-gradient(135deg, #004d61, #007b9e);
            color: #fff;
            font-weight: bold;
            border-radius: 8px;
            padding: 12px 18px;
            text-align: center;
            cursor: pointer;
        ">
        <span>Voltar ao Perfil Estagiário</span>
    </div>`;

    root.innerHTML = `
    <aside class="sidebar-nav">
      <div style="font-weight: bold; font-size: 1.2rem; color: var(--accent);">
        Painel de Gestão
      </div>
      <div class="muted small">Usuário: ${escapeHtml(user.username)} • ${escapeHtml(isDelegatedView ? 'Admin Delegado' : user.role)}</div>
      
      ${isDelegatedView ? backToInternButton : ''}

      ${isSuperAdmin ?
            `<button class="button" id="btnChangePwdSuper" style="width: 100%; margin: 8px 0;">Alterar Senha</button><hr style="border-color: #eee; margin: 8px 0;">` :
            (user.role === 'admin' && user.selfPasswordChange ?
                `<button class="button ghost" id="btnChangePwdMgr" style="width: 100%; margin: 8px 0;">Alterar Senha</button><hr style="border-color: #eee; margin: 8px 0;">` :
                `<hr style="border-color: #eee; margin: 8px 0;">`)
        }

      <div class="sidebar-item active" data-section="geral">
        <span>Geral</span>
      </div>
      <div class="sidebar-item" data-section="provas">
        <span>Folgas-prova</span>
      </div>
      <div class="sidebar-item" data-section="relatorios">
        <span>Relatórios de Horas</span>
      </div>
      
      ${!isDelegatedView ? `
      <div class="sidebar-item ${pendingClass}" data-section="pendentes">
        <span>Pré-cadastros Pendentes</span>
        <span id="pending-count-badge" class="badge" style="display: ${pendingCount > 0 ? 'inline-block' : 'none'};">${pendingCount}</span>
      </div>
      <div class="sidebar-item" data-section="configuracoes">
        <span>Configurações</span>
      </div>
      ` : ''}
      
      ${user.role === 'super' ? `
      <div class="sidebar-item" id="btnSidebarBackup">
        <span>Backup</span>
      </div>
      ` : ''}

      ${!isDelegatedView ? `
      <div class="sidebar-item" data-section="lixeira">
        <span>Lixeira</span>
      </div>
      ` : ''}

      ${user.role === 'super' ? `
      <div class="sidebar-item" data-section="systemlogs">
        <span>Logs do Sistema</span>
      </div>
      ` : ''}

      <div style="margin-top: auto;">
        <button class="button ghost" id="btnLogoutMgr">Sair</button>
      </div>
    </aside>
    <main class="main-content">
      <div id="geral" class="content-section active">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Usuários</h3>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <button id="btnNewUser" class="button ghost">Novo usuário</button>
              <button id="btnBulkImport" class="button alt">Criar em lote</button>
            </div>
          </div>
          <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
             <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap">
                <div id="userFilterButtons" style="display:flex;gap:8px;align-items:center;">
                   <button class="button" id="filterAll" data-filter="all">Todos</button>
                   <button class="button ghost" id="filterIntern" data-filter="intern">Estagiário</button>
                   <button class="button ghost" id="filterAdmin" data-filter="admin">Admin</button>
                </div>
                <div style="display: flex; align-items: center; gap: 16px;">
                    <div class="form-check">
                        <input type="checkbox" id="selectAllUsersCheckbox" style="width: auto; height: auto;">
                        <label for="selectAllUsersCheckbox" style="font-size: 13px; color: var(--muted); cursor: pointer;">Selecionar Todos</label>
                    </div>
                    <button id="btnDeleteSelectedUsers" class="button danger" disabled>Excluir selecionados</button>
                </div>
             </div>
             <input id="searchMgmt" placeholder="Pesquisar por nome, usuário ou ID" />
             <div class="muted small">Total de usuários: <span id="totalUsers"></span></div>
             <div class="list" id="usersList" style="margin-top:10px"></div>
          </div>
        </div>
        <div class="card" style="margin-top:12px">
            <h3>Pesquisa de Estagiários</h3>
            <div class="muted small">Pesquise por estagiário — lista dinâmica. Clique para abrir detalhes.</div>
            <div style="margin-top:8px;position:relative">
                <input id="mgrNameSearch" placeholder="Pesquisar por nome do estagiário" autocomplete="off" />
                <div id="mgrNameDropdown" class="dropdown" style="position:absolute;left:0;right:0;z-index:30;display:none;background:#fff;border:1px solid #eee;max-height:220px;overflow:auto"></div>
            </div>
            <div id="mgrResults" style="margin-top:12px"></div>
        </div>
      </div>
      <div id="provas" class="content-section">
          <div class="card">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3>Folgas-prova</h3>
                <div style="display: flex; gap: 8px;">
                    <button id="toggleProvasListView" class="button">Lista</button>
                    <button id="toggleProvasCalendarView" class="button ghost">Calendário</button>
                </div>
              </div>
              <div id="provasListSection" style="margin-top: 12px;" class="content-section active">
                  <div class="muted small">Exibe apenas estagiários que têm folga-prova cadastrada na data escolhida.</div>
                  <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
                      <input type="date" id="mgrFilterDate" />
                      <button class="button" id="btnApplyFilter">Buscar</button>
                      <button class="button ghost" id="btnClearDateFilter">Limpar</button>
                  </div>
                  <div id="provasResults" style="margin-top:12px"></div>
              </div>
              <div id="provasCalendarSection" style="margin-top: 12px; display: none;">
                  <div id="adminCalendarWrap" class="card" style="padding:12px"></div>
              </div>
          </div>
      </div>
      <div id="relatorios" class="content-section">
        <div class="card">
          <h3>Relatórios de Horas</h3>
          <div class="muted small">Saldo líquido por estagiário (banco - negativas não compensadas)</div>
          <div id="reportsArea" style="margin-top:8px"></div>
        </div>
      </div>
      <div id="pendentes" class="content-section">
        <div class="card">
          <h3>Pré-cadastros Pendentes</h3>
          <div class="muted small">Aprove ou recuse solicitações de novos estagiários.</div>
          <div id="pendingList" style="margin-top:10px"></div>
        </div>
      </div>
      <div id="configuracoes" class="content-section">
        <div class="card">
          <h3>Configurações</h3>
          <div class="small-muted">Bloqueio para marcação de folgas-prova (dias)</div>
          <div class="settings-row">
            <select id="cfgBlockDays">${new Array(31).fill(0).map((_, i) => `<option value="${i}">${i} dias</option>`).join('')}</select>
            <button class="button" id="btnSaveConfig">Salvar</button>
          </div>
          <hr style="margin: 12px 0"/>
          <div class="small-muted">Opções de Importação/Exportação</div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <div class="muted small">Use a seção 'Backup' no menu lateral para gerenciar os dados.</div>
          </div>
        </div>
      </div>
      <div id="lixeira" class="content-section">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3>Lixeira</h3>
            <div style="display:flex;gap:8px;">
              <button id="btnRestoreSelected" class="button ghost">Restaurar selecionados</button>
              <button id="btnRestoreAll" class="button alt">Restaurar tudo</button>
              <button id="btnEmptyTrash" class="button danger">Esvaziar lixeira</button>
            </div>
          </div>
          <div class="muted small">Pré-cadastros recusados. Serão removidos após o período de retenção.</div>
          <div class="settings-row">
            <div class="small-muted">Período de retenção:</div>
            <select id="cfgTrashRetention">${new Array(30).fill(0).map((_, i) => `<option value="${i + 1}">${i + 1} dia(s)</option>`).join('')}</select>
            <button class="button" id="btnSaveRetention">Salvar</button>
          </div>
          <div id="trashList" style="margin-top:10px;"></div>
        </div>
      </div>
      <div id="systemlogs" class="content-section">
        <div class="card">
            <h3>Logs do Sistema</h3>
            <div class="tabs" style="margin-bottom: 15px;">
              <button class="tab-button active" data-tab="activity">Logs de Atividade</button>
              <button class="tab-button" data-tab="access">Histórico de Acesso</button>
            </div>

            <div id="activity" class="tab-content active">
              <div class="muted small">Todas as atividades registradas no sistema.</div>
              <div style="display:flex;gap:8px;margin-top:12px;align-items:center">
                  <input type="date" id="logFilterDate" />
                  <button class="button" id="btnApplyLogFilter">Filtrar por Data</button>
                  <button class="button ghost" id="btnClearLogFilter">Mostrar Todos</button>
                  <button id="btnClearActivityLogs" class="button danger" style="margin-left: auto;">Limpar Logs de Atividade</button>
              </div>
              <div id="logListContainer" style="margin-top:12px; max-height: 600px; overflow-y: auto;"></div>
            </div>

            <div id="access" class="tab-content">
              <div class="muted small">Registros de todos os logins bem-sucedidos no sistema.</div>
              
              <div style="display:flex; gap: 10px; margin-top: 12px; align-items: center;">
                  <input type="text" id="loginLogSearchInput" placeholder="Filtrar por nome ou usuário..." style="flex-grow: 1; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--input-border);">
                  <input type="date" id="loginLogDateInput" style="max-width: 180px; padding: 5px 8px; border-radius: 8px; border: 1px solid var(--input-border);">
                  <button class="button ghost" id="btnClearLoginLogFilter" style="flex-shrink: 0;">Limpar Filtros</button>
              </div>

              <div style="display:flex;gap:16px;margin-top:12px;align-items:center">
                  <div class="form-check">
                      <input type="checkbox" id="selectAllLoginLogs" style="width: auto; height: auto;">
                      <label for="selectAllLoginLogs">Selecionar Tudo</label>
                  </div>
                  <button id="btnDeleteSelectedLoginLogs" class="button ghost" disabled>Apagar Selecionados</button>
                  <button id="btnClearLoginLogs" class="button danger" style="margin-left: auto;">Apagar Todo o Histórico</button>
              </div>
              <div id="loginLogContainer" style="margin-top:12px; max-height: 600px; overflow-y: auto;"></div>
            </div>
        </div>
      </div>
    </main>
    <input type="file" id="fileMgmt" style="display:none" accept="application/json" />
    <input type="file" id="fileBulkImport" style="display:none" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
    `;

    if (isDelegatedView) {
        document.getElementById('btnBackToInternView').addEventListener('click', () => {
            session.viewMode = 'intern';
            render();
        });
    }

    document.querySelectorAll('#userFilterButtons button').forEach(button => {
        button.addEventListener('click', (e) => {
            userFilter = e.currentTarget.dataset.filter;
            document.querySelectorAll('#userFilterButtons button').forEach(btn => {
                btn.classList.toggle('ghost', btn.dataset.filter !== userFilter);
            });
            renderUsersList();
        });
    });
    
    const selectAllCheckbox = document.getElementById('selectAllUsersCheckbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('#usersList .user-select-checkbox').forEach(checkbox => {
                checkbox.checked = isChecked;
            });
            updateBulkDeleteButtonState();
        });
    }

    const btnChangePwdSuper = document.getElementById('btnChangePwdSuper');
    if (btnChangePwdSuper) {
        btnChangePwdSuper.addEventListener('click', () => showChangePwdModalManager(user, true));
    }
    const btnChangePwdMgr = document.getElementById('btnChangePwdMgr');
    if (btnChangePwdMgr) {
        btnChangePwdMgr.addEventListener('click', () => {
            const manager = (state.users || []).find(u => u.id === session.userId);
            if (manager.role === 'admin' && manager.selfPasswordChange) {
                showChangePwdModalManager(manager, false);
            } else {
                alert('Você não tem permissão para alterar a senha por aqui.');
            }
        });
    }
    document.getElementById('btnDeleteSelectedUsers').addEventListener('click', deleteSelectedUsers);
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const sectionId = e.currentTarget.dataset.section;
            if (e.currentTarget.id === 'btnSidebarBackup' || e.currentTarget.id === 'btnBackToInternView') {
                if (e.currentTarget.id === 'btnSidebarBackup') showBackupModal();
                return;
            }
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
            if (sectionId) document.getElementById(sectionId).classList.add('active');
            
            if (sectionId === 'relatorios') renderReports();
            else if (sectionId === 'provas') renderProvasSection();
            else if (sectionId === 'pendentes') renderPendingList();
            else if (sectionId === 'lixeira') renderTrashList();
            else if (sectionId === 'systemlogs') renderSystemLogs();
        });
    });
    document.getElementById('btnLogoutMgr').addEventListener('click', () => { window.logout(); });
    document.getElementById('btnNewUser').addEventListener('click', () => showCreateUserForm((state.users || []).find(u => u.id === session.userId)));
    document.getElementById('btnBulkImport').addEventListener('click', () => {
        const manager = (state.users || []).find(u => u.id === session.userId);
        if (!hasPower(manager, 'create_intern')) return alert('Sem permissão.');
        showBulkImportModal();
    });
    document.getElementById('fileMgmt').addEventListener('change', (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        importDataFromFile(f);
        ev.target.value = null;
    });
    document.getElementById('searchMgmt').addEventListener('input', renderUsersList);
    const nameInput = document.getElementById('mgrNameSearch');
    nameInput.addEventListener('input', (ev) => renderNameDropdown(ev.target.value.trim().toLowerCase()));
    nameInput.addEventListener('focus', (ev) => renderNameDropdown(ev.target.value.trim().toLowerCase()));
    document.addEventListener('click', (ev) => {
        if (!ev.target.closest('#mgrNameSearch') && !ev.target.closest('#mgrNameDropdown')) {
            document.getElementById('mgrNameDropdown').style.display = 'none';
        }
    });
    
    const cfgBlockDays = document.getElementById('cfgBlockDays');
    if (cfgBlockDays) {
        cfgBlockDays.value = String((state.meta || {}).provaBlockDays || 5);
        document.getElementById('btnSaveConfig').addEventListener('click', async () => {
            const val = Number(document.getElementById('cfgBlockDays').value || 0);
            state.meta.provaBlockDays = val;
            await save(state);
            alert('Configuração salva.');
        });
    }
    
    const cfgTrashRetention = document.getElementById('cfgTrashRetention');
    if(cfgTrashRetention) {
        cfgTrashRetention.value = String((state.meta || {}).trashRetentionDays || 10);
        document.getElementById('btnSaveRetention').addEventListener('click', async () => {
            const val = Number(document.getElementById('cfgTrashRetention').value || 10);
            state.meta.trashRetentionDays = val;
            await save(state);
            alert('Período de retenção salvo.');
        });
        document.getElementById('btnEmptyTrash').addEventListener('click', emptyTrash);
        document.getElementById('btnRestoreAll').addEventListener('click', restoreAllTrash);
        document.getElementById('btnRestoreSelected').addEventListener('click', restoreSelectedTrash);
    }
    
    renderUsersList();
}

function generateCsvData() {
    const allEntries = [];
    (state.interns || []).forEach(intern => {
        (intern.hoursEntries || []).forEach(entry => {
            const entryType = entry.hours > 0 ? 'Banco (Crédito)' : 'Negativa (Falta)';
            const hoursValue = entry.hours;
            allEntries.push({
                Tipo_Registro: 'Horas',
                Estagiario_Nome: intern.name,
                Estagiario_ID: intern.id,
                Data: entry.date,
                Detalhe: entryType,
                Horas: hoursValue.toFixed(2).replace('.', ','),
                Compensado: entry.compensated ? 'Sim' : 'Não',
                Motivo_Razao: entry.reason ? entry.reason.replace(/["\n\r]/g, '') : '',
                Link_Prova: '',
                Criado_Em: new Date(entry.createdAt).toLocaleString('pt-BR'),
                Criado_Por: entry.createdByName || 'N/A'
            });
        });
        (intern.dates || []).forEach(prova => {
            allEntries.push({
                Tipo_Registro: 'Folga-Prova',
                Estagiario_Nome: intern.name,
                Estagiario_ID: intern.id,
                Data: prova.date,
                Detalhe: 'Folga-Prova Agendada',
                Horas: '8,00',
                Compensado: 'N/A',
                Motivo_Razao: 'Folga para realização de prova',
                Link_Prova: prova.link || 'N/A',
                Criado_Em: 'N/A',
                Criado_Por: 'N/A'
            });
        });
    });
    if (allEntries.length === 0) {
        return '';
    }
    allEntries.sort((a, b) => {
        if (a.Estagiario_Nome !== b.Estagiario_Nome) {
            return a.Estagiario_Nome.localeCompare(b.Estagiario_Nome);
        }
        return a.Data.localeCompare(b.Data);
    });
    const headers = Object.keys(allEntries[0]);
    const csvRows = [];
    csvRows.push(headers.join(';'));
    for (const row of allEntries) {
        const values = headers.map(header => {
            let safeValue = String(row[header] || '').replace(/"/g, '""');
            if (safeValue.includes(';') || safeValue.includes('\n') || safeValue.includes('\r') || safeValue.includes('"')) {
                safeValue = `"${safeValue}"`;
            }
            return safeValue;
        });
        csvRows.push(values.join(';'));
    }
    return csvRows.join('\n');
}

function showBackupModal() {
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    if (currentUser.role !== 'super') {
        alert('Acesso negado.');
        return;
    }
    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>Opções de Backup</h3>
          <button id="closeBackupModal" class="button ghost">Fechar</button>
        </div>
        <div style="margin-top: 15px; display: flex; flex-direction: column; gap: 15px;">
          <div class="card" style="padding: 15px;">
            <h4>EXPORTAR Backup</h4>
            <div style="display:flex; gap: 10px; margin-top: 10px;">
                <button id="btnDownloadAllJson" class="button">Exportar (.JSON)</button>
                <button id="btnDownloadAllCsv" class="button alt">Exportar (CSV)</button>
            </div>
          </div>
          <div class="card" style="padding: 15px;">
            <h4>CARREGAR Backup </h4>
            <div class="muted small">**Atenção: Isso irá sobrescrever todos os dados atuais!**</div>
            <button id="btnImportTrigger" class="button danger" style="margin-top: 10px;">Importar (.json)</button>
          </div>
        </div>`;
    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#closeBackupModal').addEventListener('click', () => { m.close(); m.cleanup(); });
    m.modal.querySelector('#btnDownloadAllJson').addEventListener('click', () => {
        downloadBlob(JSON.stringify(state, null, 2), 'backup_provas_all.json', 'application/json');
        m.close();
        m.cleanup();
    });
    m.modal.querySelector('#btnDownloadAllCsv').addEventListener('click', () => {
        const csvData = generateCsvData();
        if (csvData) {
            const bom = '\ufeff';
            downloadBlob(bom + csvData, `relatorio_provas_horas_${nowISO()}.csv`, 'text/csv;charset=utf-8;');
        } else {
            alert('Nenhum dado para exportar.');
        }
        m.close();
        m.cleanup();
    });
    m.modal.querySelector('#btnImportTrigger').addEventListener('click', () => {
        if (confirm('ATENÇÃO: Deseja continuar e substituir todos os dados atuais?')) {
            document.getElementById('fileMgmt').click();
            m.close();
            m.cleanup();
        }
    });
}

async function importDataFromFile(file) {
    const r = new FileReader();
    r.onload = async e => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.users || !parsed.interns || typeof parsed.meta === 'undefined') {
                throw new Error('Formato do arquivo de backup inválido.');
            }
            state = parsed;
            await save(state);
            alert('Importação concluída com sucesso!');
            render();
        } catch (err) {
            console.error(err);
            alert('Erro ao importar o backup: ' + err.message);
        }
    };
    r.readAsText(file);
}

function showBulkImportModal() {
    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
                <h3>CRIAR USUÁRIOS EM LOTE (ESTAGIÁRIO)</h3>
                <div class="muted small">Carregue um arquivo Excel/CSV com os dados dos estagiários a serem criados.</div>
            </div>
            <button id="closeBulkImport" class="button ghost">Cancelar</button>
        </div>
        <div class="card" style="margin-top:10px; padding: 15px; background: var(--input-bg); border: 1px dashed var(--input-border);">
            <h4>Formato da Planilha:</h4>
            <div class="muted small">A planilha deve conter 4 colunas na primeira aba, com a primeira linha sendo o cabeçalho:</div>
            <ul style="list-style-type: disc; padding-left: 20px; font-size: 14px;">
                <li><strong>Coluna A: Nome completo</strong></li>
                <li><strong>Coluna B: Usuário</strong> (Matrícula, ex: e710856 ou t320239)</li>
                <li><strong>Coluna C: Senha</strong> (Se vazia, será '123456')</li>
                <li><strong>Coluna D: Permitir alteração de senha (Sim/Não)</strong></li>
            </ul>
            <div class="form-check" style="margin-top: 10px;">
                <input type="checkbox" id="userTypeBulk" checked disabled>
                <label for="userTypeBulk" style="font-weight: 600;">Cargo: Estagiário (Fixo)</label>
            </div>
        </div>

        <div style="display:flex; gap: 10px; margin-top: 15px; align-items:center;">
            <button id="btnTriggerFile" class="button alt" style="min-width: 150px;">Carregar Planilha (.xlsx/.csv)</button>
            <span id="fileNameDisplay" class="small-muted" style="flex-grow: 1;">Nenhum arquivo carregado.</span>
        </div>
        
        <div id="bulkStatus" style="margin-top: 15px;"></div>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top: 15px;">
            <button id="btnCreateInBatch" class="button" disabled>Criar em Lote (0 usuários)</button>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: false });
    const btnCreateInBatch = m.modal.querySelector('#btnCreateInBatch');
    const fileInput = document.getElementById('fileBulkImport');
    fileInput.value = null;
    m.modal.querySelector('#closeBulkImport').addEventListener('click', () => { m.close(); m.cleanup(); });
    m.modal.querySelector('#btnTriggerFile').addEventListener('click', () => fileInput.click());
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        m.modal.querySelector('#fileNameDisplay').textContent = `Arquivo: ${file.name}`;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                if (typeof XLSX === 'undefined') throw new Error('Biblioteca SheetJS (xlsx.js) não carregada.');
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: false });
                importedUserData = validateExcelData(sheetData);
                const validCount = importedUserData.length;
                m.modal.querySelector('#bulkStatus').innerHTML = `<div class="chip">Pronto para criar: <strong>${validCount}</strong> estagiário(s)</div>`;
                btnCreateInBatch.textContent = `Criar em Lote (${validCount} usuários)`;
                btnCreateInBatch.disabled = validCount === 0;
            } catch (error) {
                m.modal.querySelector('#bulkStatus').innerHTML = `<div class="chip danger">Erro: ${error.message}</div>`;
                importedUserData = [];
                btnCreateInBatch.textContent = 'Criar em Lote (0 usuários)';
                btnCreateInBatch.disabled = true;
            }
        };
        reader.readAsArrayBuffer(file);
    };
    btnCreateInBatch.onclick = async () => {
        if (importedUserData.length === 0) return alert('Nenhum dado válido.');
        if (!confirm(`Deseja criar ${importedUserData.length} novos estagiários?`)) return;
        const manager = (state.users || []).find(u=>u.id===session.userId);
        const creationDate = timestamp();
        for (const userData of importedUserData) {
            const internId = uuid();
            (state.interns || []).push({ id: internId, name: userData.name, dates: [], hoursEntries: [], auditLog: [], registrationData: { enrollmentId: userData.username, cpf: '' } });
            (state.users || []).push({ id: uuid(), username: userData.username, name: userData.name, password: userData.password, role:'intern', internId, powers: defaultPowersFor('intern'), selfPasswordChange: userData.allowSelfPwd, createdAt: creationDate });
        }
        await save(state);
        alert(`${importedUserData.length} estagiários criados.`);
        m.close(); m.cleanup(); render();
    };
}

function validateExcelData(sheetData) {
    const validUsers = [];
    const existingUsernames = new Set((state.users || []).map(u => u.username.toLowerCase()));
    const dataRows = sheetData.slice(1);
    dataRows.forEach((row, index) => {
        if (!row || row.filter(cell => String(cell).trim() !== '').length === 0) return;
        const name = String(row[0] || '').trim();
        const username = String(row[1] || '').trim().toLowerCase();
        const password = String(row[2] || '').trim() || '123456';
        const allowSelfPwdText = String(row[3] || '').trim().toLowerCase();
        const allowSelfPwd = allowSelfPwdText === 'sim';
        const isMatriculaValid = /^[et]\d{6}$/i.test(username);
        if (!name || !username || !isMatriculaValid || existingUsernames.has(username)) {
            console.warn(`Linha ${index + 2} ignorada: dados inválidos ou usuário já existente.`);
            return;
        }
        validUsers.push({ name, username, password, allowSelfPwd });
        existingUsernames.add(username);
    });
    return validUsers;
}

function renderPendingList() {
    const list = document.getElementById('pendingList');
    if (!list) return;
    list.innerHTML = '';
    const pending = (state.pendingRegistrations || []).filter(r => r.status !== 'rejected');
    if (pending.length === 0) {
        list.innerHTML = '<div class="muted">Nenhum pré-cadastro pendente.</div>';
        return;
    }
    pending.forEach(reg => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `
      <div>
        <div style="font-weight:700">${escapeHtml(reg.name)}</div>
        <div class="muted small">Login com ${reg.identifierType}: ${escapeHtml(reg.identifier)}</div>
        <div class="muted small">Solicitado em: ${new Date(reg.createdAt).toLocaleString()}</div>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="button" data-approve-id="${reg.id}">Aprovar</button>
        <button class="button danger" data-reject-id="${reg.id}">Recusar</button>
      </div>
    `;
        list.appendChild(row);
        row.querySelector(`[data-approve-id="${reg.id}"]`).addEventListener('click', () => approveRegistration(reg.id));
        row.querySelector(`[data-reject-id="${reg.id}"]`).addEventListener('click', () => rejectRegistration(reg.id));
    });
}

async function approveRegistration(regId) {
    const reg = (state.pendingRegistrations || []).find(r => r.id === regId);
    if (!reg) return;

    const internId = uuid();
    let newUsername, registrationData;

    if (reg.identifierType === 'cpf') {
        newUsername = `temp_${uuid().slice(0, 6)}`; // Matrícula temporária
        registrationData = { cpf: reg.identifier, enrollmentId: '' };
    } else { // matricula
        newUsername = reg.identifier;
        registrationData = { cpf: '', enrollmentId: reg.identifier };
    }
    
    const newIntern = { id: internId, name: reg.name, dates: [], hoursEntries: [], auditLog: [], registrationData };
    (state.interns || []).push(newIntern);

    (state.users || []).push({ id: uuid(), username: newUsername, name: reg.name, password: reg.password, role: 'intern', internId, powers: defaultPowersFor('intern'), selfPasswordChange: true, createdAt: timestamp() });
    
    const manager = (state.users || []).find(u => u.id === session.userId);
    newIntern.auditLog.push({ id: uuid(), action: 'approve_registration', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Pré-cadastro de '${reg.name}' (${reg.identifier}) foi aprovado.` });

    state.pendingRegistrations = (state.pendingRegistrations || []).filter(r => r.id !== regId);
    await save(state);
    alert('Pré-cadastro aprovado!');
    render();
}

async function rejectRegistration(regId) {
    if (!confirm('Deseja recusar este pré-cadastro? Ele será movido para a lixeira.')) return;
    const reg = (state.pendingRegistrations || []).find(r => r.id === regId);
    if (!reg) return;
    reg.status = 'rejected';
    reg.rejectedAt = timestamp();
    (state.trash || []).push(reg);
    
    const manager = (state.users || []).find(u => u.id === session.userId);
    (state.systemLog || []).push({ id: uuid(), action: 'reject_registration', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Pré-cadastro de '${reg.name}' (${reg.identifier}) foi recusado.`, context: 'Gerenciamento de Usuários' });

    state.pendingRegistrations = (state.pendingRegistrations || []).filter(r => r.id !== regId);
    await save(state);
    alert('Pré-cadastro recusado e movido para a lixeira.');
    render();
}

function renderTrashList() {
    const list = document.getElementById('trashList');
    if (!list) return;
    list.innerHTML = '';
    if ((state.trash || []).length === 0) {
        list.innerHTML = '<div class="muted">A lixeira está vazia.</div>';
        return;
    }
    const now = new Date();
    const retentionDays = (state.meta || {}).trashRetentionDays;
    (state.trash || []).forEach(item => {
        const deletedDate = new Date(item.deletedAt || item.rejectedAt);
        const daysLeft = Math.max(0, retentionDays - Math.ceil((now - deletedDate) / (1000 * 60 * 60 * 24)));
        const row = document.createElement('div');
        row.className = 'trash-item-row';
        const typeLabel = item.type === 'user' ? 'Usuário Excluído' : 'Pré-cadastro Rejeitado';
        row.innerHTML = `
      <input type="checkbox" data-id="${item.id}" />
      <div class="trash-item-details">
        <div style="font-weight:700">${escapeHtml(item.internName || item.name || item.username)}</div>
        <div class="muted small">${typeLabel} • Usuário: ${escapeHtml(item.username)}</div>
        <div class="muted small">Removido em: ${deletedDate.toLocaleString()}</div>
        <div class="muted small">Será excluído em ${daysLeft} dia(s)</div>
      </div>
    `;
        list.appendChild(row);
    });
}

async function emptyTrash() {
    if ((state.trash || []).length === 0) return alert('A lixeira já está vazia.');
    if (!confirm('Deseja esvaziar a lixeira permanentemente?')) return;
    state.trash = [];
    await save(state);
    alert('Lixeira esvaziada.');
    renderTrashList();
}

async function restoreAllTrash() {
    if ((state.trash || []).length === 0) return alert('A lixeira está vazia.');
    if (!confirm('Deseja restaurar todos os itens da lixeira?')) return;
    (state.trash || []).forEach(item => {
        if (item.type === 'user') {
            (state.users || []).push({
                id: item.userId, username: item.username, password: '123456', role: item.role,
                internId: item.internId, powers: defaultPowersFor(item.role), selfPasswordChange: true, createdAt: item.createdAt || timestamp()
            });
            if (item.internId) {
                (state.interns || []).push({ id: item.internId, name: item.internName, dates: [], hoursEntries: [], auditLog: [] });
            }
        } else {
            (state.pendingRegistrations || []).push({ ...item, status: 'pending' });
        }
    });
    state.trash = [];
    await save(state);
    alert('Todos os itens restaurados.');
    render();
}

async function restoreSelectedTrash() {
    const checkboxes = document.querySelectorAll('#trashList input:checked');
    if (checkboxes.length === 0) return alert('Selecione itens para restaurar.');
    if (!confirm(`Deseja restaurar os ${checkboxes.length} itens selecionados?`)) return;
    const idsToRestore = Array.from(checkboxes).map(cb => cb.dataset.id);
    const itemsToRestore = (state.trash || []).filter(item => idsToRestore.includes(item.id));
    itemsToRestore.forEach(item => {
        if (item.type === 'user') {
            (state.users || []).push({
                id: item.userId, username: item.username, password: '123456', role: item.role,
                internId: item.internId, powers: defaultPowersFor(item.role), selfPasswordChange: true, createdAt: item.createdAt || timestamp()
            });
            if (item.internId) {
                (state.interns || []).push({ id: item.internId, name: item.internName, dates: [], hoursEntries: [], auditLog: [] });
            }
        } else {
            (state.pendingRegistrations || []).push({ ...item, status: 'pending' });
        }
    });
    state.trash = (state.trash || []).filter(item => !idsToRestore.includes(item.id));
    await save(state);
    alert('Itens selecionados restaurados.');
    render();
}

export async function cleanupRejectedRegistrations() {
    const now = new Date();
    const retentionDays = (state.meta || {}).trashRetentionDays;
    state.trash = (state.trash || []).filter(reg => {
        const deletedDate = new Date(reg.deletedAt || reg.rejectedAt);
        const diffDays = Math.ceil((now - deletedDate) / (1000 * 60 * 60 * 24));
        return diffDays <= retentionDays;
    });
    await save(state);
}

function renderProvasSection() {
    const listSection = document.getElementById('provasListSection');
    const calendarSection = document.getElementById('provasCalendarSection');
    const toggleListBtn = document.getElementById('toggleProvasListView');
    const toggleCalendarBtn = document.getElementById('toggleProvasCalendarView');
    const newToggleListBtn = toggleListBtn.cloneNode(true);
    const newToggleCalendarBtn = toggleCalendarBtn.cloneNode(true);
    toggleListBtn.replaceWith(newToggleListBtn);
    toggleCalendarBtn.replaceWith(newToggleCalendarBtn);
    if (adminProvasView === 'list') {
        listSection.style.display = 'block';
        calendarSection.style.display = 'none';
        newToggleListBtn.className = 'button';
        newToggleCalendarBtn.className = 'button ghost';
        const filterDateInput = document.getElementById('mgrFilterDate');
        if (filterDateInput && !filterDateInput.value) {
            filterDateInput.value = nowISO();
        }
        filterAndRenderProvas();
        document.getElementById('btnApplyFilter').addEventListener('click', () => filterAndRenderProvas());
        document.getElementById('btnClearDateFilter').addEventListener('click', () => {
            document.getElementById('mgrFilterDate').value = '';
            document.getElementById('provasResults').innerHTML = '';
        });
    } else {
        listSection.style.display = 'none';
        calendarSection.style.display = 'block';
        newToggleListBtn.className = 'button ghost';
        newToggleCalendarBtn.className = 'button';
        renderAdminProvasCalendar();
    }
    newToggleListBtn.addEventListener('click', () => {
        adminProvasView = 'list';
        renderProvasSection();
    });
    newToggleCalendarBtn.addEventListener('click', () => {
        adminProvasView = 'calendar';
        renderProvasSection();
    });
}

function renderAdminProvasCalendar() {
    const wrap = document.getElementById('adminCalendarWrap');
    const monthStart = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), 1);
    const label = monthStart.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div><strong>Calendário de Folgas-prova</strong></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="button ghost" id="prevAdminMonth">&lt;</button>
        <div class="small-muted" id="adminMonthLabel">${label}</div>
        <button class="button ghost" id="nextAdminMonth">&gt;</button>
      </div>
    </div>
    <div class="calendar">
      <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
    </div>
    <div id="adminMonthGrid" class="calendar" style="margin-top:10px"></div>
  `;
    const grid = document.getElementById('adminMonthGrid');
    grid.innerHTML = '';
    const firstDay = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), 1).getDay();
    const daysInMonth = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth() + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) {
        grid.appendChild(document.createElement('div'));
    }
    const provasByDate = {};
    (state.interns || []).forEach(intern => {
        (intern.dates || []).forEach(p => {
            if (!provasByDate[p.date]) provasByDate[p.date] = [];
            provasByDate[p.date].push(intern);
        });
    });
    for (let d = 1; d <= daysInMonth; d++) {
        const iso = new Date(adminCalendarViewing.getFullYear(), adminCalendarViewing.getMonth(), d).toISOString().slice(0, 10);
        const dayEl = document.createElement('div');
        dayEl.className = 'day';
        dayEl.innerHTML = `<div class="date">${d}</div>`;
        if (provasByDate[iso] && provasByDate[iso].length > 0) {
            const countEl = document.createElement('div');
            countEl.className = 'tag bank';
            countEl.textContent = `${provasByDate[iso].length} estagiário(s)`;
            dayEl.appendChild(countEl);
            dayEl.addEventListener('click', () => showProvasDayDetails(iso, provasByDate[iso]));
        }
        grid.appendChild(dayEl);
    }
    document.getElementById('prevAdminMonth').addEventListener('click', () => {
        adminCalendarViewing.setMonth(adminCalendarViewing.getMonth() - 1);
        renderAdminProvasCalendar();
    });
    document.getElementById('nextAdminMonth').addEventListener('click', () => {
        adminCalendarViewing.setMonth(adminCalendarViewing.getMonth() + 1);
        renderAdminProvasCalendar();
    });
}

function showProvasDayDetails(iso, interns) {
    const htmlParts = [];
    htmlParts.push(`<div style="display:flex;justify-content:space-between;align-items:center"><h3>Folgas-prova — ${iso}</h3><button id="closeProvasDetails" class="button ghost">Fechar</button></div>`);
    htmlParts.push('<div style="margin-top:8px">');
    if (interns.length === 0) {
        htmlParts.push('<div class="muted small">Nenhuma folga-prova marcada.</div>');
    } else {
        interns.forEach(intern => {
            const prova = (intern.dates || []).find(p => p.date === iso);
            const linkIcon = prova && prova.link ? `<a href="${prova.link}" target="_blank" class="button ghost">Ver prova</a>` : '';
            htmlParts.push(`<div class="row"><div><strong>${escapeHtml(intern.name)}</strong><div class="muted small">${intern.id}</div></div><div>${linkIcon}</div></div>`);
        });
    }
    htmlParts.push('</div>');
    const m = showModal(htmlParts.join(''), { allowBackdropClose: false });
    m.modal.querySelector('#closeProvasDetails').addEventListener('click', () => { m.close(); m.cleanup(); });
}

function updateBulkDeleteButtonState() {
    const selectedCount = document.querySelectorAll('#usersList .user-select-checkbox:checked').length;
    const button = document.getElementById('btnDeleteSelectedUsers');
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    const canDelete = hasPower(currentUser, 'delete_user');
    if (button) {
        button.textContent = `Excluir (${selectedCount})`;
        button.disabled = selectedCount === 0 || !canDelete;
    }
}

async function deleteSelectedUsers() {
    const checkboxes = document.querySelectorAll('#usersList .user-select-checkbox:checked');
    const idsToDelete = Array.from(checkboxes).map(cb => cb.dataset.userId);
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    if (idsToDelete.length === 0) return alert('Selecione perfis para excluir.');
    if (!hasPower(currentUser, 'delete_user')) return alert('Sem permissão.');
    const superAdmin = (state.users || []).find(u => u.role === 'super');
    const finalIdsToDelete = idsToDelete.filter(id => id !== superAdmin.id);
    if (finalIdsToDelete.length !== idsToDelete.length) {
        alert('O Administrador Principal não pode ser excluído.');
    }
    if (finalIdsToDelete.length === 0) return;

    const onConfirm = async () => {
        const manager = (state.users || []).find(u => u.id === session.userId);
        const deletedAt = timestamp();
        const usersToProcess = (state.users || []).filter(u => finalIdsToDelete.includes(u.id));

        for (const userToDelete of usersToProcess) {
            const internData = userToDelete.internId ? findInternById(userToDelete.internId) : null;
            (state.trash || []).push({
                id: uuid(), type: 'user', userId: userToDelete.id, username: userToDelete.username, role: userToDelete.role,
                internId: userToDelete.internId, internName: internData ? internData.name : null, deletedAt, createdAt: userToDelete.createdAt
            });
            
            const detailsText = `Excluiu o perfil de ${userToDelete.role} '${userToDelete.name || userToDelete.username}' (${userToDelete.username}).`;
            const contextText = internData ? `Estagiário: ${internData.name}` : 'Gerenciamento de Usuários';
            (state.systemLog || []).push({ id: uuid(), action: 'delete_user', byUserId: manager.id, byUserName: manager.username, at: deletedAt, details: detailsText, context: contextText });
        }
        state.users = (state.users || []).filter(u => !finalIdsToDelete.includes(u.id));
        state.interns = (state.interns || []).filter(i => !usersToProcess.some(u => u.internId === i.id));
        await save(state);
        alert(`${finalIdsToDelete.length} perfil(s) movidos para a lixeira.`);
        render();
    };

    showDeleteConfirmationModal(onConfirm, finalIdsToDelete.length);
}

function renderUsersList() {
    const q = document.getElementById('searchMgmt').value.trim().toLowerCase();
    const container = document.getElementById('usersList'); container.innerHTML = '';
    let list = (state.users || []).filter(u => u.role !== 'super');
    
    if (userFilter === 'intern') {
        list = list.filter(u => u.role === 'intern');
    } else if (userFilter === 'admin') {
        list = list.filter(u => u.role === 'admin');
    }

    if (q) list = list.filter(u => (u.username || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q));
    document.getElementById('totalUsers').textContent = list.length;
    list.sort((a, b) => (a.name || a.username).localeCompare(b.name || b.username));
    const currentUser = (state.users || []).find(u => u.id === session.userId);
    const canDelete = hasPower(currentUser, 'delete_user');
    
    const selectAllCheckbox = document.getElementById('selectAllUsersCheckbox');
    if(selectAllCheckbox) selectAllCheckbox.checked = false;

    list.forEach(u => {
        const row = document.createElement('div');
        row.className = 'row user-row-selectable';
        const internName = u.role === 'intern' ? (findInternById(u.internId)?.name || '') : '';
        
        const delegatedIndicator = u.delegatedAdmin?.enabled ? '🧑‍💼 ' : '';
        const displayName = u.role === 'intern' ? `${delegatedIndicator}${escapeHtml(internName)} (${escapeHtml(u.username)})` : `${escapeHtml(u.name || u.username)}`;
        
        const roleText = u.role === 'intern' ? 'Estagiário' : u.role;
        const roleAndDateDisplay = `${roleText} (${formatDate(u.createdAt)})`;
        const checkboxHtml = canDelete ? `<input type="checkbox" data-user-id="${u.id}" class="user-select-checkbox" />` : '<div class="icon-placeholder"></div>';
        const left = `<div><div style="font-weight:700">${displayName}</div><div class="muted small">${roleAndDateDisplay}</div></div>`;
        const right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-view-id="${u.id}">Abrir</button><button class="button" data-edit-id="${u.id}">Editar</button></div>`;
        row.innerHTML = `${checkboxHtml}${left}${right}`;
        container.appendChild(row);
        row.querySelector('[data-view-id]').addEventListener('click', () => openUserManagerView(u.id));
        row.querySelector('[data-edit-id]').addEventListener('click', () => showEditUserForm(u.id));
        
        if (canDelete) {
            const userCheckbox = row.querySelector('.user-select-checkbox');
            userCheckbox.addEventListener('change', () => {
                updateBulkDeleteButtonState();
                const allCheckboxes = document.querySelectorAll('#usersList .user-select-checkbox');
                const allChecked = Array.from(allCheckboxes).every(cb => cb.checked) && allCheckboxes.length > 0;
                if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
            });
        }
    });
    updateBulkDeleteButtonState();
}

function renderReports() {
    const area = document.getElementById('reportsArea');
    if (!area) return;
    area.innerHTML = '';

    const computed = (state.interns || []).map(i => {
        const totalBank = ((i.hoursEntries) || []).filter(e => e.hours > 0).reduce((s, e) => s + e.hours, 0);
        const totalNeg = ((i.hoursEntries) || []).filter(e => e.hours < 0 && !e.compensated).reduce((s, e) => s + Math.abs(e.hours), 0);
        return { id: i.id, name: i.name, net: totalBank - totalNeg };
    });

    const negatives = computed.filter(x => x.net < 0).sort((a, b) => a.net - b.net);
    const banks = computed.filter(x => x.net > 0).sort((a, b) => b.net - a.net);

    const baseBadgeStyle = 'display:inline-block;min-width:36px;text-align:center;padding:6px 8px;border-radius:8px;font-weight:700;font-size:0.9em;line-height:1;';
    const negInline = baseBadgeStyle + 'background-color: rgba(239,68,68,0.10); color: #ef4444; border: 1px solid rgba(239,68,68,0.12);';
    const okInline  = baseBadgeStyle + 'background-color: rgba(16,185,129,0.08); color: #10b981; border: 1px solid rgba(16,185,129,0.10);';

    const headerBase = 'display:inline-block;padding:8px 14px;border-radius:10px;font-weight:800;margin:0 0 12px 0;font-size:1rem;line-height:1;';
    const negHeader = headerBase + 'background-color: rgba(239,68,68,0.08); color: #ef4444; border: 1px solid rgba(239,68,68,0.12);';
    const okHeader  = headerBase + 'background-color: rgba(16,185,129,0.08); color: #10b981; border: 1px solid rgba(16,185,129,0.10);';

    const negHtml = `${
        negatives.length === 0
            ? `<h4 style="${negHeader}">Horas negativas</h4><div class="muted small">Nenhum</div>`
            : `<h4 style="${negHeader}">Horas negativas</h4>` + negatives.map(n => {
                return `<div class="row">
                    <div><strong>${escapeHtml(n.name)}</strong></div>
                    <div><span style="${negInline}">${Math.abs(n.net)}h</span></div>
                </div>`;
            }).join('')
    }`;

    const bankHtml = `${
        banks.length === 0
            ? `<h4 style="${okHeader}">Banco de horas</h4><div class="muted small">Nenhum</div>`
            : `<h4 style="${okHeader}">Banco de horas</h4>` + banks.map(n => {
                return `<div class="row">
                    <div><strong>${escapeHtml(n.name)}</strong></div>
                    <div><span style="${okInline}">${n.net}h</span></div>
                </div>`;
            }).join('')
    }`;

    area.innerHTML = negHtml + bankHtml;
}

function showDelegationModal(user) {
    const isDelegated = user.delegatedAdmin?.enabled;
    const currentPowers = user.delegatedAdmin?.powers || {};
    const currentManager = (state.users || []).find(u => u.id === session.userId);

    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>Delegar Poderes — ${escapeHtml(user.name)}</h3>
      <button class="button ghost" id="closeDelegate">Fechar</button>
    </div>
    <form id="formDelegate" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
        <label class="form-check" style="background: var(--input-bg); padding: 10px; border-radius: 8px;">
            <input type="checkbox" id="delegateEnabled" ${isDelegated ? 'checked' : ''} />
            <strong style="color: var(--accent);">Habilitar acesso de "Admin Delegado" para este estagiário</strong>
        </label>
        
        <div id="adminPowersDelegate" style="display:${isDelegated ? 'block' : 'none'};">
            <div class="small-muted" style="margin: 8px 0;">Selecione os poderes a serem delegados:</div>
            <div class="form-check-group">
                <label class="form-check"><input type="checkbox" id="p_create" ${currentPowers.create_intern ? 'checked' : ''}/> Criar estagiários</label>
                <label class="form-check"><input type="checkbox" id="p_edit" ${currentPowers.edit_user ? 'checked' : ''}/> Editar usuários</label>
                <label class="form-check"><input type="checkbox" id="p_delete" ${currentPowers.delete_user ? 'checked' : ''}/> Excluir usuários</label>
                <label class="form-check"><input type="checkbox" id="p_reset" ${currentPowers.reset_password ? 'checked' : ''}/> Resetar senhas</label>
                <label class="form-check"><input type="checkbox" id="p_manage" ${currentPowers.manage_hours ? 'checked' : ''}/> Gerenciar horas</label>
                <label class="form-check"><input type="checkbox" id="p_provas" ${currentPowers.manage_provas ? 'checked' : ''}/> Gerenciar folgas-prova</label>
                ${hasPower(currentManager, 'delegate_admins') && currentManager.role === 'super' ? `<label class="form-check"><input type="checkbox" id="p_delegate"/> Delegar admins</label>` : ''}
            </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end; margin-top: 15px;">
            <button type="submit" class="button">Salvar Delegação</button>
        </div>
    </form>
    `;
    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#closeDelegate').addEventListener('click', () => { m.close(); m.cleanup(); });

    const enabledCheckbox = m.modal.querySelector('#delegateEnabled');
    const powersDiv = m.modal.querySelector('#adminPowersDelegate');
    enabledCheckbox.addEventListener('change', () => {
        powersDiv.style.display = enabledCheckbox.checked ? 'block' : 'none';
    });
    
    m.modal.querySelector('#formDelegate').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const enabled = enabledCheckbox.checked;
        const delegateCheckbox = m.modal.querySelector('#p_delegate');
        const powers = {
            create_intern: m.modal.querySelector('#p_create').checked,
            edit_user: m.modal.querySelector('#p_edit').checked,
            delete_user: m.modal.querySelector('#p_delete').checked,
            reset_password: m.modal.querySelector('#p_reset').checked,
            manage_hours: m.modal.querySelector('#p_manage').checked,
            manage_provas: m.modal.querySelector('#p_provas').checked,
            delegate_admins: delegateCheckbox ? delegateCheckbox.checked : false
        };

        user.delegatedAdmin = { enabled, powers };

        await save(state);
        alert('Delegação de poderes atualizada com sucesso!');
        m.close();
        m.cleanup();
        render();
    });
}

function openUserManagerView(userId) {
    const u = (state.users || []).find(x => x.id === userId);
    if (!u) return;
    const intern = u.internId ? findInternById(u.internId) : null;
    const canDelete = u.role !== 'super';
    const currentManager = (state.users || []).find(uu => uu.id === session.userId);

    const delegateButtonHtml = hasPower(currentManager, 'delegate_admins') && u.role === 'intern'
        ? `<button id="btnDelegateAdmin" class="button alt">${u.delegatedAdmin?.enabled ? 'Gerenciar Delegação' : 'Delegar Admin'}</button>`
        : '';

    const html = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>Gerenciar: ${escapeHtml(u.username)} ${u.role === 'intern' ? '• ' + escapeHtml(intern?.name || '') : ''}</h3>
      <button class="button ghost" id="btnCloseView">Fechar</button>
    </div>
    <div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee;">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${delegateButtonHtml}
        ${u.role === 'intern' ? '<button id="btnViewRegData" class="button alt">Exibir Dados</button>' : ''}
        ${hasPower(currentManager, 'reset_password') ? '<button id="btnResetPwd" class="button ghost">Resetar senha</button>' : ''}
        ${u.role === 'intern' ? `
            ${hasPower(currentManager, 'manage_provas') ? '<button id="btnManageDates" class="button ghost">Gerenciar folgas</button>' : ''}
            ${hasPower(currentManager, 'manage_hours') ? '<button id="btnManageHours" class="button ghost">Gerenciar horas</button>' : ''}
        ` : ''}
        ${canDelete && hasPower(currentManager, 'delete_user') ? '<button id="btnDeleteUser" class="button danger">Excluir</button>' : ''}
      </div>
    </div>`;
    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#btnCloseView').addEventListener('click', () => { m.close(); m.cleanup(); });

    const btnDelegate = m.modal.querySelector('#btnDelegateAdmin');
    if (btnDelegate) {
        btnDelegate.addEventListener('click', () => {
            m.close();
            m.cleanup();
            showDelegationModal(u);
        });
    }

    const btnViewRegData = m.modal.querySelector('#btnViewRegData');
    if (btnViewRegData) {
        btnViewRegData.addEventListener('click', () => {
            showRegistrationDataModal(intern, u, { isAdminView: true });
            m.close();
            m.cleanup();
        });
    }
    const btnReset = m.modal.querySelector('#btnResetPwd');
    if (btnReset) {
        btnReset.addEventListener('click', async () => {
            const np = prompt(`Nova senha para ${u.username}:`);
            if (!np) return;
            u.password = np;
            const manager = (state.users || []).find(uu => uu.id === session.userId);
            const internData = u.internId ? findInternById(u.internId) : null;
            const detailsText = `Resetou a senha para o usuário '${u.username}'.`;
            const contextText = internData ? `Estagiário: ${internData.name}` : 'Gerenciamento de Usuários';
            (state.systemLog || []).push({ id: uuid(), action: 'reset_password', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: detailsText, context: contextText });
            await save(state);
            alert('Senha alterada.');
        });
    }
    if (u.role === 'intern') {
        const btnDates = m.modal.querySelector('#btnManageDates');
        if (btnDates) {
            btnDates.addEventListener('click', () => {
                m.close();
                m.cleanup();
                openInternManagerView(u.internId);
            });
        }
        const btnHours = m.modal.querySelector('#btnManageHours');
        if (btnHours) {
            btnHours.addEventListener('click', () => {
                m.close();
                m.cleanup();
                openInternHoursView(u.internId);
            });
        }
    }
    const btnDelete = m.modal.querySelector('#btnDeleteUser');
    if (btnDelete) {
        btnDelete.addEventListener('click', async () => {
            const onConfirm = async () => {
                const manager = (state.users || []).find(uu => uu.id === session.userId);
                const internData = u.internId ? findInternById(u.internId) : null;
                const detailsText = `Excluiu o perfil de ${u.role} '${u.name || u.username}' (${u.username}).`;
                const contextText = internData ? `Estagiário: ${internData.name}` : 'Gerenciamento de Usuários';
                (state.systemLog || []).push({ id: uuid(), action: 'delete_user', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: detailsText, context: contextText });
                state.users = (state.users || []).filter(x => x.id !== userId);
                if (u.internId) {
                    state.interns = (state.interns || []).filter(i => i.id !== u.internId);
                }
                await save(state);
                alert('Usuário movido para a lixeira.');
                m.close();
                m.cleanup();
                render();
            };
            showDeleteConfirmationModal(onConfirm, 1);
        });
    }
}

function openInternManagerView(internId) {
    const intern = findInternById(internId);
    if (!intern) return;
    const user = findUserByIntern(intern.id);

    const datesHtml = (intern.dates || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map(p => `
        <div class="row">
            <div>
                <div style="font-weight:700; color: var(--accent);">${p.date}</div>
                <div class="muted small">Data da folga-prova</div>
            </div>
            <div style="display:flex;gap:8px;">
                ${p.link ? `<a href="${p.link}" target="_blank" class="button ghost">Link</a>` : ''}
                <button class="button ghost" data-remove-date="${p.date}">Remover</button>
            </div>
        </div>
    `).join('') || '<div class="muted">Nenhuma folga-prova cadastrada</div>';

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Gerenciar Folgas — ${escapeHtml(intern.name)}</h3>
            <div>
                <button class="button ghost" id="btnBackToUser">Voltar</button>
                <button class="button ghost" id="btnCloseViewIntern">Fechar</button>
            </div>
        </div>
        <div style="margin-top:12px;padding-top:12px; border-top:1px solid #eee;">
            <div style="display:flex;gap:8px;align-items:center; margin-bottom: 12px;">
                <input type="date" id="mgrAddDate" />
                <input type="text" id="mgrAddLink" class="input" placeholder="Link da prova (opcional)" />
                <button id="mgrAddDateBtn" class="button">Adicionar</button>
            </div>
            <div id="mgrDates">${datesHtml}</div>
        </div>
    `;
    const m = showModal(html, { allowBackdropClose: false });

    m.modal.querySelector('#btnCloseViewIntern').addEventListener('click', () => { m.close(); m.cleanup(); });
    if(user) {
        m.modal.querySelector('#btnBackToUser').addEventListener('click', () => {
            m.close(); m.cleanup();
            openUserManagerView(user.id);
        });
    }

    m.modal.querySelector('#mgrAddDateBtn').addEventListener('click', async () => {
        const d = m.modal.querySelector('#mgrAddDate').value;
        const link = m.modal.querySelector('#mgrAddLink').value;
        if (!d) return alert('Escolha uma data');

        if (!((intern.dates || []).some(p => p.date === d))) {
            intern.dates = intern.dates || [];
            intern.dates.push({ date: d, link: link });
        }
        
        const manager = (state.users || []).find(u => u.id === session.userId);
        intern.auditLog = intern.auditLog || [];
        intern.auditLog.push({ id: uuid(), action: 'create_prova', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Adicionou folga-prova para a data ${d}` });
        
        await save(state);
        m.close(); m.cleanup();
        openInternManagerView(intern.id);
    });

    m.modal.querySelectorAll('[data-remove-date]').forEach(button => {
        button.addEventListener('click', async (e) => {
            const dateToRemove = e.target.dataset.removeDate;
            if (confirm(`Remover folga-prova de ${dateToRemove}?`)) {
                intern.dates = (intern.dates || []).filter(x => x.date !== dateToRemove);
                
                const manager = (state.users || []).find(u => u.id === session.userId);
                intern.auditLog = intern.auditLog || [];
                intern.auditLog.push({ id: uuid(), action: 'remove_prova', byUserId: manager.id, byUserName: manager.username, at: timestamp(), details: `Removeu folga-prova da data ${dateToRemove}` });
                
                await save(state);
                m.close(); m.cleanup();
                openInternManagerView(intern.id);
            }
        });
    });
}

function openInternHoursView(internId) {
    const intern = findInternById(internId);
    if (!intern) return;
    const user = findUserByIntern(intern.id);

    const hoursHtml = ((intern.hoursEntries) || []).slice().sort((a,b)=> b.date.localeCompare(a.date)).map(e => `
        <div class="row">
            <div style="flex-grow: 1;">
                <div style="font-weight:700">${e.date} • ${e.hours > 0 ? '+' : ''}${e.hours}h ${e.type === 'bank' ? '(Banco)' : '(Negativa)'} ${e.compensated ? '• Compensado' : ''}</div>
                <div class="muted small" style="margin-top:4px">${escapeHtml(e.reason || 'Sem justificativa')}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
                <div style="display:flex;gap:6px">
                    <button class="button ghost" data-edit-hours="${e.id}">Editar</button>
                    <button class="button" data-delete-hours="${e.id}">Excluir</button>
                </div>
                ${e.hours < 0 ? (e.compensated ? `<button class="button ghost" data-comp-hours="${e.id}">Desfazer comp.</button>` : `<button class="button" data-comp-hours="${e.id}">Marcar comp.</button>`) : ''}
            </div>
        </div>
    `).join('') || '<div class="muted">Nenhum lançamento de horas.</div>';

    const html = `
        <div style="display:flex;justify-content:space-between;align-items:center">
            <h3>Horas — ${escapeHtml(intern.name)}</h3>
            <div>
                <button class="button ghost" id="btnBackToUser">Voltar</button>
                <button class="button ghost" id="btnCloseHours">Fechar</button>
            </div>
        </div>
        <div style="margin-top:10px;padding-top:10px; border-top:1px solid #eee;">
            <div style="margin-bottom:12px;">
                <button id="btnAddHoursAdmin" class="button">Lançar horas</button>
            </div>
            <div id="mgrHoursList" style="max-height: 400px; overflow-y: auto;">${hoursHtml}</div>
        </div>
    `;

    const m = showModal(html, { allowBackdropClose: false });
    m.modal.querySelector('#btnCloseHours').addEventListener('click', () => { m.close(); m.cleanup(); });
    if(user) {
        m.modal.querySelector('#btnBackToUser').addEventListener('click', () => {
            m.close(); m.cleanup();
            openUserManagerView(user.id);
        });
    }

    m.modal.querySelector('#btnAddHoursAdmin').addEventListener('click', () => {
        showHourEntryForm(intern.id);
    });

    m.modal.querySelectorAll('[data-edit-hours]').forEach(btn => btn.addEventListener('click', e => showHourEntryForm(intern.id, e.target.dataset.editHours)));
    
    m.modal.querySelectorAll('[data-delete-hours]').forEach(btn => btn.addEventListener('click', async e => {
        if(confirm('Excluir este lançamento?')) {
            const entryId = e.target.dataset.deleteHours;
            intern.hoursEntries = (intern.hoursEntries || []).filter(x => x.id !== entryId);
            await save(state);
            m.close(); m.cleanup();
            openInternHoursView(intern.id);
        }
    }));

    m.modal.querySelectorAll('[data-comp-hours]').forEach(btn => btn.addEventListener('click', async e => {
        const entryId = e.target.dataset.compHours;
        const entry = (intern.hoursEntries || []).find(item => item.id === entryId);
        if(entry) {
            await markCompensated(intern.id, entryId, !entry.compensated);
            await save(state);
            m.close(); m.cleanup();
            openInternHoursView(intern.id);
        }
    }));
}

function showCreateUserForm(currentManager){
  if(!hasPower(currentManager,'create_intern') && currentManager.role!=='super') return alert('Sem permissão');
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>Criar usuário</h3><button id="closeC" class="button ghost">Fechar</button></div>
    <form id="formCreate" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      <label><span class="small-muted">Tipo</span><select id="newType"><option value="intern">Estagiário</option><option value="admin">Admin secundário</option></select></label>
      <div id="internFields">
        <label><span class="small-muted">Criar com</span>
          <select id="newIdType"><option value="matricula">Matrícula</option><option value="cpf">CPF</option></select>
        </label>
      </div>
      <label id="labelNewName"><span class="small-muted">Nome completo</span><input id="newName" required/></label>
      <label id="labelNewUser"><span class="small-muted">Usuário (login/matrícula)</span><input id="newUser" required/></label>
      <label style="position:relative;"><span class="small-muted">Senha</span>
        <input id="newPass" type="password" value="123456" style="padding-right: 36px;"/>
        <span class="password-toggle-icon" id="toggleNewPass">🔒</span>
      </label>
      <label class="form-check"><input type="checkbox" id="allowSelfPwd" checked/> Permitir alteração de senha</label>
      <div id="adminPowers" style="display:none">
        <div class="small-muted" style="margin-bottom: 8px;">Poderes do admin</div>
        <div class="form-check-group">
          <label class="form-check"><input type="checkbox" id="p_create"/> Criar estagiários</label>
          <label class="form-check"><input type="checkbox" id="p_edit"/> Editar usuários</label>
          <label class="form-check"><input type="checkbox" id="p_delete"/> Excluir usuários</label>
          <label class="form-check"><input type="checkbox" id="p_reset"/> Resetar senhas</label>
          <label class="form-check"><input type="checkbox" id="p_manage"/> Gerenciar horas</label>
          <label class="form-check"><input type="checkbox" id="p_provas"/> Gerenciar folgas-prova</label>
          <label class="form-check"><input type="checkbox" id="p_delegate" ${currentManager.role !== 'super' ? 'disabled' : ''}/> Delegar admins</label>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">Criar</button>
      </div>
    </form>
  `;
  const m = showModal(html, { allowBackdropClose: false });
  m.modal.querySelector('#closeC').addEventListener('click', ()=> { m.close(); m.cleanup(); });

  const toggle = m.modal.querySelector('#toggleNewPass');
  const passInput = m.modal.querySelector('#newPass');
  toggle.addEventListener('click', () => {
    const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passInput.setAttribute('type', type);
    toggle.textContent = type === 'password' ? '🔒' : '🔓';
  });

  const idTypeSelect = m.modal.querySelector('#newIdType');
  const userLabel = m.modal.querySelector('#labelNewUser .small-muted');
  const userInput = m.modal.querySelector('#newUser');

  const updateCreateUserField = () => {
    if (idTypeSelect.value === 'cpf') {
      userLabel.textContent = "CPF do estagiário";
      userInput.placeholder = "Apenas 11 números";
      userInput.maxLength = 11;
      userInput.oninput = () => { userInput.value = userInput.value.replace(/[^0-9]/g, ''); };
    } else {
      userLabel.textContent = "Matrícula do estagiário";
      userInput.placeholder = "ex: e123456";
      userInput.maxLength = 7;
      userInput.oninput = null;
    }
  };

  idTypeSelect.addEventListener('change', updateCreateUserField);

  m.modal.querySelector('#newType').addEventListener('change', (e)=> {
    const isIntern = e.target.value === 'intern';
    m.modal.querySelector('#internFields').style.display = isIntern ? 'block' : 'none';
    m.modal.querySelector('#adminPowers').style.display = isIntern ? 'none' : 'block';
    if (!isIntern) {
        userLabel.textContent = "Usuário (login)";
        userInput.placeholder = "";
        userInput.maxLength = 50;
        userInput.oninput = null;
        const defaultAdminPowers = defaultPowersFor('admin');
        m.modal.querySelector('#p_create').checked = defaultAdminPowers.create_intern;
        m.modal.querySelector('#p_edit').checked = defaultAdminPowers.edit_user;
        m.modal.querySelector('#p_delete').checked = defaultAdminPowers.delete_user;
        m.modal.querySelector('#p_reset').checked = defaultAdminPowers.reset_password;
        m.modal.querySelector('#p_manage').checked = defaultAdminPowers.manage_hours;
        m.modal.querySelector('#p_provas').checked = defaultAdminPowers.manage_provas;
        m.modal.querySelector('#p_delegate').checked = false;
    } else {
      updateCreateUserField();
    }
  });

  m.modal.querySelector('#formCreate').addEventListener('submit', async (ev)=> {
    ev.preventDefault();
    const type = m.modal.querySelector('#newType').value;
    const name = m.modal.querySelector('#newName').value.trim();
    const identifier = m.modal.querySelector('#newUser').value.trim();
    
    if(!name || !identifier) return alert('Nome e identificador (matrícula/CPF) são obrigatórios');

    const pass = m.modal.querySelector('#newPass').value || '123456';
    const allowSelf = !!m.modal.querySelector('#allowSelfPwd').checked;
    
    const manager = (state.users || []).find(u => u.id === session.userId);
    const creationDate = timestamp();

    if(type==='intern'){
      const idType = idTypeSelect.value;
      let newUsername, registrationData;

      if (idType === 'cpf') {
        if (identifier.length !== 11 || !/^\d+$/.test(identifier)) return alert('CPF inválido. Deve conter 11 números.');
        newUsername = `temp_${uuid().slice(0, 6)}`;
        registrationData = { cpf: identifier, enrollmentId: '' };
      } else { // matricula
        if (!/^[et]\d{6}$/i.test(identifier)) return alert("Matrícula inválida. Use 'e' ou 't' + 6 números.");
        newUsername = identifier;
        registrationData = { cpf: '', enrollmentId: identifier };
      }

      if (state.users.some(u => u.username.toLowerCase() === newUsername.toLowerCase())) {
        return alert(`O usuário/matrícula '${newUsername}' já existe.`);
      }

      const id = uuid();
      const newIntern = { id, name, dates: [], hoursEntries: [], auditLog: [], registrationData };
      (state.interns || []).push(newIntern);
      (state.users || []).push({ id: uuid(), username: newUsername, name, password: pass, role:'intern', internId: id, powers: defaultPowersFor('intern'), selfPasswordChange: allowSelf, createdAt: creationDate });
      newIntern.auditLog.push({ id: uuid(), action: 'create_user', byUserId: manager.id, byUserName: manager.username, at: creationDate, details: `Criou o perfil de estagiário '${name}' com ${idType}: ${identifier}.` });

    } else { // admin
      const p_create = m.modal.querySelector('#p_create').checked;
      const p_edit = m.modal.querySelector('#p_edit').checked;
      const p_delete = m.modal.querySelector('#p_delete').checked;
      const p_reset = m.modal.querySelector('#p_reset').checked;
      const p_manage = m.modal.querySelector('#p_manage').checked;
      const p_provas = m.modal.querySelector('#p_provas').checked;
      const p_delegate = m.modal.querySelector('#p_delegate').checked && currentManager.role==='super';
      const powers = { create_intern: p_create, edit_user: p_edit, delete_user: p_delete, reset_password: p_reset, manage_hours: p_manage, manage_provas: p_provas, delegate_admins: p_delegate };
      (state.users || []).push({ id: uuid(), username: identifier, name, password: pass, role:'admin', powers, selfPasswordChange: true, createdAt: creationDate });
      (state.systemLog || []).push({ id: uuid(), action: 'create_user', byUserId: manager.id, byUserName: manager.username, at: creationDate, details: `Criou o perfil de admin '${name}' (${identifier}).`, context: 'Gerenciamento de Usuários' });
    }
    await save(state);
    alert('Usuário criado');
    m.close();
    m.cleanup();
    render();
  });
  m.modal.querySelector('#newType').dispatchEvent(new Event('change'));
}

function showEditUserForm(userId){
  const u = (state.users || []).find(x=>x.id===userId); if(!u) return;
  const currentManager = (state.users || []).find(uu=>uu.id===session.userId);
  if(u.id !== currentManager.id && !hasPower(currentManager,'edit_user')) return alert('Sem permissão');
  if (u.role === 'super' && currentManager.role !== 'super') return alert('Apenas o Super Admin pode se editar.');
  const intern = u.internId ? findInternById(u.internId) : null;
  const isIntern = u.role === 'intern';
  const canEditPowers = currentManager.role === 'super' && !isIntern;
  let powersHtml = '';
  if (!isIntern) {
      powersHtml = `
        <div id="adminPowersEdit" style="margin-top:15px; border-top: 1px solid #eee; padding-top: 10px;">
          <div class="small-muted" style="margin-bottom: 8px;">Poderes do Admin</div>
          <div class="form-check-group">
            <label class="form-check"><input type="checkbox" id="p_create_edit" ${u.powers.create_intern ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Criar estagiários</label>
            <label class="form-check"><input type="checkbox" id="p_edit_edit" ${u.powers.edit_user ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Editar usuários</label>
            <label class="form-check"><input type="checkbox" id="p_delete_edit" ${u.powers.delete_user ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Excluir usuários</label>
            <label class="form-check"><input type="checkbox" id="p_reset_edit" ${u.powers.reset_password ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Resetar senhas</label>
            <label class="form-check"><input type="checkbox" id="p_manage_edit" ${u.powers.manage_hours ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Gerenciar horas</label>
            <label class="form-check"><input type="checkbox" id="p_provas_edit" ${u.powers.manage_provas ? 'checked' : ''} ${canEditPowers ? '' : 'disabled'}/> Gerenciar folgas</label>
            <label class="form-check"><input type="checkbox" id="p_delegate_edit" ${u.powers.delegate_admins ? 'checked' : ''} ${currentManager.role === 'super' && u.role !== 'super' ? '' : 'disabled'}/> Delegar admins</label>
          </div>
        </div>`;
  }
  const html = `
    <div style="display:flex;justify-content:space-between;align-items:center"><h3>Editar usuário</h3><button id="closeE" class="button ghost">Fechar</button></div>
    <form id="formEdit" style="margin-top:10px;display:flex;flex-direction:column;gap:10px">
      <label><span class="small-muted">Nome completo</span><input id="editName" value="${escapeHtml(isIntern ? intern?.name || '' : u.name || '')}" required/></label>
      <label><span class="small-muted">Usuário</span><input id="editUser" value="${escapeHtml(u.username)}" required/></label>
      <label><input type="checkbox" id="editAllowSelf" ${u.selfPasswordChange ? 'checked' : ''}/> Permitir auto-alteração de senha</label>
      ${powersHtml}
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" class="button">Salvar</button>
      </div>
    </form>
  `;
  const m = showModal(html, { allowBackdropClose: false });
  m.modal.querySelector('#closeE').addEventListener('click', ()=> { m.close(); m.cleanup(); });
  m.modal.querySelector('#formEdit').addEventListener('submit', async (ev)=> {
    ev.preventDefault();
    const newName = m.modal.querySelector('#editName').value.trim();
    const newUsername = m.modal.querySelector('#editUser').value.trim();
    if(!newName || !newUsername) return alert('Nome e usuário são obrigatórios');
    u.username = newUsername;
    u.name = newName;
    if(isIntern && intern){
      intern.name = newName;
    }
    u.selfPasswordChange = !!m.modal.querySelector('#editAllowSelf').checked;
    if (canEditPowers) {
        u.powers.create_intern = !!m.modal.querySelector('#p_create_edit').checked;
        u.powers.edit_user = !!m.modal.querySelector('#p_edit_edit').checked;
        u.powers.delete_user = !!m.modal.querySelector('#p_delete_edit').checked;
        u.powers.reset_password = !!m.modal.querySelector('#p_reset_edit').checked;
        u.powers.manage_hours = !!m.modal.querySelector('#p_manage_edit').checked;
        u.powers.manage_provas = !!m.modal.querySelector('#p_provas_edit').checked;
        if (currentManager.role === 'super' && u.role === 'admin') {
            u.powers.delegate_admins = !!m.modal.querySelector('#p_delegate_edit').checked;
        }
    }
    await save(state);
    alert('Atualizado');
    m.close();
    m.cleanup();
    render();
  });
}

function filterAndRenderProvas(){
  const date = document.getElementById('mgrFilterDate').value;
  const area = document.getElementById('provasResults'); if(!area) return;
  area.innerHTML='';
  if(!date){ area.innerHTML = '<div class="muted">Escolha uma data para filtrar</div>'; return; }
  const matched = (state.interns || []).filter(i=> (i.dates || []).some(p => p.date === date) );
  if(matched.length===0){ area.innerHTML = '<div class="muted">Nenhum estagiário com folga-prova nesta data</div>'; return; }
  matched.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).forEach(it=>{
    const row = document.createElement('div'); row.className='row';
    const prova = (it.dates || []).find(p => p.date === date);
    const left = `<div><div style="font-weight:700">${escapeHtml(it.name)}</div><div class="muted small">ID: ${it.id}</div></div>`;
    let right = `<div style="display:flex;gap:8px;"><button class="button ghost" data-view-id="${it.id}">Abrir</button></div>`;
    if(prova && prova.link){
        right = `<div style="display:flex;gap:8px;"><a href="${prova.link}" target="_blank" class="button">Link</a><button class="button ghost" data-view-id="${it.id}">Abrir</button></div>`;
    }
    row.innerHTML = left + right;
    row.querySelector('[data-view-id]').addEventListener('click', () => openInternManagerView(it.id));
    area.appendChild(row);
  });
}

function renderNameDropdown(q){
  const dropdown = document.getElementById('mgrNameDropdown');
  if(!dropdown) return;
  dropdown.innerHTML = '';
  if(!q || q.length < 1){ dropdown.style.display = 'none'; return; }
  const matches = (state.interns || []).filter(i => i.name.toLowerCase().includes(q)).slice(0,50);
  if(matches.length === 0){ dropdown.style.display = 'none'; return; }
  matches.forEach(it => {
    const item = document.createElement('div');
    item.style.padding = '8px';
    item.style.cursor = 'pointer';
    item.innerHTML = `<div style="font-weight:700">${escapeHtml(it.name)}</div><div class="muted small">${it.id}</div>`;
    item.addEventListener('click', ()=> {
      document.getElementById('mgrNameDropdown').style.display = 'none';
      document.getElementById('mgrNameSearch').value = '';
      openUserManagerView(findUserByIntern(it.id)?.id);
    });
    dropdown.appendChild(item);
  });
  dropdown.style.display = 'block';
}

function renderActivityLogs(filterDate = null) {
    const container = document.getElementById('logListContainer');
    if (!container) return;

    let allLogs = [];
    (state.interns || []).forEach(intern => {
        (intern.auditLog || []).forEach(log => {
            allLogs.push({ ...log, context: `Estagiário: ${intern.name}` });
        });
    });
    (state.systemLog || []).forEach(log => {
        allLogs.push({ ...log, context: log.context || 'Sistema' });
    });

    allLogs.sort((a, b) => new Date(b.at) - new Date(a.at));

    if (filterDate) {
        allLogs = allLogs.filter(log => log.at.startsWith(filterDate));
    }

    if (allLogs.length === 0) {
        container.innerHTML = '<div class="muted">Nenhum registro de log de atividade encontrado.</div>';
    } else {
        container.innerHTML = allLogs.map(log => {
            const date = new Date(log.at).toLocaleString('pt-BR');
            const logContext = log.context ? `[${escapeHtml(log.context)}]` : '';
            return `
                <div class="row" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div>
                        <span style="font-weight: 700;">${date}</span>
                        <span class="muted small">• Por: ${escapeHtml(log.byUserName)}</span>
                    </div>
                    <div>
                        <span>Ação: <strong style="color: var(--accent);">${escapeHtml(log.action)}</strong></span>
                        <span class="muted small">${logContext}</span>
                    </div>
                    <div class="muted small">Detalhes: ${escapeHtml(log.details || 'N/A')}</div>
                </div>
            `;
        }).join('');
    }
}

function renderLoginLogs(searchQuery = '', filterDate = '') {
    const container = document.getElementById('loginLogContainer');
    if (!container) return;

    let logs = (state.loginLog || []).slice();

    // Aplicar filtros
    if (searchQuery) {
        logs = logs.filter(log =>
            (log.name || '').toLowerCase().includes(searchQuery) ||
            (log.username || '').toLowerCase().includes(searchQuery)
        );
    }

    if (filterDate) {
        logs = logs.filter(log => log.at && log.at.startsWith(filterDate));
    }

    // Ordenar após filtrar
    logs.sort((a, b) => new Date(b.at) - new Date(a.at));

    if (logs.length === 0) {
        container.innerHTML = '<div class="muted">Nenhum registro de acesso encontrado para os filtros aplicados.</div>';
    } else {
        container.innerHTML = logs.map(log => {
            const date = new Date(log.at).toLocaleString('pt-BR');
            return `
                <div class="row" style="display: grid; grid-template-columns: auto 1fr auto; gap: 15px; align-items: center;">
                    <input type="checkbox" class="login-log-checkbox" data-id="${log.id}" style="width: auto; height: auto;">
                    <div>
                        <div style="font-weight: 700;">${escapeHtml(log.name)} (${escapeHtml(log.username)})</div>
                        <div class="muted small">IP: ${escapeHtml(log.ip)}</div>
                    </div>
                    <div class="muted small" style="text-align: right;">${date}</div>
                </div>
            `;
        }).join('');
    }
    
    document.querySelectorAll('.login-log-checkbox').forEach(cb => {
        cb.addEventListener('change', updateDeleteLoginLogsButtonState);
    });
}

function updateDeleteLoginLogsButtonState() {
    const selectedCount = document.querySelectorAll('.login-log-checkbox:checked').length;
    const deleteButton = document.getElementById('btnDeleteSelectedLoginLogs');
    if (deleteButton) {
        deleteButton.disabled = selectedCount === 0;
        deleteButton.textContent = `Apagar Selecionados (${selectedCount})`;
    }
}


function renderSystemLogs() {
    // Lógica das abas
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    renderActivityLogs();
    renderLoginLogs(); // Renderiza a nova aba

    // Listeners para os controles de logs de ATIVIDADE
    const btnApply = document.getElementById('btnApplyLogFilter');
    const btnClearFilter = document.getElementById('btnClearLogFilter');
    const btnClearLogs = document.getElementById('btnClearActivityLogs');
    
    btnApply.onclick = () => {
        const date = document.getElementById('logFilterDate').value;
        renderActivityLogs(date);
    };
    btnClearFilter.onclick = () => {
        document.getElementById('logFilterDate').value = '';
        renderActivityLogs();
    };
    btnClearLogs.onclick = async () => {
        if (confirm('ATENÇÃO: Deseja apagar TODOS os registros de ATIVIDADE? Esta ação é irreversível.')) {
            (state.interns || []).forEach(intern => { intern.auditLog = []; });
            state.systemLog = [];
            await save(state);
            alert('Logs de atividade limpos.');
            renderActivityLogs();
        }
    };

    // Listeners para os filtros e controles de logs de ACESSO (LOGIN)
    const searchInput = document.getElementById('loginLogSearchInput');
    const dateInput = document.getElementById('loginLogDateInput');
    const btnClearLoginFilter = document.getElementById('btnClearLoginLogFilter');

    const applyLoginFilters = () => {
        const query = searchInput.value.trim().toLowerCase();
        const date = dateInput.value;
        renderLoginLogs(query, date);
    };

    searchInput.addEventListener('keyup', applyLoginFilters);
    dateInput.addEventListener('change', applyLoginFilters);

    btnClearLoginFilter.addEventListener('click', () => {
        searchInput.value = '';
        dateInput.value = '';
        applyLoginFilters(); // Re-renderiza a lista completa
    });

    const selectAllLoginLogs = document.getElementById('selectAllLoginLogs');
    const btnDeleteSelected = document.getElementById('btnDeleteSelectedLoginLogs');
    const btnClearAll = document.getElementById('btnClearLoginLogs');

    selectAllLoginLogs.addEventListener('change', () => {
        document.querySelectorAll('.login-log-checkbox').forEach(cb => {
            cb.checked = selectAllLoginLogs.checked;
        });
        updateDeleteLoginLogsButtonState();
    });

    btnDeleteSelected.onclick = async () => {
        const checkedBoxes = document.querySelectorAll('.login-log-checkbox:checked');
        if (checkedBoxes.length === 0) return;
        if (confirm(`Deseja apagar os ${checkedBoxes.length} registros de acesso selecionados?`)) {
            const idsToDelete = new Set(Array.from(checkedBoxes).map(cb => cb.dataset.id));
            state.loginLog = state.loginLog.filter(log => !idsToDelete.has(log.id));
            await save(state);
            renderLoginLogs();
            updateDeleteLoginLogsButtonState();
            selectAllLoginLogs.checked = false;
        }
    };
    
    btnClearAll.onclick = async () => {
        if (confirm('ATENÇÃO: Deseja apagar TODO o histórico de acessos? Esta ação é irreversível.')) {
            state.loginLog = [];
            await save(state);
            alert('Histórico de acesso limpo.');
            renderLoginLogs();
            updateDeleteLoginLogsButtonState();
            selectAllLoginLogs.checked = false;
        }
    };
}
