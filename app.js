// Importa funções do Firestore (Banco de Dados) e Auth
import { db, auth } from "./firebase-config.js";
import { 
    collection, 
    addDoc, 
    getDocs, 
    getDoc, 
    setDoc,
    query, 
    orderBy,
    where,
    doc, 
    updateDoc, 
    deleteDoc,
    writeBatch,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ==================================================
// 0. ESTADO GLOBAL E CONFIGURAÇÕES PADRÃO
// ==================================================

// Função auxiliar para definir a cor do status
function getStatusClass(status) {
    if (!status) return 'status-pendente';
    const s = status.toLowerCase();
    
    if (s.includes('pendência') || s.includes('pendencia')) return 'status-pendente';
    if (s.includes('andamento')) return 'status-andamento';
    if (s.includes('audiência') || s.includes('audiencia')) return 'status-audiencia';
    if (s.includes('concluído') || s.includes('concluido')) return 'status-concluido';
    if (s.includes('prejudicado')) return 'status-prejudicado';
    
    return 'status-pendente'; // Cor padrão
}

// Lista padrão do sistema
const defaultProcedures = [
    { name: "Alimentos", sistema: true, docs: ["Comprovante de Renda", "Certidão de Nascimento"] },
    { name: "Exoneração de alimentos", sistema: true, docs: ["Sentença anterior"] },
    { name: "Divórcio", sistema: true, docs: ["Certidão de Casamento"] },
    { name: "Partilha de bens", sistema: true, docs: ["Lista de Bens", "Matrícula de Imóveis"] },
    { name: "Reconhecimento de união estável", sistema: true, docs: ["Provas da união"] },
    { name: "Dissolução de união estável", sistema: true, docs: ["Documento formal da união estável (escritura pública)"] },
    { name: "Reconhecimento e dissolução de união estável", sistema: true, docs: [] },
    { name: "Reconhecimento de paternidade", sistema: true, docs: ["Comprovante de Renda", "Exame pericial"] },
    { name: "Guarda", sistema: true, docs: [] },
    { name: "Visitas", sistema: true, docs: [] }
];

// Variáveis Globais
let listaProcedimentosGlobal = [...defaultProcedures];
let listaTemplatesGlobal = [];
let listaCategoriasGlobal = ["Geral"]; // Categoria padrão

// ==================================================
// FUNÇÃO GLOBAL DE LOGS
// ==================================================
async function registrarLog(acao, detalhes = "") {
    try {
        const usuario = auth.currentUser ? auth.currentUser.email : "Desconhecido";
        await addDoc(collection(db, "sistema_logs"), {
            acao: acao,
            usuario: usuario,
            detalhes: detalhes,
            data: new Date()
        });
        console.log("Log registrado:", acao);
    } catch (e) {
        console.error("Erro ao registrar log:", e);
    }
}

// Carregar Procedimentos
async function carregarProcedimentosDoBanco() {
    try {
        const docRef = doc(db, "configuracoes", "procedimentos");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            listaProcedimentosGlobal = docSnap.data().lista;
        } else {
            await setDoc(docRef, { lista: defaultProcedures });
            listaProcedimentosGlobal = [...defaultProcedures];
        }
    } catch (e) {
        console.error("Erro ao carregar configurações:", e);
        listaProcedimentosGlobal = [...defaultProcedures];
    }
}

// Carregar Templates e Categorias
async function carregarTemplatesDoBanco() {
    try {
        const docRef = doc(db, "configuracoes", "mensagens");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            listaTemplatesGlobal = data.templates || [];
            listaCategoriasGlobal = data.categories || ["Geral"];
        } else {
            // Cria dados iniciais se não existirem
            listaTemplatesGlobal = [{ 
                title: "Exemplo de Convite", 
                content: "Olá {{Destinatário}},\n\nInformamos que o processo {{Processo}} sobre {{Temática}} está agendado para {{Data}} às {{Hora}}.\n\nAtenciosamente.",
                category: "Geral"
            }];
            listaCategoriasGlobal = ["Geral", "Convites", "Andamento"];
            await setDoc(docRef, { templates: listaTemplatesGlobal, categories: listaCategoriasGlobal });
        }
    } catch (e) {
        console.error("Erro ao carregar templates:", e);
        listaTemplatesGlobal = [];
    }
}

// Helper para formatar lista de nomes (Ex: "João, Maria e José")
function formatarListaNomes(lista) {
    if (!lista || lista.length === 0) return "";
    // Filtra nomes vazios ou indefinidos
    const nomesLimpos = lista.filter(n => n && n.trim() !== "");
    
    if (nomesLimpos.length === 0) return "";
    if (nomesLimpos.length === 1) return nomesLimpos[0];
    
    const ultimo = nomesLimpos.pop();
    return nomesLimpos.join(", ") + " e " + ultimo;
}

// ==================================================
// 1. CONFIGURAÇÃO DE MENU E NAVEGAÇÃO
// ==================================================
const menuButtons = document.querySelectorAll('.menu-button');
const contentArea = document.getElementById('content-area');
const pageTitle = document.getElementById('page-title');
const sidebar = document.querySelector('.sidebar');
const btnCollapse = document.getElementById('btn-collapse');

// Inicialização
window.addEventListener('DOMContentLoaded', async () => {
    await carregarProcedimentosDoBanco();
    await carregarTemplatesDoBanco();
    
    // DETECTOR DE LOGIN: Assim que confirmar o usuário, carrega o Dashboard
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Carrega a tela de estatísticas como inicial
            loadScreen('estatisticas');
            
            // Inicia verificação de notificações
            setTimeout(() => { checkNotifications(); }, 1000);
        }
    });
});

if(btnCollapse){
    btnCollapse.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });
}

menuButtons.forEach(button => {
    button.addEventListener('click', () => {
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
        }
        button.classList.toggle('active');
        const submenu = button.nextElementSibling;
        if (submenu) submenu.classList.toggle('open');
    });
});

document.querySelectorAll('.submenu a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-target');
        const titleHTML = link.innerHTML;
        
        if(target !== 'detalhes-processo') {
            pageTitle.innerHTML = titleHTML;
        }
        loadScreen(target);
    });
});

document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth).then(() => window.location.reload());
});

// ==================================================
// 2. GERENCIADOR DE TELAS
// ==================================================
async function loadScreen(target, data = null) {
    contentArea.innerHTML = ''; 
    window.scrollTo(0,0); 

    // Garante que a lista está atualizada antes de abrir telas que dependem dela
    if (['adicionar-pre', 'configuracoes', 'detalhes-processo'].includes(target)) {
        if (listaProcedimentosGlobal.length === 0) await carregarProcedimentosDoBanco();
        if (listaTemplatesGlobal.length === 0) await carregarTemplatesDoBanco();
    }

    if (target === 'adicionar-pre') {
        renderScreenAdicionar();
    } else if (target === 'gerenciar-cadastros') {
        renderScreenGerenciar();
    } else if (target === 'lixeira') {
        renderScreenLixeira();
    } else if (target === 'configuracoes') {
        renderScreenConfiguracoes();
    } else if (target === 'detalhes-processo') {
        renderDetalhesProcesso(data);
    } else if (target === 'backup') {
        renderScreenBackup();
    } else if (target === 'logs') {
        renderScreenLogs();
    } else if (target === 'estatisticas') {
        renderScreenDashboard();
    } else if (target === 'agenda-geral') {
        renderScreenAgenda(); // <--- Adicionamos isso
    } else {
        // Padrão: Carrega o Dashboard (Início)
        renderScreenDashboard();
    }
}

// ==================================================
// 3. TELA: ADICIONAR PRÉ-PROCESSUAL (JA ABERTO)
// ==================================================
let procedimentosSelecionados = [];

function renderScreenAdicionar() {
    let optionsHtml = '<option value="">Escolher procedimento...</option>';
    listaProcedimentosGlobal.forEach(proc => {
        optionsHtml += `<option value="${proc.name}">${proc.name}</option>`;
    });

    const html = `
        <button id="btn-show-form" class="action-btn-main" style="display:none">
            <i class="fa-solid fa-plus"></i> Novo Pré-processual
        </button>
        
        <div id="msg-sucesso" class="hidden alert-success">
            <i class="fa-solid fa-check-circle"></i> Procedimento cadastrado com sucesso!
        </div>

        <div id="form-container" class="form-container">
            <div class="form-header">
                <h3>Ficha de Cadastro</h3>
                <button id="btn-cancel-form" style="background:none; border:none; cursor:pointer; color:red;">✖ Fechar</button>
            </div>
            <div class="form-body">
                <form id="form-cadastro">
                    
                    <div class="form-section-title">1. Dados do Pré-processual</div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Número na Planilha</label>
                            <input type="text" id="num_planilha" required>
                        </div>
                        <div class="form-group">
                            <label>Número do Processo</label>
                            <input type="text" id="num_processo">
                        </div>
                        <div class="form-group full-width">
                            <label>Tipo de Procedimento</label>
                            <div class="procedure-adder">
                                <select id="select-proc">
                                    ${optionsHtml}
                                </select>
                                <button type="button" id="btn-add-proc" class="btn-add-proc"><i class="fa-solid fa-plus"></i></button>
                            </div>
                            <div id="chips-area" class="chips-container"></div>
                        </div>
                    </div>

                    <div class="form-section-title">2. Pendências PJe</div>
                    <div class="form-grid">
                        <div class="form-group">
                            <label>Tem menor de idade?</label>
                            <select id="tem_menor" required>
                                <option value="nao">Não</option>
                                <option value="sim">Sim</option>
                            </select>
                        </div>
                        
                        <div class="form-group hidden" id="div-mp">
                            <label style="color: #d32f2f;">Cadastrou MP? (Obrigatório)</label>
                            <select id="cadastrou_mp" disabled>
                                <option value="">Selecione...</option>
                                <option value="sim">Sim</option>
                                <option value="nao">Não</option>
                            </select>
                        </div>
                        <div class="form-group hidden" id="div-qtd-menor">
                            <label>Quantos menores?</label>
                            <input type="number" id="qtd_menores" min="1" max="10" disabled>
                        </div>

                        <div class="form-group">
                            <label>Comprovante de Residência (DF?)</label>
                            <select id="residencia">
                                <option value="sim">Sim</option>
                                <option value="nao">Não</option>
                                <option value="pendente">Pendente</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-section-title">3. Dados do Solicitante</div>
                    <div class="form-grid">
                        <div class="form-group full-width">
                            <label>Nome Completo</label>
                            <input type="text" id="solic_nome" required>
                        </div>
                        <div class="form-group">
                            <label>CPF</label>
                            <input type="text" id="solic_cpf" class="input-cpf" placeholder="000.000.000-00" maxlength="14">
                        </div>
                        <div class="form-group">
                            <label>Telefone</label>
                            <div class="phone-group">
                                <select class="phone-ddi" id="solic_ddi">
                                    <option value="+55">+55 (BR)</option>
                                    <option value="+1">+1 (US)</option>
                                    <option value="+351">+351 (PT)</option>
                                </select>
                                <input type="text" id="solic_tel" class="input-phone" placeholder="(00) 00000-0000" maxlength="15">
                            </div>
                        </div>
                    </div>

                    <div class="form-section-title">4. Dados do Solicitado</div>
                    <div class="form-grid">
                        <div class="form-group full-width">
                            <label>Nome Completo</label>
                            <input type="text" id="req_nome" required>
                        </div>
                        <div class="form-group">
                            <label>CPF</label>
                            <input type="text" id="req_cpf" class="input-cpf" maxlength="14">
                        </div>
                        <div class="form-group">
                            <label>Telefone</label>
                            <div class="phone-group">
                                <select class="phone-ddi" id="req_ddi">
                                    <option value="+55">+55 (BR)</option>
                                    <option value="+1">+1 (US)</option>
                                    <option value="+351">+351 (PT)</option>
                                </select>
                                <input type="text" id="req_tel" class="input-phone" maxlength="15">
                            </div>
                        </div>
                    </div>

                    <div id="container-menores"></div>

                    <div class="form-actions">
                        <button type="submit" id="btn-salvar-cadastro" class="btn-save">Salvar Cadastro</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    contentArea.innerHTML = html;
    setupAdicionarEvents();
    aplicarMascaras();
}

function aplicarMascaras() {
    // 1. Máscara de CPF (Mantida igual)
    const cpfs = document.querySelectorAll('.input-cpf');
    cpfs.forEach(input => {
        input.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
        input.addEventListener('blur', (e) => {
            let v = e.target.value;
            if (v.length === 11) e.target.value = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        });
        input.addEventListener('focus', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
    });

    // 2. Máscara de Telefone (Atualizada para aceitar colar texto sujo)
    const phones = document.querySelectorAll('.input-phone');
    phones.forEach(input => {
        
        // --- NOVO: EVENTO DE COLAR (PASTE) ---
        input.addEventListener('paste', (e) => {
            e.preventDefault(); // Impede o colar padrão do navegador
            
            // Pega o texto que está na área de transferência
            const pasteData = (e.clipboardData || window.clipboardData).getData('text');
            
            // Limpa tudo que não for número (tira parênteses, traços, pontos, espaços)
            const cleanData = pasteData.replace(/\D/g, ''); 
            
            // Insere apenas os números limpos onde o cursor estiver
            if (document.queryCommandSupported('insertText')) {
                document.execCommand('insertText', false, cleanData);
            } else {
                input.value = cleanData; // Fallback para navegadores antigos
            }
        });

        // Evento de digitação normal (apenas números)
        input.addEventListener('input', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
        
        // Evento ao sair do campo (Formatar bonito)
        input.addEventListener('blur', (e) => {
            let v = e.target.value;
            // Formata celular (11 dígitos) ou fixo (10 dígitos)
            if (v.length === 11) e.target.value = v.replace(/^(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
            else if (v.length === 10) e.target.value = v.replace(/^(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
        });
        
        // Evento ao entrar no campo (Limpar formatação para editar)
        input.addEventListener('focus', (e) => e.target.value = e.target.value.replace(/\D/g, ''));
    });
}

function setupAdicionarEvents() {
    const btnShow = document.getElementById('btn-show-form');
    const btnCancel = document.getElementById('btn-cancel-form');
    const formContainer = document.getElementById('form-container');
    
    // Se clicar no botão (que começa oculto), mostra o form e esconde o botão
    btnShow.addEventListener('click', () => {
        formContainer.classList.remove('hidden');
        btnShow.style.display = 'none';
    });

    // Se clicar em fechar, esconde o form e MOSTRA o botão de volta
    btnCancel.addEventListener('click', () => {
        formContainer.classList.add('hidden');
        btnShow.style.display = 'flex';
    });

    procedimentosSelecionados = [];
    const btnAddProc = document.getElementById('btn-add-proc');
    const selectProc = document.getElementById('select-proc');
    const chipsArea = document.getElementById('chips-area');

    btnAddProc.addEventListener('click', () => {
        const valor = selectProc.value;
        if(valor && !procedimentosSelecionados.includes(valor)) {
            procedimentosSelecionados.push(valor);
            renderChips(chipsArea);
            selectProc.value = "";
        }
    });

    const selectMenor = document.getElementById('tem_menor');
    const divMp = document.getElementById('div-mp');
    const selectMp = document.getElementById('cadastrou_mp');
    const divQtd = document.getElementById('div-qtd-menor');
    const inputQtd = document.getElementById('qtd_menores');
    const containerMenores = document.getElementById('container-menores');

    selectMenor.addEventListener('change', (e) => {
        if(e.target.value === 'sim') {
            divMp.classList.remove('hidden');
            divQtd.classList.remove('hidden');
            selectMp.disabled = false;
            inputQtd.disabled = false;
            selectMp.setAttribute('required', 'true');
            inputQtd.setAttribute('required', 'true');
        } else {
            divMp.classList.add('hidden');
            divQtd.classList.add('hidden');
            selectMp.disabled = true;
            inputQtd.disabled = true;
            selectMp.removeAttribute('required');
            inputQtd.removeAttribute('required');
            selectMp.value = "";
            inputQtd.value = ""; 
            containerMenores.innerHTML = '';
        }
    });

    inputQtd.addEventListener('input', (e) => {
        const qtd = parseInt(e.target.value) || 0;
        let htmlMenores = '';
        for(let i = 1; i <= qtd; i++) {
            htmlMenores += `
                <div class="form-section-title" style="margin-top:20px; border-color:#ccc;">Dados do Menor #${i}</div>
                <div class="form-grid">
                    <div class="form-group full-width">
                        <label>Nome (Visão Protegida)</label>
                        <input type="text" class="input-menor-nome" placeholder="Digite o nome..." data-index="${i}">
                    </div>
                    <div class="form-group">
                        <label>Já possui CPF no sistema?</label>
                        <select class="input-menor-cpf-bool">
                            <option value="sim">Sim</option>
                            <option value="nao">Não</option>
                        </select>
                    </div>
                </div>
            `;
        }
        containerMenores.innerHTML = htmlMenores;
    });

    const formCadastro = document.getElementById('form-cadastro');
    
    formCadastro.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btnSalvar = document.getElementById('btn-salvar-cadastro');
        const textoOriginal = btnSalvar.textContent;
        
        btnSalvar.textContent = "Salvando...";
        btnSalvar.disabled = true;
        btnSalvar.style.background = "#999";

        try {
            const dados = {
                num_planilha: document.getElementById('num_planilha').value,
                num_processo: document.getElementById('num_processo').value,
                procedimentos: procedimentosSelecionados,
                tem_menor: document.getElementById('tem_menor').value,
                residencia: document.getElementById('residencia').value,
                solicitante: {
                    nome: document.getElementById('solic_nome').value,
                    cpf: document.getElementById('solic_cpf').value,
                    ddi: document.getElementById('solic_ddi').value,
                    tel: document.getElementById('solic_tel').value
                },
                solicitado: {
                    nome: document.getElementById('req_nome').value,
                    cpf: document.getElementById('req_cpf').value,
                    ddi: document.getElementById('req_ddi').value,
                    tel: document.getElementById('req_tel').value
                },
                status: 'Com Pendências',
                data_criacao: new Date(),
                data_ultima_movimentacao: new Date(),
                lixeira: false 
            };

            if (dados.tem_menor === 'sim') {
                dados.cadastrou_mp = document.getElementById('cadastrou_mp').value;
                dados.lista_menores = [];
                document.querySelectorAll('.input-menor-nome').forEach(input => {
                    dados.lista_menores.push({ nome: input.value });
                });
            }

            await addDoc(collection(db, "pre-processuais"), dados);
            
            // LOG NOVO
            await registrarLog("Novo Cadastro", `Criado processo ${dados.num_processo || 'S/N'} para ${dados.solicitante.nome}`);

            document.getElementById('form-container').classList.add('hidden');

            const msg = document.getElementById('msg-sucesso');
            msg.classList.remove('hidden');
            contentArea.scrollTop = 0;

            setTimeout(() => {
                renderScreenAdicionar(); 
                // Não precisamos mais clicar no botão pois já abre aberto
            }, 4000);

        } catch (error) {
            console.error("ERRO AO SALVAR:", error);
            alert("Erro ao salvar: " + error.message);
            
            btnSalvar.textContent = textoOriginal;
            btnSalvar.disabled = false;
            btnSalvar.style.background = "var(--col-success)";
        }
    });
}

function renderChips(container) {
    container.innerHTML = '';
    procedimentosSelecionados.forEach((proc, index) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        chip.innerHTML = `${proc} <span onclick="window.removerChip(${index})">✖</span>`;
        container.appendChild(chip);
    });
}

window.removerChip = function(index) {
    procedimentosSelecionados.splice(index, 1);
    const chipsArea = document.getElementById('chips-area');
    if(chipsArea) renderChips(chipsArea);
}

// ==================================================
// 4. TELA: GERENCIAR CADASTROS
// ==================================================
async function renderScreenGerenciar() {
    const pageTitle = document.getElementById('page-title');
    pageTitle.innerHTML = '<i class="fa-solid fa-list-check"></i> Gerenciar cadastros';

    contentArea.innerHTML = `
        <div class="filter-bar" style="display: flex; gap: 15px;">
            <div class="form-group" style="margin-bottom:0; flex: 2;">
                <input type="text" id="busca-tabela" placeholder="Pesquisar por Nome, Processo ou Planilha..." style="background:#f9f9f9; width: 100%;">
            </div>
            <div class="form-group" style="margin-bottom:0; flex: 1;">
                <select id="filtro-status" style="background:#f9f9f9; width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 8px; height: 100%;">
                    <option value="">Todos os Status</option>
                    <option value="Com Pendências">Com Pendências</option>
                    <option value="Em Andamento">Em Andamento</option>
                    <option value="Aguardando Audiência">Aguardando Audiência</option>
                    <option value="Concluído">Concluído</option>
                    <option value="Prejudicado">Prejudicado</option>
                </select>
            </div>
        </div>
        <div class="table-responsive">
            <table class="custom-table">
                <thead>
                    <tr>
                        <th>Nº Planilha</th>
                        <th>Processo</th>
                        <th>Solicitante</th>
                        <th>Solicitado</th>
                        <th>Últ. Mov</th>
                        <th>Status</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody id="tabela-corpo">
                    <tr><td colspan="7" style="text-align:center;">Carregando dados...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    try {
        const q = query(collection(db, "pre-processuais"));
        const querySnapshot = await getDocs(q);
        
        const tbody = document.getElementById('tabela-corpo');
        tbody.innerHTML = '';

        let listaProcessos = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.lixeira !== true) {
                listaProcessos.push({ id: docSnap.id, ...data });
            }
        });

        listaProcessos.sort((a, b) => {
            const numA = parseInt(a.num_planilha) || 0; 
            const numB = parseInt(b.num_planilha) || 0;
            return numA - numB;
        });

        if (listaProcessos.length > 0) {
            listaProcessos.forEach((data) => {
                const tr = document.createElement('tr');
                tr.className = 'linha-tabela'; 
                
                let dataMov = '-';
                if (data.data_ultima_movimentacao && data.data_ultima_movimentacao.toDate) {
                    dataMov = data.data_ultima_movimentacao.toDate().toLocaleDateString('pt-BR');
                } else if (data.data_criacao && data.data_criacao.toDate) {
                    dataMov = data.data_criacao.toDate().toLocaleDateString('pt-BR');
                }

                tr.innerHTML = `
                    <td>${data.num_planilha || '-'}</td>
                    <td>${data.num_processo || 'S/N'}</td>
                    <td>${data.solicitante.nome}</td>
                    <td>${data.solicitado.nome}</td>
                    <td style="font-size:0.85rem; color:#555;">${dataMov}</td>
                    <td><span class="status-badge ${getStatusClass(data.status)}">${data.status}</span></td>
                    <td style="display:flex; gap: 10px; align-items:center;">
                        <button class="btn-open-proc" data-id="${data.id}">
                            <i class="fa-solid fa-folder-open"></i>
                        </button>
                        <button class="btn-trash-icon" data-id="${data.id}" title="Mover para lixeira">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Nenhum cadastro ativo encontrado.</td></tr>';
        }

        // Filtro
        const inputBusca = document.getElementById('busca-tabela');
        const selectStatus = document.getElementById('filtro-status');

        const aplicarFiltros = () => {
            const termo = inputBusca.value.toLowerCase();
            const statusFiltro = selectStatus.value;
            const linhas = document.querySelectorAll('.linha-tabela');

            linhas.forEach(linha => {
                const textoLinha = linha.innerText.toLowerCase();
                const spanStatus = linha.querySelector('.status-badge');
                const statusTexto = spanStatus ? spanStatus.innerText.trim() : '';

                const bateTexto = textoLinha.includes(termo);
                const bateStatus = statusFiltro === "" || statusTexto === statusFiltro;

                if(bateTexto && bateStatus) {
                    linha.style.display = '';
                } else {
                    linha.style.display = 'none';
                }
            });
        };

        inputBusca.addEventListener('keyup', aplicarFiltros);
        selectStatus.addEventListener('change', aplicarFiltros);

        // Eventos
        document.querySelectorAll('.btn-trash-icon').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = btn.getAttribute('data-id');
                if(confirm("Mover este procedimento para a lixeira?")) {
                    await moverParaLixeira(id);
                }
            });
        });

        document.querySelectorAll('.btn-open-proc').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                loadScreen('detalhes-processo', id);
            });
        });

    } catch (e) {
        console.error("Erro ao ler tabela:", e);
        document.getElementById('tabela-corpo').innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Erro ao carregar dados.</td></tr>';
    }
}

// ==================================================
// 5. LIXEIRA
// ==================================================
async function moverParaLixeira(id) {
    try {
        const docRef = doc(db, "pre-processuais", id);
        await updateDoc(docRef, { lixeira: true });
        
        // LOG NOVO
        await registrarLog("Lixeira", `Moveu o item ID: ${id} para a lixeira`);

        renderScreenGerenciar(); 
    } catch (error) {
        alert("Erro ao mover para lixeira: " + error.message);
    }
}

async function renderScreenLixeira() {
    contentArea.innerHTML = `
        <div class="filter-bar" style="justify-content: space-between;">
            <h3><i class="fa-solid fa-trash-can"></i> Lixeira</h3>
            <button id="btn-esvaziar" class="action-btn-main" style="background:#d32f2f;">
                <i class="fa-solid fa-fire"></i> Esvaziar Lixeira
            </button>
        </div>
        <div class="table-responsive">
            <table class="custom-table">
                <thead>
                    <tr>
                        <th>Solicitante</th>
                        <th>Solicitado</th>
                        <th>Data Exclusão</th>
                        <th>Ação</th>
                    </tr>
                </thead>
                <tbody id="tabela-lixeira">
                    <tr><td colspan="4" style="text-align:center;">Carregando lixeira...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    try {
        const q = query(collection(db, "pre-processuais"), orderBy("data_criacao", "desc"));
        const querySnapshot = await getDocs(q);
        
        const tbody = document.getElementById('tabela-lixeira');
        tbody.innerHTML = '';
        let itensNaLixeira = [];

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.lixeira === true) {
                itensNaLixeira.push({ id: docSnap.id, ...data });
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${data.solicitante.nome}</td>
                    <td>${data.solicitado.nome}</td>
                    <td>-</td>
                    <td>
                        <button class="btn-restore" data-id="${docSnap.id}" style="padding:5px 10px; cursor:pointer;">
                            <i class="fa-solid fa-rotate-left"></i> Restaurar
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            }
        });

        if (itensNaLixeira.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">A lixeira está vazia.</td></tr>';
            document.getElementById('btn-esvaziar').disabled = true;
            document.getElementById('btn-esvaziar').style.opacity = 0.5;
        }

        document.querySelectorAll('.btn-restore').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                if(confirm("Restaurar este item?")) {
                    await updateDoc(doc(db, "pre-processuais", id), { lixeira: false });
                    renderScreenLixeira();
                }
            });
        });

        document.getElementById('btn-esvaziar').addEventListener('click', async () => {
            if(confirm("ATENÇÃO: Isso excluirá DEFINITIVAMENTE todos os itens da lixeira. Não é possível desfazer. Deseja continuar?")) {
                const btn = document.getElementById('btn-esvaziar');
                btn.innerText = "Excluindo...";
                
                const batch = writeBatch(db);
                
                itensNaLixeira.forEach(item => {
                    // 1. Marca para deletar do Banco de Dados
                    const ref = doc(db, "pre-processuais", item.id);
                    batch.delete(ref);

                    // 2. Limpa da Memória do Navegador (Onde salvamos o minimizar)
                    // Verifica se existe alguma chave no localStorage que contenha o ID desse processo
                    Object.keys(localStorage).forEach(key => {
                        if(key.includes(item.id)) {
                            localStorage.removeItem(key);
                        }
                    });
                });

                await batch.commit();
                alert("Lixeira esvaziada com sucesso!");
                renderScreenLixeira();
            }
        });

    } catch (e) {
        console.error(e);
        document.getElementById('tabela-lixeira').innerHTML = '<tr><td colspan="4">Erro ao carregar lixeira.</td></tr>';
    }
}

// ==================================================
// 6. TELA DE DETALHES DO PROCESSO (ATUALIZADA)
// ==================================================

function mascararNome(nome) {
    if(!nome) return '-';
    // Se o nome for curto (apenas 2 partes), mostra tudo, senão abrevia o meio
    const partes = nome.trim().split(' ');
    if (partes.length <= 2) return nome;
    
    // Retorna primeiro nome + abreviações do meio + último nome
    return partes.map((parte, index) => {
        if(index === 0 || index === partes.length - 1) return parte;
        return parte.charAt(0).toUpperCase() + '.';
    }).join(' ');
}

async function renderDetalhesProcesso(id) {
    contentArea.innerHTML = '<div style="text-align:center; padding:50px;">Carregando detalhes...</div>';

    try {
        const docRef = doc(db, "pre-processuais", id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            contentArea.innerHTML = '<h3>Erro: Processo não encontrado.</h3>';
            return;
        }

        const data = docSnap.data();
        const checklistData = data.checklist || {};
        const invitesData = data.controle_convites || {}; // Dados de convites
        
        // Garante objetos iniciais
        if (!data.solicitante) data.solicitante = { nome: '', cpf: '' };
        if (!data.solicitado) data.solicitado = { nome: '', cpf: '' };

        const getIniciais = (n) => {
            if(!n) return '';
            return n.split(' ').map(p => p[0]).join('').toUpperCase();
        };

    // Header e Título (ATUALIZADO COM BOTÃO AGENDA)
        const pageTitle = document.getElementById('page-title');
        pageTitle.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; width: 100%;">
                <div style="display:flex; align-items:center; gap:15px;">
                    <button id="btn-voltar-detalhes" class="btn-voltar-top" title="Voltar">
                        <i class="fa-solid fa-arrow-left"></i>
                    </button>
                    <span>Procedimento - ${data.num_processo || 'S/N'}</span>
                </div>
                
                <button id="btn-open-calendar-modal" title="Agendar Compromisso" 
                    style="margin-left: auto; background: #fff; border: 1px solid #ccc; color: var(--col-primary); width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display:flex; align-items:center; justify-content:center; transition:0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <i class="fa-regular fa-calendar-plus" style="font-size: 1.2rem;"></i>
                </button>
                
                <button id="btn-open-notes-modal" title="Anotações" 
                    style="margin-left: 10px; background: #fff; border: 1px solid #ccc; color: #e65100; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; display:flex; align-items:center; justify-content:center; transition:0.2s; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                    <i class="fa-solid fa-note-sticky" style="font-size: 1.2rem;"></i>
                </button>
            </div>
        `;

        setTimeout(() => {
            const btnVoltar = document.getElementById('btn-voltar-detalhes');
            if(btnVoltar) {
                btnVoltar.addEventListener('click', () => loadScreen('gerenciar-cadastros'));
            }
        }, 100);

        // Formatações
        const dataFormatada = data.data_criacao?.toDate ? data.data_criacao.toDate().toLocaleDateString('pt-BR') : '-';
        const tiposProcedimento = Array.isArray(data.procedimentos) ? data.procedimentos.join(", ") : "Não informado";
        const temMenor = data.tem_menor === 'sim' ? 'Sim' : 'Não';
        const temMP = data.cadastrou_mp === 'sim' ? 'Sim' : (data.tem_menor === 'sim' ? 'Não' : '-');
        
        let agendamentoDisplay = '-';
        if(data.agendamento) {
            const d = new Date(data.agendamento);
            if(!isNaN(d)) {
                agendamentoDisplay = d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
        }

        const summaryHtml = `
            <div class="proc-summary-bar" style="position: relative;">
                <div class="summary-grid-top">
                    <div class="sum-item"><span class="sum-label">Nº Planilha</span><span class="sum-value">#${data.num_planilha || '-'}</span></div>
                    <div class="sum-item"><span class="sum-label">Data Criação</span><span class="sum-value">${dataFormatada}</span></div>
                    <div class="sum-item"><span class="sum-label">Agendamento</span><span class="sum-value" style="color:var(--col-primary); font-weight:800;">${agendamentoDisplay}</span></div>
                    <div class="sum-item"><span class="sum-label">Procedimentos</span><span class="sum-value" style="font-size:0.85rem;">${tiposProcedimento}</span></div>
                    <div class="sum-item"><span class="sum-label">Status</span><span class="sum-value"><span class="status-tag-sm ${getStatusClass(data.status)}">${data.status}</span></span></div>
                    <div class="sum-item"><span class="sum-label">Menor?</span><span class="sum-value">${temMenor}</span></div>
                    <div class="sum-item"><span class="sum-label">MP?</span><span class="sum-value">${temMP}</span></div>
                </div>
                <button id="btn-open-edit-modal" class="btn-round-edit" title="Editar Informações"><i class="fa-solid fa-pencil"></i></button>
            </div>
        `;

        // ==========================================================
        // GERAÇÃO DA TABELA DE PARTICIPANTES (ORGANIZADA POR GRUPOS)
        // ==========================================================
        let rowsParticipantes = '';

        // Prepara lista auxiliar com índices originais para não quebrar o botão excluir
        const listaAuxiliar = (data.lista_menores || []).map((item, index) => ({ ...item, realIndex: index }));

        // Filtra os grupos
        const extrasSolicitantes = listaAuxiliar.filter(i => i.tipo_papel === 'Co-Solicitante');
        const extrasSolicitados = listaAuxiliar.filter(i => i.tipo_papel === 'Co-Solicitado');
        const outrosParticipantes = listaAuxiliar.filter(i => i.tipo_papel !== 'Co-Solicitante' && i.tipo_papel !== 'Co-Solicitado');

        // --- BLOCO 1: SOLICITANTES ---
        
        // 1.1 Solicitante Principal
        rowsParticipantes += `
            <tr>
                <td><b>${data.solicitante.nome || '(Vazio)'}</b><br><span style="color:#999; font-size:0.75rem;">CPF: ${data.solicitante.cpf || '-'}</span></td>
                <td><span class="tag-fixed" style="background:#e3f2fd; color:#1565c0;">Solicitante</span></td>
                <td style="text-align:center;"><div class="toggle-switch"></div></td>
                <td>
                    <div class="action-icon-group">
                        <button class="btn-mini btn-part-edit" data-type="solicitante"><i class="fa-solid fa-pencil"></i></button>
                        <button class="btn-mini btn-part-del" data-type="solicitante" title="Limpar dados"><i class="fa-solid fa-eraser"></i></button>
                    </div>
                </td>
            </tr>
        `;

        // 1.2 Extras Solicitantes (Aparecem logo abaixo)
        extrasSolicitantes.forEach(item => {
            rowsParticipantes += `
            <tr>
                <td><b>${mascararNome(item.nome)}</b><br><span style="color:#999; font-size:0.75rem;">${item.cpf ? 'CPF: '+item.cpf : '(Sem Doc)'}</span></td>
                <td><span class="tag-fixed" style="background:#e3f2fd; color:#1565c0;">Solicitante</span></td>
                <td style="text-align:center;"><div class="toggle-switch"></div></td>
                <td>
                    <div class="action-icon-group">
                        <button class="btn-mini btn-part-edit" data-type="menor" data-index="${item.realIndex}"><i class="fa-solid fa-pencil"></i></button>
                        <button class="btn-mini btn-part-del" data-type="menor" data-index="${item.realIndex}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });

        // --- BLOCO 2: SOLICITADOS ---

        // 2.1 Solicitado Principal
        rowsParticipantes += `
            <tr>
                <td><b>${data.solicitado.nome || '(Vazio)'}</b><br><span style="color:#999; font-size:0.75rem;">CPF: ${data.solicitado.cpf || '-'}</span></td>
                <td><span class="tag-fixed" style="background:#fff3e0; color:#ef6c00;">Solicitado</span></td>
                <td style="text-align:center;"><div class="toggle-switch"></div></td>
                <td>
                    <div class="action-icon-group">
                        <button class="btn-mini btn-part-edit" data-type="solicitado"><i class="fa-solid fa-pencil"></i></button>
                        <button class="btn-mini btn-part-del" data-type="solicitado" title="Limpar dados"><i class="fa-solid fa-eraser"></i></button>
                    </div>
                </td>
            </tr>
        `;

        // 2.2 Extras Solicitados (Aparecem logo abaixo)
        extrasSolicitados.forEach(item => {
            rowsParticipantes += `
            <tr>
                <td><b>${mascararNome(item.nome)}</b><br><span style="color:#999; font-size:0.75rem;">${item.cpf ? 'CPF: '+item.cpf : '(Sem Doc)'}</span></td>
                <td><span class="tag-fixed" style="background:#fff3e0; color:#ef6c00;">Solicitado</span></td>
                <td style="text-align:center;"><div class="toggle-switch"></div></td>
                <td>
                    <div class="action-icon-group">
                        <button class="btn-mini btn-part-edit" data-type="menor" data-index="${item.realIndex}"><i class="fa-solid fa-pencil"></i></button>
                        <button class="btn-mini btn-part-del" data-type="menor" data-index="${item.realIndex}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });

        // --- BLOCO 3: OUTROS / MENORES ---
        outrosParticipantes.forEach(item => {
            rowsParticipantes += `
            <tr>
                <td><b>${mascararNome(item.nome)}</b><br><span style="color:#999; font-size:0.75rem;">${item.cpf ? 'CPF: '+item.cpf : '(Sem Doc)'}</span></td>
                <td><span class="tag-fixed" style="background:#f5f5f5; color:#666;">Outro / Menor</span></td>
                <td style="text-align:center;"><div class="toggle-switch"></div></td>
                <td>
                    <div class="action-icon-group">
                        <button class="btn-mini btn-part-edit" data-type="menor" data-index="${item.realIndex}"><i class="fa-solid fa-pencil"></i></button>
                        <button class="btn-mini btn-part-del" data-type="menor" data-index="${item.realIndex}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            </tr>`;
        });

        const participantsHtml = `
            <div class="participants-card">
                <div class="part-header">Lista de Participantes</div>
                <table class="simple-table">
                    <thead><tr><th>Nome / Documento</th><th>Tipo</th><th style="text-align:center;">Senha</th><th>Ações</th></tr></thead>
                    <tbody>${rowsParticipantes}</tbody>
                </table>
                <div style="overflow: hidden; margin-top: 10px;">
                    <button id="btn-add-part" class="btn-add-blue"><i class="fa-solid fa-plus"></i> Adicionar participante</button>
                </div>
            </div>
        `;

// GERAÇÃO DE MENSAGENS E MODAIS
        // 1. Configura a lista de destinatários com "Geral" como padrão
        let optionsDest = `<option value="GERAL" selected>Geral</option>`;
        optionsDest += `<option value="ALL_SOLICITANTES" style="font-weight:bold; color:var(--col-primary);">Solicitante Geral (Todos)</option>`;
        optionsDest += `<option value="ALL_SOLICITADOS" style="font-weight:bold; color:var(--col-primary);">Solicitado Geral (Todos)</option>`;
        optionsDest += `<option disabled>──────────</option>`;
        
        // Adiciona os nomes específicos
        optionsDest += `<option value="solicitante">Solicitante: ${data.solicitante.nome.split(' ')[0]}</option>`;
        optionsDest += `<option value="solicitado">Solicitado: ${data.solicitado.nome.split(' ')[0]}</option>`;
        if(data.lista_menores) {
            data.lista_menores.forEach((m, idx) => {
                let roleLabel = "Outro";
                if(m.tipo_papel === 'Co-Solicitante') roleLabel = "Solicitante";
                else if(m.tipo_papel === 'Co-Solicitado') roleLabel = "Solicitado";
                
                optionsDest += `<option value="menor:${idx}">${roleLabel}: ${m.nome.split(' ')[0]}</option>`;
            });
        }

        let optionsCats = `<option value="">Todas as categorias</option>`;
        listaCategoriasGlobal.forEach(cat => optionsCats += `<option value="${cat}">${cat}</option>`);

        const generatorHtml = `
            <style>
                .result-wrapper { position: relative; }
                .btn-copy-hover {
                    position: absolute; top: 32px; right: 10px;
                    background: rgba(255, 255, 255, 0.9); border: 1px solid #cbd5e1;
                    border-radius: 4px; width: 32px; height: 32px;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; color: #64748b; opacity: 0; visibility: hidden;
                    transition: all 0.2s ease; z-index: 5; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                }
                .btn-copy-hover:hover { background: #f1f5f9; color: var(--col-primary); transform: scale(1.1); }
                .result-wrapper:hover .btn-copy-hover { opacity: 1; visibility: visible; }
                
                /* Estilo para a mensagem de feedback */
                #gen-feedback-msg {
                    font-size: 0.8rem;
                    color: #2e7d32; /* Verde Sucesso */
                    margin-top: 5px;
                    min-height: 1.2em; /* Reserva espaço para não pular tela */
                    font-weight: 600;
                    text-align: right;
                }
            </style>

            <div class="construction-box" style="border: 1px solid #e2e8f0; background: #fff; padding: 20px; align-items: stretch; text-align: left; min-height: auto;">
                <h3 style="margin-bottom: 15px; color: var(--col-primary); display:flex; align-items:center; gap:10px;">
                    <i class="fa-solid fa-envelope-open-text"></i> Gerador de Mensagens
                </h3>
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                    <div class="form-group"><label>1. Quem receberá?</label><select id="gen-destinatario" style="background:#f8fafc;">${optionsDest}</select></div>
                    <div class="form-group"><label>2. Filtrar Categoria</label><select id="gen-cat-filter" style="background:#f8fafc;">${optionsCats}</select></div>
                    <div class="form-group full-width">
                        <label>3. Escolher Modelo</label>
                        <select id="gen-modelo" style="background:#f8fafc;">
                            <option value="ALEATORIO" selected>Aleatório</option>
                        </select>
                    </div>
                </div>

                <div class="form-group" style="display: flex; justify-content: flex-end;">
                    <button id="btn-gerar-msg" class="action-btn-main" style="display:inline-flex;align-items:center;gap:6px;height:40px;padding:4px 8px;font-size:11px;">
                    <i class="fa-solid fa-wand-magic-sparkles" style="font-size:14px;transform:translateY(4px);line-height:1;"></i>
                    Gerar Mensagem
                    </button>
                </div>

                <div id="gen-feedback-msg"></div>

                <div class="form-group result-wrapper" style="margin-top:5px;">
                    <label>Resultado (Copie e cole)</label>
                    <textarea id="gen-resultado" rows="8" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px; font-family:sans-serif; background:#f1f5f9;"></textarea>
                    
                    <button id="btn-copy-msg" class="btn-copy-hover" title="Copiar Texto">
                        <i class="fa-regular fa-copy" style="position:relative; top:5px; font-size:20px;"></i>
                    </button>
                </div>
            </div>
        `;

        // ==========================================================
        //  NOVA SEÇÃO: CONTROLE DE CONVITES
        // ==========================================================
        let invitesHtml = '';
        
        // 1. Coleta todos os participantes para a lista
        let allInviteParticipants = [];
        // Solicitante Main
        allInviteParticipants.push({ name: data.solicitante.nome, role: 'solicitante', type: 'Solicitante' });
        // Solicitado Main
        allInviteParticipants.push({ name: data.solicitado.nome, role: 'solicitado', type: 'Solicitado' });
        // Extras
        if(data.lista_menores) {
            data.lista_menores.forEach((m, idx) => {
                if(m.tipo_papel === 'Co-Solicitante') allInviteParticipants.push({ name: m.nome, role: `extra_solicitante_${idx}`, type: 'Solicitante' });
                if(m.tipo_papel === 'Co-Solicitado') allInviteParticipants.push({ name: m.nome, role: `extra_solicitado_${idx}`, type: 'Solicitado' });
            });
        }

        // Helper para bolinhas
        const renderInviteDots = (d1, d2, d3) => {
            const styleDot = (active) => `width: 24px; height: 24px; border-radius: 50%; background-color: ${active ? '#2e7d32' : '#e0e0e0'}; color: ${active ? '#fff' : '#999'}; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; transition: all 0.2s; cursor: default;`;
            const titleDot = (val) => val ? `Enviado em: ${val.split('-').reverse().join('/')}` : 'Não enviado';
            return `
                <div style="display:flex; gap:5px;">
                    <div title="${titleDot(d1)}" style="${styleDot(d1)}">1</div>
                    <div title="${titleDot(d2)}" style="${styleDot(d2)}">2</div>
                    <div title="${titleDot(d3)}" style="${styleDot(d3)}">3</div>
                </div>
            `;
        };

        // Helper para Status Texto
        const renderInviteStatus = (status) => {
            if(!status || status === 'Pendente') return `<span style="color:#f57c00; font-weight:bold; font-size:0.8rem;">Pendente</span>`;
            if(status === 'Aceito') return `<span style="color:#2e7d32; font-weight:bold; font-size:0.8rem;">Aceito</span>`;
            if(status === 'Recusado') return `<span style="color:#c62828; font-weight:bold; font-size:0.8rem;">Recusado</span>`;
            return `<span style="color:#666; font-weight:bold; font-size:0.8rem;">${status}</span>`;
        };

        // Gera o HTML da lista
        let invitesListHtml = '';
        allInviteParticipants.forEach(p => {
            const pData = invitesData[p.role] || {}; // Pega dados salvos ou vazio
            
            // Define cor da tag de tipo
            let bgTag = '#eee'; let colorTag = '#333';
            if(p.type.includes('Solicitante')) { bgTag = '#e3f2fd'; colorTag = '#1565c0'; }
            if(p.type.includes('Solicitado')) { bgTag = '#fff3e0'; colorTag = '#ef6c00'; }

            invitesListHtml += `
                <div style="display:flex; justify-content:space-between; align-items:center; padding: 12px; border-bottom: 1px solid #f0f0f0;">
                    <div>
                        <div style="font-weight:bold; color:#333;">${p.name || '(Sem Nome)'}</div>
                        <div style="margin-top:4px;"><span style="background:${bgTag}; color:${colorTag}; font-size:0.7rem; padding:2px 6px; border-radius:4px;">${p.type}</span></div>
                    </div>
                    <div style="display:flex; align-items:center; gap:15px;">
                        ${renderInviteStatus(pData.status)}
                        ${renderInviteDots(pData.d1, pData.d2, pData.d3)}
                        <button class="btn-mini btn-edit-invite" data-role="${p.role}" data-name="${p.name}" style="border:1px solid #ddd; background:white; border-radius:4px; padding:6px; cursor:pointer;">
                            <i class="fa-solid fa-pencil"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        invitesHtml = `
            <div style="background: #fff; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-top: 3px solid #000; padding: 20px; margin-top: 30px;">
                <h3 style="text-align: center; margin-bottom: 20px; font-weight: 800; text-transform: uppercase; font-size: 1rem; color: #333;">Controle de Convites</h3>
                <div style="border: 1px solid #e0e0e0; border-radius: 6px; max-height: 300px; overflow-y: auto;">
                    ${invitesListHtml}
                </div>
            </div>
        `;

        // Modais
        let editProcOptions = '<option value="">Escolher...</option>';
        listaProcedimentosGlobal.forEach(proc => { editProcOptions += `<option value="${proc.name}">${proc.name}</option>`; });
        
        const modalGeneralHtml = `
            <div id="edit-modal" class="modal-overlay hidden">
                <div class="modal-content">
                    <div class="modal-header"><h3>Editar Resumo</h3><button id="btn-close-modal" class="btn-close-modal">✖</button></div>
                    <div class="form-body" style="padding:0; max-height:60vh; overflow-y:auto;">
                        <div class="form-section-title" style="margin-top:0;">1. Informações Gerais</div>
                        <div class="form-grid" style="grid-template-columns: 1fr;">
                            <div class="form-group"><label>Nº Planilha</label><input type="text" id="edit-planilha" value="${data.num_planilha || ''}"></div>
                            <div class="form-group"><label>Nº Processo</label><input type="text" id="edit-processo" value="${data.num_processo || ''}"></div>
                            <div class="form-group"><label>Agendamento Prévio</label><input type="datetime-local" id="edit-agendamento" value="${data.agendamento || ''}"></div>
                            <div class="form-group"><label>Status</label><select id="edit-status"><option value="Com Pendências" ${data.status === 'Com Pendências' ? 'selected' : ''}>Com Pendências</option><option value="Em Andamento" ${data.status === 'Em Andamento' ? 'selected' : ''}>Em Andamento</option><option value="Aguardando Audiência" ${data.status === 'Aguardando Audiência' ? 'selected' : ''}>Aguardando Audiência</option><option value="Concluído" ${data.status === 'Concluído' ? 'selected' : ''}>Concluído</option><option value="Prejudicado" ${data.status === 'Prejudicado' ? 'selected' : ''}>Prejudicado</option></select></div>
                            <div class="form-grid"><div class="form-group"><label>Menor?</label><select id="edit-menor"><option value="sim" ${data.tem_menor === 'sim' ? 'selected' : ''}>Sim</option><option value="nao" ${data.tem_menor === 'nao' ? 'selected' : ''}>Não</option></select></div><div class="form-group"><label>MP?</label><select id="edit-mp"><option value="sim" ${data.cadastrou_mp === 'sim' ? 'selected' : ''}>Sim</option><option value="nao" ${data.cadastrou_mp === 'nao' ? 'selected' : ''}>Não</option></select></div></div>
                        </div>
                        <div class="form-section-title">2. Procedimentos</div>
                        <div class="form-group"><label>Adicionar Procedimento</label><div class="procedure-adder"><select id="edit-select-proc">${editProcOptions}</select><button type="button" id="btn-add-proc-edit" class="btn-add-proc"><i class="fa-solid fa-plus"></i></button></div><div id="edit-chips-area" class="chips-container" style="margin-top:10px;"></div></div>
                    </div>
                    <div class="modal-actions"><button id="btn-cancel-edit" class="btn-voltar">Cancelar</button><button id="btn-save-edit" class="btn-save">Salvar Alterações</button></div>
                </div>
            </div>
        `;

        const modalPartHtml = `
            <div id="part-modal" class="modal-overlay hidden">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header"><h3>Dados do Participante</h3><button id="btn-close-part" class="btn-close-modal">✖</button></div>
                    <div class="form-grid" style="grid-template-columns: 1fr;">
                        <div class="form-group"><label>Nome Completo</label><input type="text" id="part-nome"></div>
                        <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="form-group"><label>CPF / Documento</label><input type="text" id="part-cpf" class="input-cpf"></div>
                            <div class="form-group" id="div-part-tel"><label>Telefone</label><div class="phone-group"><select class="phone-ddi" id="part-ddi"><option value="+55">+55</option><option value="+1">+1</option><option value="+351">+351</option></select><input type="text" id="part-tel" class="input-phone" placeholder="(00) 00000-0000"></div></div>
                        </div>
                        <div class="form-group"><label>Tipo de Papel</label>
                            <select id="part-tipo">
                                <option value="solicitante">Solicitante (Principal)</option>
                                <option value="solicitado">Solicitado (Principal)</option>
                                <option value="menor">Outro / Menor</option>
                            </select>
                            <small style="color:#666; font-size:0.8rem; display:block; margin-top:5px;">
                                * Se já houver um principal, novos serão adicionados abaixo dele.
                            </small>
                        </div>
                        <input type="hidden" id="part-index"> 
                    </div>
                    <div class="modal-actions"><button id="btn-save-part" class="btn-save">Salvar Participante</button></div>
                </div>
            </div>
        `;

        // NOVO MODAL PARA CONVITES
        const modalInvitesHtml = `
            <div id="invite-modal" class="modal-overlay hidden">
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header"><h3 id="invite-modal-title">Gerenciar Convites</h3><button id="btn-close-invite" class="btn-close-modal">✖</button></div>
                    <div class="form-body">
                        <input type="hidden" id="invite-role-key">
                        <div class="form-group">
                            <label>Data do 1º Convite</label>
                            <input type="date" id="invite-d1" style="width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Data do 2º Convite</label>
                            <input type="date" id="invite-d2" style="width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Data do 3º Convite</label>
                            <input type="date" id="invite-d3" style="width:100%;">
                        </div>
                        <div class="form-group">
                            <label>Status Atual</label>
                            <select id="invite-status" style="width:100%;">
                                <option value="Pendente">Pendente</option>
                                <option value="Aceito">Aceito (Confirmado)</option>
                                <option value="Recusado">Recusado</option>
                                <option value="Frustrado">Frustrado (Sem Resposta)</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button id="btn-save-invite" class="btn-save">Salvar</button>
                    </div>
                </div>
            </div>
        `;

        // NOVO MODAL: AGENDAMENTO COM ABAS (NOVO x HISTÓRICO)
        const modalCalendarHtml = `
            <div id="calendar-modal" class="modal-overlay hidden">
                <div class="modal-content" style="max-width: 500px; display:flex; flex-direction:column; max-height:85vh;">
                    <div class="modal-header" style="border-bottom:none; padding-bottom:0;">
                        <h3><i class="fa-regular fa-calendar-plus"></i> Agendamentos</h3>
                        <button id="btn-close-calendar" class="btn-close-modal">✖</button>
                    </div>
                    
                    <div class="config-tabs" style="padding:0 20px; margin-top:10px;">
                        <button class="tab-btn active" id="tab-btn-novo" style="flex:1; text-align:center;">Novo Agendamento</button>
                        <button class="tab-btn" id="tab-btn-lista" style="flex:1; text-align:center;">Eventos Agendados</button>
                    </div>

                    <div id="tab-content-novo" class="form-body">
                        <div class="form-group">
                            <label>O que será feito?</label>
                            <select id="event-type" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; margin-bottom:10px;">
                                <option value="">Selecione uma ação padrão...</option>
                                <option value="Enviar 1º Convite">Enviar 1º Convite</option>
                                <option value="Enviar 2º Convite">Enviar 2º Convite</option>
                                <option value="Enviar 3º Convite">Enviar 3º Convite</option>
                                <option value="Solicitar Documentos">Solicitar Documentos</option>
                                <option value="Audiência de Mediação">Audiência de Mediação</option>
                                <option value="Audiência de Conciliação">Audiência de Conciliação</option>
                                <option value="Outro">Outro (Personalizado)</option>
                            </select>
                            <input type="text" id="event-title" placeholder="Descreva se for 'Outro'..." style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; display:none;">
                        </div>

                        <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap:15px;">
                            <div class="form-group">
                                <label>Data</label>
                                <input type="date" id="event-date" style="width:100%;">
                            </div>
                            <div class="form-group">
                                <label>Hora (Opcional)</label>
                                <input type="time" id="event-time" style="width:100%;">
                            </div>
                        </div>

                        <div class="form-group">
                            <label>Observações</label>
                            <textarea id="event-obs" rows="3" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px;"></textarea>
                        </div>
                        
                        <div class="modal-actions">
                            <button id="btn-save-event" class="btn-save" style="background: var(--col-primary); width:100%;">Agendar Compromisso</button>
                        </div>
                    </div>

                    <div id="tab-content-lista" class="form-body hidden" style="overflow-y:auto; background:#f8fafc; padding:15px; min-height:300px;">
                        <div id="lista-eventos-proc">
                            <p style="text-align:center; color:#999; margin-top:20px;">Carregando...</p>
                        </div>
                    </div>

                </div>
            </div>
        `;

        // ==========================================================
        //  BLOCO CHECKLIST RESTAURADO (DO OLDAPP.JS) + CORREÇÃO MULTIPLOS
        // ==========================================================

        const modalChecklistHtml = `
            <div id="checklist-modal" class="modal-overlay hidden">
                <div class="modal-content">
                    <div class="modal-header"><h3 id="checklist-modal-title">Editar Documentos</h3><button id="btn-close-checklist" class="btn-close-modal">✖</button></div>
                    <div class="form-body" id="checklist-form-body" style="padding:20px; max-height: 500px; overflow-y: auto;"></div>
                    <div class="modal-actions" style="justify-content: space-between;">
                        <button id="btn-add-doc-extra" style="background: #607d8b; color:white; border:none; padding:10px 15px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:5px;">
                            <i class="fa-solid fa-plus"></i> Outro documento
                        </button>
                        <button id="btn-save-checklist" class="btn-save">Salvar</button>
                    </div>
                </div>
            </div>
        `;

        const renderSummaryLine = (label, status, d1, d2, d3, naoEnc) => {
            let colorHex = "#f57f17"; // Cor Padrão (Pendente)
            
            // --- NOVA LÓGICA DE FUNDO (BACKGROUND) ---
            let rowBg = "transparent"; 
            let rowBorder = "border-bottom: 1px solid #f0f0f0;"; // Estilo original para Pendente
            
            if(status === 'Sim') {
                colorHex = "#2e7d32"; 
                rowBg = "#e8f5e9"; // Verde clarinho
                rowBorder = "border: 1px solid #c8e6c9;"; // Borda verde suave
            } 
            else if(status === 'Não') {
                colorHex = "#d32f2f"; 
                rowBg = "#ffebee"; // Vermelho clarinho
                rowBorder = "border: 1px solid #ffcdd2;"; // Borda vermelha suave
            } 
            else if(status === 'Dispensado') {
                colorHex = "#999";
            }

            let styleStatus = `font-weight:bold; color:${colorHex};`;
            let styleLabel = `font-weight:700; color:${colorHex};`;

            if(status === 'Dispensado') {
                styleStatus += " text-decoration: line-through;";
                styleLabel += " text-decoration: line-through;";
            }

            let stepsHtml = '';
            if (status !== 'Dispensado') {
                const fmt = (d) => d ? d.split('-').reverse().join('/') : '';
                const makeStep = (dateVal, number) => {
                    const active = !!dateVal;
                    const bgColor = active ? '#2e7d32' : '#e0e0e0'; 
                    const txtColor = active ? '#fff' : '#999';      
                    const tooltip = active ? `title="Enviado em: ${fmt(dateVal)}"` : 'title="Não solicitado"';
                    const cursor = active ? 'cursor: help;' : 'cursor: default;';
                    return `<div ${tooltip} style="width: 24px; height: 24px; border-radius: 50%; background-color: ${bgColor}; color: ${txtColor}; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold; ${cursor} transition: all 0.2s;">${number}</div>`;
                };
                let naoEncHtml = naoEnc ? `<span style="background-color: #ffebee; color: #c62828; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 12px; border: 1px solid #ffcdd2; margin-left: 10px;"><i class="fa-solid fa-ban"></i> Não enviado</span>` : '';
                
                // Adicionei um padding-left extra nos passos para alinhar melhor dentro do box colorido
                stepsHtml = `<div style="display:flex; align-items:center; gap:8px; margin-top:8px; padding-left: 32px;">
                                <span style="font-size:0.75rem; color:#777; margin-right:5px;">Solicitações:</span>${makeStep(d1, '1')}${makeStep(d2, '2')}${makeStep(d3, '3')}${naoEncHtml}
                             </div>`;
            }

            // AQUI APLICAMOS AS CORES DE FUNDO NA DIV PRINCIPAL
            return `
                <div class="doc-summary-row" style="margin-bottom:8px; font-size:0.9rem; padding: 10px; border-radius: 6px; transition: all 0.3s; background-color: ${rowBg}; ${rowBorder}">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center;">
                            <button class="btn-toggle-blur" onclick="this.closest('.doc-summary-row').classList.toggle('doc-blur-effect')" title="Ofuscar/Desofuscar linha">
                                <i class="fa-regular fa-eye-slash"></i>
                            </button>
                            <span style="${styleLabel}">${label}</span>
                        </div>
                        <span style="${styleStatus} font-size:0.85rem;">${status || 'Pendente'}</span>
                    </div>
                    ${stepsHtml}
                </div>
            `;
        };

        const renderBoxContent = (proc, tipo) => {
            const dados = checklistData[proc]?.[tipo] || {}; 
            let content = '';
            
            const configProc = listaProcedimentosGlobal.find(p => p.name === proc);

            // --- REGRA PARA DOCUMENTOS GERAIS ---
            if (proc === 'Documentos Gerais') {
                content += renderSummaryLine("Documento de Identidade", dados.doc_identidade_status, dados.doc_identidade_d1, dados.doc_identidade_d2, dados.doc_identidade_d3, dados.doc_identidade_nao_enc);
                content += renderSummaryLine("Comprovante de Residência", dados.doc_residencia_status, dados.doc_residencia_d1, dados.doc_residencia_d2, dados.doc_residencia_d3, dados.doc_residencia_nao_enc);
            }
            
            if (configProc && configProc.docs) {
                configProc.docs.forEach((docName, index) => {
                    if (proc === 'Alimentos' && docName === 'Comprovante de Renda') {
                        content += renderSummaryLine("Comprovante de Renda", dados.renda_status, dados.renda_d1, dados.renda_d2, dados.renda_d3, dados.renda_nao_enc);
                    }
                    else if (proc === 'Divórcio' && docName === 'Certidão de Casamento') {
                        content += renderSummaryLine("Certidão de casamento posterior 2014", dados.cert_casamento_status, dados.cert_casamento_d1, dados.cert_casamento_d2, dados.cert_casamento_d3, dados.cert_casamento_nao_enc);
                    }
                    else if (proc === 'Reconhecimento de paternidade' && docName === 'Exame pericial') {
                        content += renderSummaryLine("Exame pericial", dados.exame_pericial_status, dados.exame_pericial_d1, dados.exame_pericial_d2, dados.exame_pericial_d3, dados.exame_pericial_nao_enc);
                    }
                    else if (proc === 'Reconhecimento de paternidade' && docName === 'Comprovante de Renda') {
                        content += renderSummaryLine("Comprovante de Renda", dados.renda_status, dados.renda_d1, dados.renda_d2, dados.renda_d3, dados.renda_nao_enc);
                    }
                    else if (proc === 'Dissolução de união estável' && docName.includes('Documento formal')) {
                        content += renderSummaryLine("Documento formal da união estável", dados.doc_formal_ue_status, dados.doc_formal_ue_d1, dados.doc_formal_ue_d2, dados.doc_formal_ue_d3, dados.doc_formal_ue_nao_enc);
                    }
                    else {
                        const docKey = `doc_custom_${index}`;
                        content += renderSummaryLine(docName, dados[docKey + '_status'], dados[docKey + '_d1'], dados[docKey + '_d2'], dados[docKey + '_d3'], dados[docKey + '_nao_enc']);
                    }
                });
            }

            if (proc === 'Menor de Idade') {
                content += renderSummaryLine("Comprovante de Renda", dados.renda_status, dados.renda_d1, dados.renda_d2, dados.renda_d3, dados.renda_nao_enc);
                if (data.lista_menores && Array.isArray(data.lista_menores)) {
                    // Filtra apenas os que são marcados como "Menor" ou não tem papel definido (compatibilidade)
                    data.lista_menores.forEach((menor, idx) => {
                        if(!menor.tipo_papel || menor.tipo_papel !== 'Co-Solicitante' && menor.tipo_papel !== 'Co-Solicitado') {
                            const label = `Documento do menor ${getIniciais(menor.nome)}`;
                            content += renderSummaryLine(label, dados[`doc_menor_${idx}_status`], dados[`doc_menor_${idx}_d1`], dados[`doc_menor_${idx}_d2`], dados[`doc_menor_${idx}_d3`], dados[`doc_menor_${idx}_nao_enc`]);
                        }
                    });
                }
            }

            if(dados.outros_docs && Array.isArray(dados.outros_docs)) {
                dados.outros_docs.forEach(doc => { content += renderSummaryLine(doc.nome, doc.status, doc.d1, doc.d2, doc.d3, doc.nao_enc); });
            }

            if (content === '') {
                content = `<div style="height:100%; display:flex; align-items:center; justify-content:center;"><span style="color:#ccc; font-size:0.8rem;">Sem itens configurados.</span></div>`;
            }

            return `<div style="position:relative; min-height: 120px; border: 1px solid #e0e0e0; background: inherit; border-radius: 4px; padding:15px;">${content}</div>`;
        };

        // GERAÇÃO DO HTML DO CHECKLIST (COM LINK EXTERNO)
        // ==========================================================
        let checklistHtml = '';
        // AQUI: Adicionamos "Documentos Gerais" no início da lista para todos
        let itensParaMostrar = ["Documentos Gerais", ...(data.procedimentos || [])];
        
        if (data.tem_menor === 'sim') itensParaMostrar.push("Menor de Idade");

        if (itensParaMostrar.length > 0) {
            let blocosHtml = '';
            
            // Prepara grupos de pessoas para o loop
            const groupSolicitantes = [{ name: data.solicitante.nome, roleKey: 'solicitante' }];
            const groupSolicitados = [{ name: data.solicitado.nome, roleKey: 'solicitado' }];

            // Adiciona extras se existirem
            if(data.lista_menores) {
                data.lista_menores.forEach((m, idx) => {
                    if(m.tipo_papel === 'Co-Solicitante') groupSolicitantes.push({ name: m.nome, roleKey: `extra_solicitante_${idx}` });
                    if(m.tipo_papel === 'Co-Solicitado') groupSolicitados.push({ name: m.nome, roleKey: `extra_solicitado_${idx}` });
                });
            }

            itensParaMostrar.forEach(titulo => {
                const isDone = checklistData[titulo]?.concluido || false;
                const bgBody = isDone ? '#e8f5e9' : '#fff';

                // --- LÓGICA DE MEMÓRIA (MINIMIZAR) ---
                // Cria uma chave única para este processo + esta seção
                const storageKey = `collapse_${id}_${titulo}`; 
                const isCollapsed = localStorage.getItem(storageKey) === 'true';
                
                // Define se começa visível ou invisível baseado na memória
                const displayStyle = isCollapsed ? 'none' : 'grid';
                const iconClass = isCollapsed ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up';
                
                // Gera HTML da coluna esquerda (Solicitantes)
                const leftColumnHtml = groupSolicitantes.map(p => `
                    <div style="margin-bottom: 20px; border-bottom: 1px dashed #eee; padding-bottom: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                            <div style="font-weight: 800; font-size: 1rem; color: #000;">${p.name || '(Sem nome)'}</div>
                            <button class="btn-mini btn-edit-checklist" data-proc="${titulo}" data-tipo="${p.roleKey}" style="border:1px solid #ddd; background:white; border-radius:4px; padding:5px; cursor:pointer;"><i class="fa-solid fa-pencil"></i></button>
                        </div>
                        ${renderBoxContent(titulo, p.roleKey)}
                    </div>
                `).join('');

                // Gera HTML da coluna direita (Solicitados)
                const rightColumnHtml = groupSolicitados.map(p => `
                    <div style="margin-bottom: 20px; border-bottom: 1px dashed #eee; padding-bottom: 10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                            <div style="font-weight: 800; font-size: 1rem; color: #000;">${p.name || '(Sem nome)'}</div>
                            <button class="btn-mini btn-edit-checklist" data-proc="${titulo}" data-tipo="${p.roleKey}" style="border:1px solid #ddd; background:white; border-radius:4px; padding:5px; cursor:pointer;"><i class="fa-solid fa-pencil"></i></button>
                        </div>
                        ${renderBoxContent(titulo, p.roleKey)}
                    </div>
                `).join('');

                blocosHtml += `
                    <div class="checklist-block" style="border: 1px solid #ccc; margin-bottom: 20px; border-radius: 4px; overflow: hidden;">
                        <div style="display:flex; justify-content:center; align-items:center; padding: 10px 15px; background: #fff; border-bottom: 1px solid #eee; position: relative;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <span style="color: #d32f2f; font-weight: 800; font-size: 1.1rem; text-transform: uppercase;">${titulo}</span>
                                <div style="display:flex; align-items:center;">
                                    <input type="checkbox" id="chk-done-${titulo}" class="chk-concluido-proc toggle-checkbox" data-proc="${titulo}" ${isDone?'checked':''} style="display:none;">
                                    <label for="chk-done-${titulo}" class="toggle-label" style="margin:0; cursor:pointer; transform:scale(0.8);"></label>
                                </div>
                            </div>
                            <button class="btn-collapse-block" data-storage-key="${storageKey}" style="background:none; border:none; cursor:pointer; font-size:1.2rem; color:#666; position: absolute; right: 15px;">
                                <i class="${iconClass}"></i>
                            </button>
                        </div>
                        <div class="block-content" style="display: ${displayStyle}; grid-template-columns: 1fr 1fr; border-top: 1px solid #ccc; background-color: ${bgBody}; transition: background-color 0.3s;">
                            <div style="padding: 15px; border-right: 1px solid #ccc;">
                                <div style="font-weight:bold; color:#555; margin-bottom:5px; text-transform:uppercase; font-size:0.8rem;">Grupo Solicitante</div>
                                ${leftColumnHtml}
                            </div>
                            <div style="padding: 15px;">
                                <div style="font-weight:bold; color:#555; margin-bottom:5px; text-transform:uppercase; font-size:0.8rem;">Grupo Solicitado</div>
                                ${rightColumnHtml}
                            </div>
                        </div>
                    </div>
                `;
            });

            // Lógica dos Botões de Link (MODIFICADO PARA COPIAR)
            const urlLink = data.checklist_url ? data.checklist_url : '';
            
            // Botão agora é um <button> com ID específico e ícone de copiar
            const btnLinkAccess = urlLink ? 
                `<button id="btn-copy-link-checklist" class="btn-mini" style="border:1px solid #2e7d32; color:#2e7d32; width:30px; height:30px;" title="Copiar Link para Área de Transferência"><i class="fa-regular fa-copy"></i></button>` 
                : '';

            checklistHtml = `
                <div style="background: #fff; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-top: 3px solid #3085d6; padding: 20px; margin-top: 30px;">
                    <div style="display:flex; justify-content:center; align-items:center; position:relative; margin-bottom: 20px;">
                        <h3 style="font-weight: 800; text-transform: uppercase; font-size: 1.1rem; color: var(--col-primary); margin:0;">Check list documentos</h3>
                        <div style="position:absolute; right:0; display:flex; gap:5px;">
                            <button id="btn-config-link" class="btn-mini" title="Configurar Link da Pasta" style="border:1px solid #3085d6; color:#3085d6; width:30px; height:30px;"><i class="fa-solid fa-link"></i></button>
                            ${btnLinkAccess}
                        </div>
                    </div>
                    <div style="max-height: 600px; overflow-y: auto; padding-right: 5px;">${blocosHtml}</div>
                </div>
            `;
            
        }

        // --- NOVO MODAL DE ANOTAÇÕES ---
        const modalNotesHtml = `
            <div id="notes-modal" class="modal-overlay hidden">
                <div class="modal-content" style="max-width: 600px; max-height:85vh; display:flex; flex-direction:column;">
                    <div class="modal-header">
                        <h3><i class="fa-solid fa-note-sticky" style="color:#e65100;"></i> Anotações</h3>
                        <button id="btn-close-notes" class="btn-close-modal">✖</button>
                    </div>
                    <div class="form-body" style="background:#fff; padding:15px; border-bottom:1px solid #eee;">
                        <input type="hidden" id="note-id-edit">
                        <label style="font-weight:bold; font-size:0.9rem;">Escrever nota:</label>
                        <div class="editor-toolbar">
                            <button type="button" class="editor-btn" onclick="document.execCommand('bold',false,null)"><b>B</b></button>
                            <button type="button" class="editor-btn" onclick="document.execCommand('italic',false,null)"><i>I</i></button>
                            <button type="button" class="editor-btn" onclick="document.execCommand('underline',false,null)"><u>U</u></button>
                            <input type="color" onchange="document.execCommand('foreColor',false,this.value)" style="height:30px; border:none; background:transparent; cursor:pointer;">
                        </div>
                        <div id="rich-editor-content" class="rich-editor" contenteditable="true"></div>
                        <div style="text-align:right; margin-top:10px;">
                            <button id="btn-save-note" class="btn-save" style="background:#e65100;">Salvar</button>
                        </div>
                    </div>
                    <div id="notes-list-area" style="overflow-y:auto; padding:15px; background:#f8fafc; flex:1;"></div>
                </div>
            </div>
        `;

        // Renderiza tudo (INCLUINDO O NOVO MODAL DE NOTAS NO FINAL)
        contentArea.innerHTML = `${summaryHtml}<div class="details-grid"><div class="left-col">${participantsHtml}</div><div class="right-col">${generatorHtml}</div></div>${invitesHtml}${checklistHtml}${modalGeneralHtml}${modalPartHtml}${modalChecklistHtml}${modalInvitesHtml}${modalCalendarHtml}${modalNotesHtml}`;

        // EVENTO: CONFIGURAR LINK DO CHECKLIST
        const btnConfigLink = document.getElementById('btn-config-link');
        if(btnConfigLink) {
            btnConfigLink.addEventListener('click', async () => {
                const currentUrl = data.checklist_url || '';
                const newUrl = prompt("Insira o link da pasta (Google Drive, OneDrive, etc):", currentUrl);
                
                if (newUrl !== null) { // Se não cancelou
                    await updateDoc(docRef, { 
                        checklist_url: newUrl.trim(),
                        data_ultima_movimentacao: new Date()
                    });
                    renderDetalhesProcesso(id); // Recarrega para mostrar o botão de acesso
                }
            });
        }

        // EVENTO: COPIAR LINK DO CHECKLIST
        const btnCopyLink = document.getElementById('btn-copy-link-checklist');
        if(btnCopyLink) {
            btnCopyLink.addEventListener('click', () => {
                const link = data.checklist_url;
                if(link) {
                    navigator.clipboard.writeText(link).then(() => {
                        // Feedback visual: troca o ícone por um "Check" por 1.5s
                        const originalIcon = btnCopyLink.innerHTML;
                        btnCopyLink.innerHTML = '<i class="fa-solid fa-check"></i>';
                        setTimeout(() => btnCopyLink.innerHTML = originalIcon, 1500);
                    }).catch(err => {
                        console.error('Erro ao copiar: ', err);
                        alert("Erro ao copiar link. Verifique as permissões do navegador.");
                    });
                }
            });
        }

        // ==========================================================
        //  EVENTOS E LÓGICA DO CHECKLIST (RESTAURADOS)
        // ==========================================================
        
        document.querySelectorAll('.btn-collapse-block').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Pega os elementos
                const icon = btn.querySelector('i');
                const block = btn.closest('.checklist-block');
                const content = block.querySelector('.block-content');
                const key = btn.getAttribute('data-storage-key'); // Pega a chave única
                
                if (content.style.display === 'none') {
                    // ABRIR
                    content.style.display = 'grid'; 
                    icon.className = 'fa-solid fa-chevron-up';
                    localStorage.removeItem(key); // Remove da memória (padrão é aberto)
                } else {
                    // FECHAR (MINIMIZAR)
                    content.style.display = 'none'; 
                    icon.className = 'fa-solid fa-chevron-down';
                    localStorage.setItem(key, 'true'); // Salva na memória que está fechado
                }
            });
        });

        document.querySelectorAll('.chk-concluido-proc').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                if (chk.checked && !confirm("Todos documentos foram enviados?")) {
                    chk.checked = false; return; 
                }
                const proc = chk.getAttribute('data-proc');
                const blockContent = chk.closest('.checklist-block').querySelector('.block-content');
                blockContent.style.backgroundColor = chk.checked ? '#e8f5e9' : '#fff';
                
                await updateDoc(docRef, { 
                    [`checklist.${proc}.concluido`]: chk.checked,
                    data_ultima_movimentacao: new Date() 
                });
            });
        });

        // Lógica dos Convites (NOVO)
        const modalInvite = document.getElementById('invite-modal');
        const btnSaveInvite = document.getElementById('btn-save-invite');
        
        document.querySelectorAll('.btn-edit-invite').forEach(btn => {
            btn.addEventListener('click', () => {
                const role = btn.getAttribute('data-role');
                const name = btn.getAttribute('data-name');
                const storedData = invitesData[role] || {};

                document.getElementById('invite-modal-title').innerText = `Gerenciar Convites - ${name.split(' ')[0]}`;
                document.getElementById('invite-role-key').value = role;
                document.getElementById('invite-d1').value = storedData.d1 || '';
                document.getElementById('invite-d2').value = storedData.d2 || '';
                document.getElementById('invite-d3').value = storedData.d3 || '';
                document.getElementById('invite-status').value = storedData.status || 'Pendente';
                
                modalInvite.classList.remove('hidden');
            });
        });

        document.getElementById('btn-close-invite').addEventListener('click', () => modalInvite.classList.add('hidden'));

        btnSaveInvite.addEventListener('click', async () => {
            const role = document.getElementById('invite-role-key').value;
            const newData = {
                d1: document.getElementById('invite-d1').value,
                d2: document.getElementById('invite-d2').value,
                d3: document.getElementById('invite-d3').value,
                status: document.getElementById('invite-status').value
            };

            await updateDoc(docRef, {
                [`controle_convites.${role}`]: newData,
                data_ultima_movimentacao: new Date()
            });

            modalInvite.classList.add('hidden');
            renderDetalhesProcesso(id);
        });

        // Lógica do Modal de Checklist
        const modalChecklist = document.getElementById('checklist-modal');
        const formBody = document.getElementById('checklist-form-body');
        let currentCheckProc = null;
        let currentCheckTipo = null;
        let tempData = {}; 

        const generateDocBlockHtml = (id, label, status, d1, d2, d3, naoEnc, isRemovable = false, extraData = {}) => {
            let rendaExtrasHtml = '';
            if (id === 'renda') {
                const displayStyle = status === 'Sim' ? 'block' : 'none';
                rendaExtrasHtml = `
                <div class="renda-extra-fields" style="display:${displayStyle}; margin-top:10px; padding:10px; background:#fff3e0; border:1px solid #ffcc80; border-radius:4px;">
                    <p style="font-weight:bold; font-size:0.9rem; margin-bottom:5px; color:#e65100;">Tem:</p>
                    <div style="margin-bottom:5px;"><input type="text" class="renda-emp" placeholder="Nome do empregador" value="${extraData.emp||''}" style="width:100%; padding:5px; border:1px solid #ccc; border-radius:3px;"></div>
                    <div style="margin-bottom:5px;"><input type="text" class="renda-cnpj" placeholder="CNPJ" value="${extraData.cnpj||''}" style="width:100%; padding:5px; border:1px solid #ccc; border-radius:3px;"></div>
                    <div style="margin-bottom:8px;"><input type="text" class="renda-rh" placeholder="e-mail/telefone RH" value="${extraData.rh||''}" style="width:100%; padding:5px; border:1px solid #ccc; border-radius:3px;"></div>
                    <div style="display:flex; align-items:center; gap:5px; border-top:1px solid #ffe0b2; padding-top:5px;">
                        <input type="checkbox" class="renda-dispensa" id="chk-dispensa-${id}" ${extraData.disp ? 'checked' : ''}>
                        <label for="chk-dispensa-${id}" style="cursor:pointer; font-size:0.85rem; color:#e65100;">Dispensar informações</label>
                    </div>
                </div>`;
            }

            return `
            <div class="doc-block" data-doc-id="${id}" style="margin-bottom: 20px; border:1px solid #ddd; padding:15px; border-radius:8px; background:#fdfdfd;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <label style="font-weight:bold; color:#333;">${label}</label>
                    ${isRemovable ? `<i class="fa-solid fa-trash btn-del-doc" data-id="${id}" style="color:#d32f2f; cursor:pointer;" title="Excluir"></i>` : ''}
                </div>
                <select class="chk-status" style="width:100%; padding:8px; border-radius:6px; border:1px solid #ccc; margin-bottom:10px;">
                    <option value="" ${status===''?'selected':''}>Selecione...</option>
                    <option value="Sim" ${status==='Sim'?'selected':''}>Sim</option>
                    <option value="Pendente" ${status==='Pendente'?'selected':''}>Pendente</option>
                    <option value="Dispensado" ${status==='Dispensado'?'selected':''}>Dispensado</option>
                    <option value="Não" ${status==='Não'?'selected':''}>Não</option>
                </select>
                ${rendaExtrasHtml}
                <div class="chk-dates-area" style="background:#f4f4f4; padding:10px; border-radius:6px; border:1px solid #eee; ${status==='Dispensado'?'opacity:0.5; pointer-events:none;':''}">
                    <strong style="display:block; margin-bottom:5px; font-size:0.85rem; color:#666;">Solicitação:</strong>
                    <div style="margin-bottom:5px;">1ª vez <input type="date" class="d1" value="${d1||''}" style="border:1px solid #ccc; border-radius:4px; padding:2px;"></div>
                    <div style="margin-bottom:5px;">2ª vez <input type="date" class="d2" value="${d2||''}" style="border:1px solid #ccc; border-radius:4px; padding:2px;"></div>
                    <div style="margin-bottom:5px;">3ª vez <input type="date" class="d3" value="${d3||''}" style="border:1px solid #ccc; border-radius:4px; padding:2px;"></div>
                    <div style="margin-top:10px; display:flex; align-items:center; gap:5px;">
                        <input type="checkbox" class="chk-nao" ${naoEnc?'checked':''}> 
                        <label style="cursor:pointer; color:#d32f2f; font-size:0.9rem;">Não encaminhado</label>
                    </div>
                </div>
            </div>`;
        };

        const renderChecklistForm = () => {
            let html = '';
            const configProc = listaProcedimentosGlobal.find(p => p.name === currentCheckProc);

            if (configProc && configProc.docs) {
                configProc.docs.forEach((docName, idx) => {
                    let docId, label, status, d1, d2, d3, naoEnc, extras = {};
                    
                    if (currentCheckProc === 'Alimentos' && docName === 'Comprovante de Renda') {
                        docId = 'renda'; label = docName; 
                        status = tempData.renda_status; d1 = tempData.renda_d1; d2 = tempData.renda_d2; d3 = tempData.renda_d3; naoEnc = tempData.renda_nao_enc;
                        extras = { emp: tempData.renda_emp, cnpj: tempData.renda_cnpj, rh: tempData.renda_rh, disp: tempData.renda_dispensa };
                    } else if (currentCheckProc === 'Divórcio' && docName === 'Certidão de Casamento') {
                        docId = 'cert_casamento'; label = 'Certidão de casamento posterior 2014';
                        status = tempData.cert_casamento_status; d1 = tempData.cert_casamento_d1; d2 = tempData.cert_casamento_d2; d3 = tempData.cert_casamento_d3; naoEnc = tempData.cert_casamento_nao_enc;
                    
                    // --- CORREÇÃO DISSOLUÇÃO UNIÃO ESTÁVEL ---
                    } else if (currentCheckProc === 'Dissolução de união estável' && docName.includes('Documento formal')) {
                        docId = 'doc_formal_ue'; 
                        label = docName;
                        status = tempData.doc_formal_ue_status; 
                        d1 = tempData.doc_formal_ue_d1; 
                        d2 = tempData.doc_formal_ue_d2; 
                        d3 = tempData.doc_formal_ue_d3; 
                        naoEnc = tempData.doc_formal_ue_nao_enc;

                    } else {
                        docId = `doc_custom_${idx}`; label = docName;
                        status = tempData[docId + '_status']; d1 = tempData[docId + '_d1']; d2 = tempData[docId + '_d2']; d3 = tempData[docId + '_d3']; naoEnc = tempData[docId + '_nao_enc'];
                    }
                    html += generateDocBlockHtml(docId, label, status, d1, d2, d3, naoEnc, false, extras);
                });

            } else if (currentCheckProc === 'Documentos Gerais') {
                // Configuração manual dos Documentos Gerais
                html += generateDocBlockHtml('doc_identidade', 'Documento de Identidade', tempData.doc_identidade_status, tempData.doc_identidade_d1, tempData.doc_identidade_d2, tempData.doc_identidade_d3, tempData.doc_identidade_nao_enc);
                html += generateDocBlockHtml('doc_residencia', 'Comprovante de Residência', tempData.doc_residencia_status, tempData.doc_residencia_d1, tempData.doc_residencia_d2, tempData.doc_residencia_d3, tempData.doc_residencia_nao_enc);

            } else if (currentCheckProc === 'Menor de Idade') {
                 html += generateDocBlockHtml('renda', 'Comprovante de Renda', tempData.renda_status, tempData.renda_d1, tempData.renda_d2, tempData.renda_d3, tempData.renda_nao_enc, false, { emp: tempData.renda_emp, cnpj: tempData.renda_cnpj, rh: tempData.renda_rh, disp: tempData.renda_dispensa });
                 if (data.lista_menores && Array.isArray(data.lista_menores)) {
                    data.lista_menores.forEach((menor, idx) => {
                        const idKey = `doc_menor_${idx}`;
                        html += generateDocBlockHtml(idKey, `Documento do menor ${getIniciais(menor.nome)}`, tempData[`${idKey}_status`], tempData[`${idKey}_d1`], tempData[`${idKey}_d2`], tempData[`${idKey}_d3`], tempData[`${idKey}_nao_enc`]);
                    });
                }
            }

            if(tempData.outros_docs) {
                tempData.outros_docs.forEach(doc => {
                    html += generateDocBlockHtml(doc.id, doc.nome, doc.status, doc.d1, doc.d2, doc.d3, doc.nao_enc, true);
                });
            }
            
            formBody.innerHTML = html || '<p style="color:#999; text-align:center;">Nenhum documento configurado.</p>';

            formBody.querySelectorAll('.chk-status').forEach(sel => {
                sel.addEventListener('change', (e) => {
                    const block = e.target.closest('.doc-block');
                    const val = e.target.value;
                    const datesArea = block.querySelector('.chk-dates-area');
                    if(val === 'Dispensado') { datesArea.style.opacity = '0.5'; datesArea.style.pointerEvents = 'none'; } 
                    else { datesArea.style.opacity = '1'; datesArea.style.pointerEvents = 'auto'; }
                    
                    if (block.getAttribute('data-doc-id') === 'renda') {
                        const extrasArea = block.querySelector('.renda-extra-fields');
                        if (extrasArea) extrasArea.style.display = (val === 'Sim') ? 'block' : 'none';
                    }
                });
            });

            formBody.querySelectorAll('.chk-nao').forEach(chk => {
                chk.addEventListener('change', (e) => {
                    if(e.target.checked) {
                        const sel = e.target.closest('.doc-block').querySelector('.chk-status');
                        sel.value = 'Não'; sel.dispatchEvent(new Event('change'));
                    }
                });
            });
             formBody.querySelectorAll('.btn-del-doc').forEach(btn => {
                btn.addEventListener('click', () => {
                    if(confirm("Excluir documento?")) {
                        const id = btn.getAttribute('data-id');
                        tempData.outros_docs = tempData.outros_docs.filter(d => String(d.id) !== String(id));
                        renderChecklistForm();
                    }
                });
            });
        };

        document.querySelectorAll('.btn-edit-checklist').forEach(btn => {
            btn.addEventListener('click', () => {
                currentCheckProc = btn.getAttribute('data-proc');
                currentCheckTipo = btn.getAttribute('data-tipo');
                document.getElementById('checklist-modal-title').innerText = `Editar: ${currentCheckProc} (${currentCheckTipo})`;
                tempData = JSON.parse(JSON.stringify(checklistData[currentCheckProc]?.[currentCheckTipo] || {}));
                renderChecklistForm();
                modalChecklist.classList.remove('hidden');
            });
        });

        document.getElementById('btn-add-doc-extra').addEventListener('click', () => {
            const nomeDoc = prompt("Digite o nome do novo documento:");
            if(nomeDoc && nomeDoc.trim() !== "") {
                if(!tempData.outros_docs) tempData.outros_docs = [];
                tempData.outros_docs.push({ id: Date.now(), nome: nomeDoc, status: '', d1:'', d2:'', d3:'', nao_enc: false });
                renderChecklistForm();
                setTimeout(() => { formBody.scrollTop = formBody.scrollHeight; }, 100);
            }
        });

       // // ------------------------------------------------------------------
        // BOTÃO SALVAR CHECKLIST (COM CORREÇÃO PARA MENORES DE IDADE)
        // ------------------------------------------------------------------
        document.getElementById('btn-save-checklist').addEventListener('click', async () => {
            const blocks = formBody.querySelectorAll('.doc-block');
            let validacaoOk = true;

            // === CONFIGURAÇÃO: QUAIS DOCUMENTOS SÃO COMUNS? ===
            // Adicionamos "Documento do menor" nesta lista
            const docsEmComum = [
                "Certidão de Nascimento", 
                "Certidão de Casamento", 
                "Documento formal da união estável",
                "Sentença anterior",
                "Exame pericial",
                "Documento do menor" // <--- NOVO: Permite sincronizar JPC, ME, FR, etc.
            ];
            // ==================================================

            const updates = {}; 

            // 1. Processa os dados da pessoa que estamos editando agora (tempData)
            blocks.forEach(block => {
                const docId = block.getAttribute('data-doc-id');
                const label = block.querySelector('label').textContent; 
                const status = block.querySelector('.chk-status').value;
                const d1 = block.querySelector('.d1').value; 
                const d2 = block.querySelector('.d2').value; 
                const d3 = block.querySelector('.d3').value;
                const naoEnc = block.querySelector('.chk-nao').checked;

                // Salva no objeto temporário
                if (docId === 'doc_identidade' || docId === 'doc_residencia') {
                    tempData[`${docId}_status`] = status; 
                    tempData[`${docId}_d1`] = d1; tempData[`${docId}_d2`] = d2; tempData[`${docId}_d3`] = d3; 
                    tempData[`${docId}_nao_enc`] = naoEnc;
                } else if (docId === 'renda') {
                    const emp = block.querySelector('.renda-emp')?.value || '';
                    const cnpj = block.querySelector('.renda-cnpj')?.value || '';
                    const rh = block.querySelector('.renda-rh')?.value || '';
                    const disp = block.querySelector('.renda-dispensa')?.checked || false;
                    
                    if (status === 'Sim' && !disp && (emp.trim() === '' || cnpj.trim() === '' || rh.trim() === '')) validacaoOk = false;
                    
                    tempData.renda_status = status; tempData.renda_d1 = d1; tempData.renda_d2 = d2; tempData.renda_d3 = d3; tempData.renda_nao_enc = naoEnc;
                    tempData.renda_emp = emp; tempData.renda_cnpj = cnpj; tempData.renda_rh = rh; tempData.renda_dispensa = disp;
                } else if (docId === 'cert_casamento') {
                    tempData.cert_casamento_status = status; tempData.cert_casamento_d1 = d1; tempData.cert_casamento_d2 = d2; tempData.cert_casamento_d3 = d3; tempData.cert_casamento_nao_enc = naoEnc;
                } else if (docId === 'doc_formal_ue') {
                    tempData.doc_formal_ue_status = status; tempData.doc_formal_ue_d1 = d1; tempData.doc_formal_ue_d2 = d2; tempData.doc_formal_ue_d3 = d3; tempData.doc_formal_ue_nao_enc = naoEnc;
                } else if (docId.startsWith('doc_custom_') || docId.startsWith('doc_menor_')) {
                    tempData[`${docId}_status`] = status; tempData[`${docId}_d1`] = d1; tempData[`${docId}_d2`] = d2; tempData[`${docId}_d3`] = d3; tempData[`${docId}_nao_enc`] = naoEnc;
                } else {
                    const idx = tempData.outros_docs.findIndex(d => String(d.id) === String(docId));
                    if(idx > -1) {
                        tempData.outros_docs[idx].status = status; tempData.outros_docs[idx].d1 = d1; tempData.outros_docs[idx].d2 = d2; tempData.outros_docs[idx].d3 = d3; tempData.outros_docs[idx].nao_enc = naoEnc;
                    }
                }

                // === 2. LÓGICA DE SINCRONIZAÇÃO ===
                const nomeLimpo = label.trim();
                const ehComum = docsEmComum.some(termoComum => nomeLimpo.includes(termoComum));

                if (ehComum) {
                    const todosPapeis = ['solicitante', 'solicitado'];
                    if(data.lista_menores) {
                        data.lista_menores.forEach((m, i) => {
                            if(m.tipo_papel === 'Co-Solicitante') todosPapeis.push(`extra_solicitante_${i}`);
                            if(m.tipo_papel === 'Co-Solicitado') todosPapeis.push(`extra_solicitado_${i}`);
                        });
                    }

                    todosPapeis.forEach(papelAlvo => {
                        if (papelAlvo === currentCheckTipo) return;

                        const path = `checklist.${currentCheckProc}.${papelAlvo}`;
                        let dadosAlvo = checklistData[currentCheckProc]?.[papelAlvo] || {};
                        
                        // Atualiza campos no alvo
                        if (docId === 'cert_casamento') {
                            dadosAlvo.cert_casamento_status = status; dadosAlvo.cert_casamento_d1 = d1; dadosAlvo.cert_casamento_d2 = d2; dadosAlvo.cert_casamento_d3 = d3;
                        } else if (docId === 'doc_formal_ue') {
                            dadosAlvo.doc_formal_ue_status = status; dadosAlvo.doc_formal_ue_d1 = d1; dadosAlvo.doc_formal_ue_d2 = d2; dadosAlvo.doc_formal_ue_d3 = d3;
                        } else if (docId.startsWith('doc_custom_') || docId.startsWith('doc_menor_')) {
                            // <--- AQUI ESTAVA FALTANDO O SUPORTE PARA doc_menor_
                            dadosAlvo[`${docId}_status`] = status; dadosAlvo[`${docId}_d1`] = d1; dadosAlvo[`${docId}_d2`] = d2; dadosAlvo[`${docId}_d3`] = d3;
                        }
                        
                        updates[path] = dadosAlvo;
                    });
                }
            });

            if (!validacaoOk) {
                alert("ATENÇÃO: Preencha dados de renda ou marque 'Dispensar'."); return;
            }

            updates[`checklist.${currentCheckProc}.${currentCheckTipo}`] = tempData;
            updates['data_ultima_movimentacao'] = new Date(); 
            
            await updateDoc(docRef, updates);
            
            modalChecklist.classList.add('hidden');
            renderDetalhesProcesso(id);
        });

        document.getElementById('btn-close-checklist').addEventListener('click', () => modalChecklist.classList.add('hidden'));

        // EVENTOS (MANTIDOS IGUAIS, apenas garantindo funcionamento)
        document.querySelectorAll('.btn-part-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                if(!confirm("Tem certeza que deseja remover/limpar este participante?")) return;
                const type = btn.getAttribute('data-type');
                const index = btn.getAttribute('data-index');
                if (type === 'solicitante') await updateDoc(docRef, { solicitante: { nome: '', cpf: '', tel: '' } });
                else if (type === 'solicitado') await updateDoc(docRef, { solicitado: { nome: '', cpf: '', tel: '' } });
                else if (type === 'menor') {
                    const novaLista = [...(data.lista_menores || [])];
                    novaLista.splice(index, 1);
                    await updateDoc(docRef, { lista_menores: novaLista });
                }
                renderDetalhesProcesso(id);
            });
        });

        document.querySelectorAll('.btn-part-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.getAttribute('data-type');
                const index = btn.getAttribute('data-index');
                const modalPart = document.getElementById('part-modal');
                const inputNome = document.getElementById('part-nome');
                const inputCpf = document.getElementById('part-cpf');
                const inputTel = document.getElementById('part-tel');
                const selectTipo = document.getElementById('part-tipo');
                const inputIndex = document.getElementById('part-index');

                let pData = {};
                if (type === 'solicitante') pData = data.solicitante;
                else if (type === 'solicitado') pData = data.solicitado;
                else if (type === 'menor') pData = data.lista_menores[index];

                inputNome.value = pData.nome || '';
                inputCpf.value = pData.cpf || '';
                inputTel.value = pData.tel || '';
                selectTipo.value = type;
                inputIndex.value = (type === 'menor') ? index : type;

                if (type === 'solicitante' || type === 'solicitado') selectTipo.disabled = true;
                else selectTipo.disabled = false;
                modalPart.classList.remove('hidden');
            });
        });

        document.getElementById('btn-add-part').addEventListener('click', () => {
            document.getElementById('part-nome').value = '';
            document.getElementById('part-cpf').value = '';
            document.getElementById('part-tel').value = '';
            document.getElementById('part-tipo').value = 'menor';
            document.getElementById('part-tipo').disabled = false;
            document.getElementById('part-index').value = 'novo';
            document.getElementById('part-modal').classList.remove('hidden');
        });

        document.getElementById('btn-close-part').addEventListener('click', () => document.getElementById('part-modal').classList.add('hidden'));

        // SALVAR PARTICIPANTE (Lógica mantida)
        document.getElementById('btn-save-part').addEventListener('click', async () => {
            const btnSalvar = document.getElementById('btn-save-part');
            btnSalvar.innerText = "Salvando...";
            btnSalvar.disabled = true;
            try {
                const nome = document.getElementById('part-nome').value;
                const cpf = document.getElementById('part-cpf').value;
                const tel = document.getElementById('part-tel').value;
                const ddi = document.getElementById('part-ddi').value;
                const tipoSelecionado = document.getElementById('part-tipo').value;
                const idx = document.getElementById('part-index').value;
                const novoDados = { nome, cpf, tel, ddi };

                if (idx === 'novo') {
                    if (tipoSelecionado === 'solicitante') {
                        if (data.solicitante && data.solicitante.nome && data.solicitante.nome.trim() !== "") {
                            if(confirm("Já existe um Solicitante Principal. Adicionar como extra?")) {
                                let l = data.lista_menores || [];
                                novoDados.tipo_papel = 'Co-Solicitante';
                                l.push(novoDados);
                                await updateDoc(docRef, { lista_menores: l });
                            } else { await updateDoc(docRef, { solicitante: novoDados }); }
                        } else { await updateDoc(docRef, { solicitante: novoDados }); }
                    } 
                    else if (tipoSelecionado === 'solicitado') {
                        if (data.solicitado && data.solicitado.nome && data.solicitado.nome.trim() !== "") {
                             if(confirm("Já existe um Solicitado Principal. Adicionar como extra?")) {
                                let l = data.lista_menores || [];
                                novoDados.tipo_papel = 'Co-Solicitado';
                                l.push(novoDados);
                                await updateDoc(docRef, { lista_menores: l });
                            } else { await updateDoc(docRef, { solicitado: novoDados }); }
                        } else { await updateDoc(docRef, { solicitado: novoDados }); }
                    } 
                    else {
                        let l = data.lista_menores || [];
                        l.push(novoDados);
                        await updateDoc(docRef, { lista_menores: l });
                    }
                } else {
                    if (idx === 'solicitante') await updateDoc(docRef, { solicitante: novoDados });
                    else if (idx === 'solicitado') await updateDoc(docRef, { solicitado: novoDados });
                    else {
                        let l = [...(data.lista_menores || [])];
                        if (l[idx].tipo_papel) novoDados.tipo_papel = l[idx].tipo_papel;
                        l[idx] = novoDados;
                        await updateDoc(docRef, { lista_menores: l });
                    }
                }
                document.getElementById('part-modal').classList.add('hidden');
                renderDetalhesProcesso(id);
            } catch (e) { console.error(e); alert("Erro: " + e.message); } 
            finally { btnSalvar.innerText = "Salvar Participante"; btnSalvar.disabled = false; }
        });

        // ==========================================================
        // LÓGICA DO GERADOR DE MENSAGENS (Preencher e Gerar)
        // ==========================================================
        
        const selectCat = document.getElementById('gen-cat-filter');
        const selectModelo = document.getElementById('gen-modelo');
        const selectDest = document.getElementById('gen-destinatario');
        const txtResultado = document.getElementById('gen-resultado');

// 1. Função que preenche o dropdown de modelos
        const atualizarListaModelos = () => {
            const catSelecionada = selectCat.value;
            
            // Reinicia o select SEMPRE mantendo o Aleatório selecionado por padrão
            selectModelo.innerHTML = '<option value="ALEATORIO" selected>Aleatório</option>';
            
            listaTemplatesGlobal.forEach((tpl, idx) => {
                // Mostra se não tiver categoria selecionada OU se bater com a categoria
                if (catSelecionada === "" || tpl.category === catSelecionada) {
                    const opt = document.createElement('option');
                    opt.value = idx; 
                    opt.innerText = tpl.title;
                    selectModelo.appendChild(opt);
                }
            });
        };

        // Evento: Quando mudar a categoria, atualiza a lista
        selectCat.addEventListener('change', atualizarListaModelos);
        
        // Inicializa a lista assim que abre a tela
        atualizarListaModelos();

// 2. Lógica de Substituição de Variáveis (Gerar Texto com Anti-Spam Inteligente)
        document.getElementById('btn-gerar-msg').addEventListener('click', () => {
            let indexModelo = selectModelo.value;
            const destinatarioTipo = selectDest.value;
            const catSelecionada = selectCat.value; 

            if (destinatarioTipo === "") {
                alert("Por favor, selecione quem receberá.");
                return;
            }

            // --- LÓGICA DO ALEATÓRIO INTELIGENTE ---
            if (indexModelo === 'ALEATORIO') {
                const indicesDisponiveis = listaTemplatesGlobal
                    .map((tpl, idx) => ({ idx, cat: tpl.category }))
                    .filter(item => catSelecionada === "" || item.cat === catSelecionada)
                    .map(item => item.idx);

                if (indicesDisponiveis.length === 0) {
                    alert("Não há modelos disponíveis nesta categoria para sortear.");
                    return;
                }

                const storageKey = `uso_msg_${catSelecionada || 'TODAS'}`;
                let usados = JSON.parse(localStorage.getItem(storageKey) || "[]");
                let naoUsados = indicesDisponiveis.filter(i => !usados.includes(i));

                if (naoUsados.length === 0) {
                    console.log("Ciclo completo! Reiniciando...");
                    usados = []; 
                    naoUsados = indicesDisponiveis; 
                }

                const indiceSorteado = naoUsados[Math.floor(Math.random() * naoUsados.length)];
                indexModelo = indiceSorteado;

                usados.push(indiceSorteado);
                localStorage.setItem(storageKey, JSON.stringify(usados));
            }

            let template = listaTemplatesGlobal[indexModelo].content;
            
            // --- 1. PREPARAÇÃO DAS LISTAS GERAIS ---
            let listaSolicitantes = [];
            if (data.solicitante && data.solicitante.nome) listaSolicitantes.push(data.solicitante.nome);
            if (data.lista_menores) {
                data.lista_menores.forEach(m => { if (m.tipo_papel === 'Co-Solicitante') listaSolicitantes.push(m.nome); });
            }
            const txtSolicitanteGeral = formatarListaNomes(listaSolicitantes);

            let listaSolicitados = [];
            if (data.solicitado && data.solicitado.nome) listaSolicitados.push(data.solicitado.nome);
            if (data.lista_menores) {
                data.lista_menores.forEach(m => { if (m.tipo_papel === 'Co-Solicitado') listaSolicitados.push(m.nome); });
            }
            const txtSolicitadoGeral = formatarListaNomes(listaSolicitados);

            // --- 2. DEFINIÇÃO DO DESTINATÁRIO ---
            let nomeDest = "";
            let cpfDest = "";
            
            if (destinatarioTipo === 'GERAL') {
                nomeDest = "Senhor(a)";
                cpfDest = "";
            } else if (destinatarioTipo === 'solicitante') {
                nomeDest = data.solicitante.nome;
                cpfDest = data.solicitante.cpf;
            } else if (destinatarioTipo === 'solicitado') {
                nomeDest = data.solicitado.nome;
                cpfDest = data.solicitado.cpf;
            } else if (destinatarioTipo.startsWith('menor:')) {
                const idxMenor = parseInt(destinatarioTipo.split(':')[1]);
                if(data.lista_menores && data.lista_menores[idxMenor]){
                    nomeDest = data.lista_menores[idxMenor].nome;
                    cpfDest = data.lista_menores[idxMenor].cpf || "";
                }
            } else if (destinatarioTipo === 'ALL_SOLICITANTES') {
                 nomeDest = txtSolicitanteGeral;
                 cpfDest = "Vários"; 
            } else if (destinatarioTipo === 'ALL_SOLICITADOS') {
                 nomeDest = txtSolicitadoGeral;
                 cpfDest = "Vários";
            }

            // --- 3. DADOS DE DATA/HORA ---
            let dataAgend = "--/--/----";
            let horaAgend = "--:--";
            if (data.agendamento) {
                const d = new Date(data.agendamento);
                if(!isNaN(d)) {
                    dataAgend = d.toLocaleDateString('pt-BR');
                    horaAgend = d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
                }
            }

            // --- 4. CÁLCULO DE DOCUMENTOS PENDENTES ---
            let docsPendentesTexto = "";
            let listaDocs = [];
            
            // Define quem verificar no checklist
            let roleKeysToCheck = []; 
            if (destinatarioTipo === 'solicitante') roleKeysToCheck.push('solicitante');
            else if (destinatarioTipo === 'solicitado') roleKeysToCheck.push('solicitado');
            else if (destinatarioTipo.startsWith('menor:')) {
                const idx = parseInt(destinatarioTipo.split(':')[1]);
                const p = data.lista_menores[idx];
                if (p.tipo_papel === 'Co-Solicitante') roleKeysToCheck.push(`extra_solicitante_${idx}`);
                else if (p.tipo_papel === 'Co-Solicitado') roleKeysToCheck.push(`extra_solicitado_${idx}`);
                // Se for outro/menor genérico, não temos como saber o ID do checklist fácil aqui sem refatorar
            }

            if (data.procedimentos && roleKeysToCheck.length > 0) {
                data.procedimentos.forEach(procName => {
                    const configProc = listaProcedimentosGlobal.find(p => p.name === procName);
                    const procData = checklistData[procName]; // Dados salvos do procedimento

                    if (configProc && configProc.docs && procData) {
                        roleKeysToCheck.forEach(roleKey => {
                            const userDocs = procData[roleKey]; // Dados salvos do usuário específico
                            if (userDocs) {
                                configProc.docs.forEach((docLabel, i) => {
                                    // Recria a lógica de chave para buscar o status
                                    let statusKey = '';
                                    if (procName === 'Alimentos' && docLabel === 'Comprovante de Renda') statusKey = 'renda_status';
                                    else if (procName === 'Divórcio' && docLabel === 'Certidão de Casamento') statusKey = 'cert_casamento_status';
                                    else if (procName === 'Reconhecimento de paternidade' && docLabel === 'Exame pericial') statusKey = 'exame_pericial_status';
                                    else if (procName === 'Reconhecimento de paternidade' && docLabel === 'Comprovante de Renda') statusKey = 'renda_status';
                                    else if (procName === 'Dissolução de união estável' && docLabel.includes('Documento formal')) statusKey = 'doc_formal_ue_status';
                                    else statusKey = `doc_custom_${i}_status`;

                                    // Verifica se está Pendente
                                    if (userDocs[statusKey] === 'Pendente') {
                                        listaDocs.push(`${docLabel} (${procName})`);
                                    }
                                });
                            }
                        });
                    }
                });
                
                if (listaDocs.length > 0) {
                    docsPendentesTexto = listaDocs.join('\n');
                } else {
                    docsPendentesTexto = "Não há documentos pendentes.";
                }
            } else {
                docsPendentesTexto = "(Selecione uma pessoa específica para listar pendências)";
            }

            // --- 5. SUBSTITUIÇÕES (REPLACE) ---
            template = template.replace(/{{Destinatário}}/g, nomeDest);
            template = template.replace(/{{CPF_Destinatário}}/g, cpfDest || "(Sem CPF)");
            template = template.replace(/{{Solicitante}}/g, data.solicitante.nome);
            template = template.replace(/{{Solicitado}}/g, data.solicitado.nome);
            template = template.replace(/{{SolicitanteGeral}}/g, txtSolicitanteGeral);
            template = template.replace(/{{SolicitadoGeral}}/g, txtSolicitadoGeral);
            template = template.replace(/{{Processo}}/g, data.num_processo || "(S/N)");
            template = template.replace(/{{Planilha}}/g, data.num_planilha || "");
            template = template.replace(/{{Data}}/g, dataAgend);
            template = template.replace(/{{Hora}}/g, horaAgend);
            template = template.replace(/{{Temática}}/g, (data.procedimentos || []).join(", "));
            template = template.replace(/{{DocumentosPendentes}}/g, docsPendentesTexto);
            
            // Joga no textarea
            txtResultado.value = template;

            // --- 6. FEEDBACK VISUAL (NOVA FUNCIONALIDADE) ---
            const modeloUsado = listaTemplatesGlobal[indexModelo];
            const nomeModelo = modeloUsado ? modeloUsado.title : "Desconhecido";
            const nomeCategoria = modeloUsado ? (modeloUsado.category || "Geral") : "Geral";
            
            const divFeedback = document.getElementById('gen-feedback-msg');
            if(divFeedback) {
                divFeedback.innerHTML = ` Categoria: <b>${nomeCategoria}</b>, modelo <b>"${nomeModelo}"</b> foi gerado.`;
                
                // Remove a mensagem após 10 segundos para não poluir
                setTimeout(() => {
                   divFeedback.innerHTML = '';
                }, 10000);
            }
        });

        // 3. Botão Copiar (Aquele que fica escondido)
        const btnCopy = document.getElementById('btn-copy-msg');
        if(btnCopy){
            btnCopy.addEventListener('click', () => {
                const texto = document.getElementById('gen-resultado');
                texto.select();
                document.execCommand('copy');
                
                // Feedback visual rápido
                const originalIcon = btnCopy.innerHTML;
                btnCopy.innerHTML = '<i class="fa-solid fa-check" style="color:green"></i>';
                setTimeout(() => btnCopy.innerHTML = originalIcon, 1500);
            });
        }

        // ==========================================================
        //  LÓGICA DO MODAL DE EDIÇÃO GERAL (RESTAURADO DO OLDAPP)
        // ==========================================================
        
        const modalGeneral = document.getElementById('edit-modal');
        let procedimentosTemp = [];

        // Função para desenhar os chips (etiquetas) de procedimentos dentro do modal
        const renderEditChips = () => {
            const container = document.getElementById('edit-chips-area');
            container.innerHTML = '';
            procedimentosTemp.forEach((proc, index) => {
                // Estilo inline para garantir visual correto das etiquetas
            container.innerHTML += `
                <div class="chip" style="display:inline-flex; align-items:center; padding:5px 10px; border-radius:15px; margin:2px; font-size:0.85rem;">
                    ${proc} 
                    <span class="remove-chip-edit" data-index="${index}" style="cursor:pointer; margin-left:8px; font-size:1rem;">&times;</span>
                </div>`;
            });
        };

            // 1. Botão Lápis na barra de resumo (Abrir Modal)
    const btnOpenEdit = document.getElementById('btn-open-edit-modal');
            if(btnOpenEdit) {
                btnOpenEdit.addEventListener('click', () => {
                    // Preenche os campos do modal com os dados atuais
                    document.getElementById('edit-planilha').value = data.num_planilha || '';
                    document.getElementById('edit-processo').value = data.num_processo || '';
                    document.getElementById('edit-agendamento').value = data.agendamento || '';
                    document.getElementById('edit-status').value = data.status || 'Com Pendências';
                    document.getElementById('edit-menor').value = data.tem_menor || 'nao';
                    document.getElementById('edit-mp').value = data.cadastrou_mp || 'nao';

                    // Copia os procedimentos atuais para uma lista temporária
                    procedimentosTemp = [...(data.procedimentos || [])];
                    renderEditChips();

                    modalGeneral.classList.remove('hidden');
                });
            }

            // 2. Botão Adicionar Procedimento (Dentro do Modal)
            const btnAddProcEdit = document.getElementById('btn-add-proc-edit');
            if(btnAddProcEdit) {
                btnAddProcEdit.addEventListener('click', () => { 
                    const select = document.getElementById('edit-select-proc');
                    const val = select.value; 
                    if(val && !procedimentosTemp.includes(val)) { 
                        procedimentosTemp.push(val); 
                        renderEditChips(); 
                        select.value = ""; // Limpa seleção
                    } 
                });
            }

            // 3. Remover Procedimento (Clique no X da etiqueta)
            const areaChips = document.getElementById('edit-chips-area');
            if(areaChips) {
                areaChips.addEventListener('click', (e) => { 
                    if(e.target.classList.contains('remove-chip-edit')) { 
                        const idx = e.target.getAttribute('data-index');
                        procedimentosTemp.splice(idx, 1); 
                        renderEditChips(); 
                    } 
                });
            }

            // 4. Salvar Alterações Gerais
            const btnSaveEdit = document.getElementById('btn-save-edit');
            if(btnSaveEdit) {
                btnSaveEdit.addEventListener('click', async () => {
                    const btn = document.getElementById('btn-save-edit');
                    btn.innerText = "Salvando...";
                    btn.disabled = true;

                    try {
                        await updateDoc(docRef, {
                            num_planilha: document.getElementById('edit-planilha').value,
                            num_processo: document.getElementById('edit-processo').value,
                            agendamento: document.getElementById('edit-agendamento').value,
                            status: document.getElementById('edit-status').value,
                            tem_menor: document.getElementById('edit-menor').value,
                            cadastrou_mp: document.getElementById('edit-mp').value,
                            procedimentos: procedimentosTemp,
                            data_ultima_movimentacao: new Date() 
                        });

                        // LOG NOVO
                        await registrarLog("Edição", `Editou detalhes do processo ${data.num_processo || id}`);

                        modalGeneral.classList.add('hidden');
                        renderDetalhesProcesso(id); // Recarrega a tela para mostrar mudanças
                    } catch (e) {
                        console.error("Erro ao salvar:", e);
                        alert("Erro ao salvar alterações.");
                        btn.innerText = "Salvar Alterações";
                        btn.disabled = false;
                    }
                });
            }

            // 5. Fechar Modal
            const closeGeneralModal = () => modalGeneral.classList.add('hidden');
            document.getElementById('btn-close-modal').addEventListener('click', closeGeneralModal);
            document.getElementById('btn-cancel-edit').addEventListener('click', closeGeneralModal);

            // ============================================================
            // LÓGICA DO CALENDÁRIO (ABAS, NOVO E LISTAGEM)
            // ============================================================
            const modalCalendar = document.getElementById('calendar-modal');
            
            // Elementos Novo Evento
            const selectEventType = document.getElementById('event-type');
            const inputEventTitle = document.getElementById('event-title');
            
            // Elementos Abas
            const btnTabNovo = document.getElementById('tab-btn-novo');
            const btnTabLista = document.getElementById('tab-btn-lista');
            const contentNovo = document.getElementById('tab-content-novo');
            const contentLista = document.getElementById('tab-content-lista');
            const listaEventosDiv = document.getElementById('lista-eventos-proc');

            // --- 1. CONTROLE DE ABAS ---
            btnTabNovo.addEventListener('click', () => {
                btnTabNovo.classList.add('active');
                btnTabLista.classList.remove('active');
                contentNovo.classList.remove('hidden');
                contentLista.classList.add('hidden');
            });

            btnTabLista.addEventListener('click', () => {
                btnTabLista.classList.add('active');
                btnTabNovo.classList.remove('active');
                contentLista.classList.remove('hidden');
                contentNovo.classList.add('hidden');
                carregarEventosDoProcesso(); // Carrega a lista ao clicar na aba
            });

            // --- 2. FUNÇÃO PARA CARREGAR LISTA ---
            async function carregarEventosDoProcesso() {
                listaEventosDiv.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Buscando agendamentos...</div>';
                
                try {
                    // Busca na coleção 'agenda_eventos' onde 'processo_id' é igual ao ID atual
                    const q = query(collection(db, "agenda_eventos"), where("processo_id", "==", id));
                    const querySnapshot = await getDocs(q);
                    
                    const eventos = [];
                    querySnapshot.forEach(doc => eventos.push({ id: doc.id, ...doc.data() }));

                    // Ordena por data
                    eventos.sort((a, b) => new Date(a.data) - new Date(b.data));

                    if (eventos.length === 0) {
                        listaEventosDiv.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Nenhum agendamento encontrado para este processo.</p>';
                        return;
                    }

                    listaEventosDiv.innerHTML = '';
                    eventos.forEach(ev => {
                        const isDone = ev.status === 'concluido';
                        const dataBr = ev.data.split('-').reverse().join('/');
                        const hora = ev.hora || 'Dia todo';
                        const styleTitle = isDone ? 'text-decoration:line-through; color:#999;' : 'color:#333; font-weight:bold;';
                        const borderClass = isDone ? 'border-left: 4px solid #2e7d32;' : 'border-left: 4px solid var(--col-primary);';

                        const itemDiv = document.createElement('div');
                        itemDiv.className = 'agenda-item-row';
                        itemDiv.style.cssText = `background:white; padding:10px; border-radius:6px; border:1px solid #ddd; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; ${borderClass}`;
                        
                        itemDiv.innerHTML = `
                            <div>
                                <div style="font-size:0.8rem; color:#666;"><i class="fa-regular fa-clock"></i> ${dataBr} às ${hora}</div>
                                <div style="${styleTitle}">${ev.tipo}</div>
                                ${ev.obs ? `<div style="font-size:0.8rem; color:#888; font-style:italic;">"${ev.obs}"</div>` : ''}
                            </div>
                            <div style="display:flex; gap:5px;">
                                ${!isDone ? 
                                    `<button class="btn-mini btn-evt-check" title="Concluir" style="color:#2e7d32; border-color:#c8e6c9;"><i class="fa-solid fa-check"></i></button>` : 
                                    `<button class="btn-mini btn-evt-undo" title="Reabrir" style="color:#999; border-color:#eee;"><i class="fa-solid fa-rotate-left"></i></button>`
                                }
                                <button class="btn-mini btn-evt-date" title="Reagendar" style="color:#1565c0; border-color:#bbdefb;"><i class="fa-regular fa-calendar-days"></i></button>
                                <button class="btn-mini btn-evt-del" title="Excluir" style="color:#d32f2f; border-color:#ffcdd2;"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        `;

                        // Ações dos botões (Locais para atualizar a lista imediatamente)
                        const actions = {
                            check: itemDiv.querySelector('.btn-evt-check'),
                            undo: itemDiv.querySelector('.btn-evt-undo'),
                            resched: itemDiv.querySelector('.btn-evt-date'),
                            del: itemDiv.querySelector('.btn-evt-del')
                        };

                        const docRefEvt = doc(db, "agenda_eventos", ev.id);

                        if(actions.check) actions.check.addEventListener('click', async () => {
                            await updateDoc(docRefEvt, { status: 'concluido' });
                            carregarEventosDoProcesso();
                        });

                        if(actions.undo) actions.undo.addEventListener('click', async () => {
                            await updateDoc(docRefEvt, { status: 'pendente' });
                            carregarEventosDoProcesso();
                        });

                        if(actions.del) actions.del.addEventListener('click', async () => {
                            if(confirm("Excluir este agendamento?")) {
                                await deleteDoc(docRefEvt);
                                carregarEventosDoProcesso();
                            }
                        });

                        if(actions.resched) actions.resched.addEventListener('click', async () => {
                            const inputData = prompt("Nova data (DD/MM/AAAA):", dataBr);
                            if (inputData) {
                                if(!/^\d{2}\/\d{2}\/\d{4}$/.test(inputData)) { alert("Formato inválido (DD/MM/AAAA)"); return; }
                                const partes = inputData.split('/');
                                const dataBanco = `${partes[2]}-${partes[1]}-${partes[0]}`;
                                const novaHora = prompt("Nova hora (HH:MM):", ev.hora);
                                
                                await updateDoc(docRefEvt, { data: dataBanco, hora: novaHora || '', status: 'pendente' });
                                alert("Reagendado!");
                                carregarEventosDoProcesso();
                            }
                        });

                        listaEventosDiv.appendChild(itemDiv);
                    });

                } catch (e) {
                    console.error(e);
                    listaEventosDiv.innerHTML = `<p style="color:red; text-align:center;">Erro: ${e.message}</p>`;
                }
            }

            // --- 3. ABRIR E FECHAR MODAL ---
            const btnOpenCal = document.getElementById('btn-open-calendar-modal');
            if(btnOpenCal) {
                btnOpenCal.addEventListener('click', () => {
                    modalCalendar.classList.remove('hidden');
                    // Reset para aba 'Novo'
                    btnTabNovo.click(); 
                });
            }

            document.getElementById('btn-close-calendar').addEventListener('click', () => {
                modalCalendar.classList.add('hidden');
            });

            // Campo "Outro"
            selectEventType.addEventListener('change', (e) => {
                if(e.target.value === 'Outro') {
                    inputEventTitle.style.display = 'block'; inputEventTitle.focus();
                } else {
                    inputEventTitle.style.display = 'none';
                }
            });
            
            // --- 4. SALVAR NOVO EVENTO ---
            document.getElementById('btn-save-event').addEventListener('click', async () => {
                const btn = document.getElementById('btn-save-event');
                const tipo = selectEventType.value;
                let titulo = tipo;
                if(tipo === 'Outro') titulo = inputEventTitle.value;
                
                const dataEvento = document.getElementById('event-date').value;
                const horaEvento = document.getElementById('event-time').value;
                const obs = document.getElementById('event-obs').value;

                if(!titulo || !dataEvento) { alert("Preencha o tipo e a data."); return; }

                btn.innerText = "Salvando...";
                btn.disabled = true;

                try {
                    await addDoc(collection(db, "agenda_eventos"), {
                        processo_id: id, 
                        processo_num: data.num_processo || data.num_planilha || "S/N",
                        tipo: titulo,
                        data: dataEvento,
                        hora: horaEvento,
                        obs: obs,
                        status: 'pendente',
                        criado_em: new Date()
                    });

                    // Atualiza Processo
                    const updates = { data_ultima_movimentacao: new Date() };
                    if(dataEvento && horaEvento) updates.agendamento = `${dataEvento}T${horaEvento}`;
                    else updates.agendamento = dataEvento;

                    if(titulo.includes("Audiência")) updates.status = "Aguardando Audiência";

                    await updateDoc(docRef, updates);

                    alert("Agendado com sucesso!");
                    
                    // Vai para a aba de lista para mostrar que salvou
                    btnTabLista.click(); 
                    
                    // Reseta form
                    selectEventType.value = ""; inputEventTitle.value = ""; 
                    document.getElementById('event-date').value = "";
                    document.getElementById('event-obs').value = "";
                    
                    // Atualiza cabeçalho do processo (data agendamento)
                    renderDetalhesProcesso(id);

                } catch (e) {
                    console.error(e);
                    alert("Erro ao salvar: " + e.message);
                } finally {
                    btn.innerText = "Agendar Compromisso";
                    btn.disabled = false;
                }
            });


        // ==========================================================
            // LÓGICA DAS ANOTAÇÕES (EDITOR)
            // ==========================================================
            const modalNotes = document.getElementById('notes-modal');
            const editorDiv = document.getElementById('rich-editor-content');
            const notesListArea = document.getElementById('notes-list-area');
            const hiddenIdNote = document.getElementById('note-id-edit');

            // Abrir Modal
            const btnOpenNotes = document.getElementById('btn-open-notes-modal');
            if(btnOpenNotes) btnOpenNotes.addEventListener('click', () => {
                modalNotes.classList.remove('hidden');
                renderNotesList();
                editorDiv.innerHTML = ''; 
                hiddenIdNote.value = '';
                document.getElementById('btn-save-note').innerText = "Salvar";
            });
            document.getElementById('btn-close-notes').addEventListener('click', () => modalNotes.classList.add('hidden'));

            // Listar Notas
            function renderNotesList() {
                const list = data.anotacoes || [];
                list.sort((a, b) => new Date(b.data) - new Date(a.data));
                
                if(list.length === 0) {
                    notesListArea.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Nenhuma anotação.</p>';
                    return;
                }
                
                let html = '';
                list.forEach(note => {
                    const dataFmt = new Date(note.data).toLocaleString('pt-BR');
                    html += `
                        <div class="note-card">
                            <span class="note-date">${dataFmt}</span>
                            <div class="note-content">${note.texto}</div>
                            <div class="note-actions">
                                <button class="btn-mini btn-edit-note" data-id="${note.id}"><i class="fa-solid fa-pencil"></i></button>
                                <button class="btn-mini btn-del-note" data-id="${note.id}" style="color:red;"><i class="fa-solid fa-trash"></i></button>
                            </div>
                        </div>`;
                });
                notesListArea.innerHTML = html;

                // Eventos Editar/Excluir
                document.querySelectorAll('.btn-del-note').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        if(confirm("Excluir?")) {
                            const nova = list.filter(n => String(n.id) !== btn.getAttribute('data-id'));
                            await updateDoc(docRef, { anotacoes: nova });
                            data.anotacoes = nova; renderNotesList();
                        }
                    });
                });
                document.querySelectorAll('.btn-edit-note').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const note = list.find(n => String(n.id) === btn.getAttribute('data-id'));
                        if(note) {
                            editorDiv.innerHTML = note.texto;
                            hiddenIdNote.value = note.id;
                            document.getElementById('btn-save-note').innerText = "Atualizar";
                        }
                    });
                });
            }

            // Salvar Nota
            document.getElementById('btn-save-note').addEventListener('click', async () => {
                const btn = document.getElementById('btn-save-note');
                const content = editorDiv.innerHTML;
                const idEdit = hiddenIdNote.value;
                
                if(!editorDiv.innerText.trim() && !content.includes('<')) return alert("Escreva algo.");
                
                btn.innerText = "..."; btn.disabled = true;
                try {
                    let list = data.anotacoes || [];
                    if(idEdit) {
                        const idx = list.findIndex(n => String(n.id) === String(idEdit));
                        if(idx > -1) { list[idx].texto = content; list[idx].data = new Date().toISOString(); }
                    } else {
                        list.push({ id: Date.now(), texto: content, data: new Date().toISOString() });
                    }
                    await updateDoc(docRef, { anotacoes: list });
                    data.anotacoes = list;
                    editorDiv.innerHTML = ''; hiddenIdNote.value = '';
                    renderNotesList();
                    btn.innerText = "Salvar";
                } catch(e) { console.error(e); alert("Erro ao salvar."); }
                finally { btn.disabled = false; }
            });                

        } catch (error) {
            console.error(error);
            contentArea.innerHTML = `<p style="color:red">Erro ao carregar detalhes: ${error.message}</p>`;
        }
}

// ==================================================
// 7. TELA: CONFIGURAÇÕES (HÍBRIDA: PROCEDIMENTOS DO OLDAPP + MENSAGENS DO NOVO)
// ==================================================

function renderScreenConfiguracoes() {
    contentArea.innerHTML = `
        <div class="config-header" style="margin-bottom: 20px;">
            <h2><i class="fa-solid fa-sliders"></i> Configurações do Sistema</h2>
        </div>

        <div class="config-tabs">
            <button class="tab-btn active" data-tab="tab-procedimentos">Procedimentos</button>
            <button class="tab-btn" data-tab="tab-mensagens">Template Mensagens</button>
        </div>

        <div id="tab-procedimentos" class="tab-content">
            <div class="filter-bar" style="justify-content: space-between; align-items: center;">
                <p style="color:#666; margin:0;">Gerencie os documentos obrigatórios para cada tipo de ação.</p>
                <button id="btn-new-proc" class="action-btn-main" style="padding: 8px 15px; font-size: 0.9rem;">
                    <i class="fa-solid fa-plus"></i> Novo Procedimento
                </button>
            </div>
            <div id="lista-config-proc" style="margin-top:20px;"></div>
        </div>

        <div id="tab-mensagens" class="tab-content hidden">
            <div class="filter-bar" style="flex-wrap: wrap; gap:10px;">
                <div style="flex:1;">
                    <p style="color:#666; margin:0; margin-bottom:5px;">Filtrar Categoria</p>
                    <select id="config-msg-filter" style="padding:5px; border-radius:4px; border:1px solid #ccc; width:200px;">
                        <option value="">Todas</option>
                        ${listaCategoriasGlobal.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="btn-manage-cats" style="background:#fff; border:1px solid var(--col-primary); color:var(--col-primary); padding:8px 15px; border-radius:6px; cursor:pointer; font-weight:600;">
                        <i class="fa-solid fa-tags"></i> Gerenciar Categorias
                    </button>
                    <button id="btn-new-msg" class="action-btn-main" style="padding: 8px 15px; font-size: 0.9rem;">
                        <i class="fa-solid fa-plus"></i> Novo Modelo
                    </button>
                </div>
            </div>
            <div id="lista-config-msg" class="grid-templates" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap:15px; margin-top:20px;"></div>
        </div>

        <div id="modal-config-proc" class="modal-overlay hidden">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="title-config-proc">Editar Procedimento</h3>
                    <button class="btn-close-modal" id="btn-close-config-proc">✖</button>
                </div>
                <div class="form-body">
                    <div class="form-group">
                        <label>Nome do Procedimento</label>
                        <input type="text" id="input-config-name" placeholder="Ex: Reconhecimento..." style="width:100%;">
                        <small id="warn-system-proc" style="color:#999; display:none;">Procedimentos padrão do sistema não podem ser renomeados.</small>
                    </div>
                    
                    <div class="form-section-title" style="margin-top:20px;">Documentos Obrigatórios</div>
                    <div id="list-config-docs"></div>
                    
                    <button id="btn-add-config-doc" style="margin-top:10px; background:#e3f2fd; color:#1565c0; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:600;">
                        <i class="fa-solid fa-plus"></i> Adicionar Documento
                    </button>
                </div>
                <div class="modal-actions">
                    <button class="btn-voltar" id="btn-cancel-config-proc">Cancelar</button>
                    <button class="btn-save" id="btn-save-config-proc">Salvar Configuração</button>
                </div>
            </div>
        </div>

        <div id="modal-config-msg" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3 id="title-config-msg">Editar Modelo</h3>
                    <button class="btn-close-modal" id="btn-close-config-msg">✖</button>
                </div>
                <div class="form-body">
                    <div class="form-group">
                        <label>Título do Modelo</label>
                        <input type="text" id="input-msg-title" placeholder="Ex: Convite Mediação..." style="width:100%;">
                    </div>
                    <div class="form-group">
                        <label>Categoria</label>
                        <select id="input-msg-cat" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px;">
                            ${listaCategoriasGlobal.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Conteúdo da Mensagem</label>
                        <div class="vars-bar" style="margin-bottom:5px; display:flex; gap:5px; flex-wrap:wrap;">
                            <button class="btn-var" data-var="{{Destinatário}}">+ Destinatário</button>
                            <button class="btn-var" data-var="{{CPF_Destinatário}}">+ CPF Destinatário</button>
                            <button class="btn-var" data-var="{{Solicitante}}">+ Solicitante</button>
                            <button class="btn-var" data-var="{{SolicitanteGeral}}">+ Solicitante Geral</button>
                            <button class="btn-var" data-var="{{Solicitado}}">+ Solicitado</button>
                            <button class="btn-var" data-var="{{SolicitadoGeral}}">+ Solicitado Geral</button>
                            <button class="btn-var" data-var="{{Data}}">+ Data</button>
                            <button class="btn-var" data-var="{{Hora}}">+ Hora</button>
                            <button class="btn-var" data-var="{{Temática}}">+ Temática</button>
                            <button class="btn-var" data-var="{{Processo}}">+ Nº Processo</button>
                            <button class="btn-var" data-var="{{Planilha}}">+ Nº Planilha</button>
                            <button class="btn-var" data-var="{{DocumentosPendentes}}" style="background:#e8f5e9; color:#2e7d32; border-color:#c8e6c9;">+ Documentos Pendentes</button>
                        </div>
                        <textarea id="input-msg-content" rows="10" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; font-family:monospace; resize:vertical;"></textarea>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn-voltar" id="btn-cancel-config-msg">Cancelar</button>
                    <button class="btn-save" id="btn-save-config-msg">Salvar Modelo</button>
                </div>
            </div>
        </div>

        <div id="modal-cats" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>Gerenciar Categorias</h3>
                    <button class="btn-close-modal" id="btn-close-cats">✖</button>
                </div>
                <div class="form-body">
                    <div style="display:flex; gap:10px; margin-bottom:20px;">
                        <input type="text" id="input-new-cat" placeholder="Nova Categoria..." style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px;">
                        <button id="btn-add-cat" style="background:var(--col-success); color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer;"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div id="list-cats" style="max-height:300px; overflow-y:auto;"></div>
                </div>
            </div>
        </div>
    `;

    // --- Lógica das Abas ---
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(btn.getAttribute('data-tab')).classList.remove('hidden');
        });
    });

    // --- Inicialização Procedimentos ---
    document.getElementById('btn-new-proc').addEventListener('click', () => openConfigModal(null));
    renderConfigProcsList();
    setupConfigModalEvents();

    // --- Inicialização Mensagens ---
    document.getElementById('btn-new-msg').addEventListener('click', () => openConfigMsgModal(null));
    document.getElementById('config-msg-filter').addEventListener('change', renderConfigMsgList);
    
    // Manage Categories
    document.getElementById('btn-manage-cats').addEventListener('click', () => {
        renderCatsList();
        document.getElementById('modal-cats').classList.remove('hidden');
    });
    document.getElementById('btn-close-cats').addEventListener('click', () => document.getElementById('modal-cats').classList.add('hidden'));
    
    document.getElementById('btn-add-cat').addEventListener('click', async () => {
        const val = document.getElementById('input-new-cat').value.trim();
        if(val && !listaCategoriasGlobal.includes(val)) {
            listaCategoriasGlobal.push(val);
            document.getElementById('input-new-cat').value = "";
            await salvarTemplatesNoBanco(); // Salva tudo (templates + cats)
            renderCatsList();
            renderScreenConfiguracoes(); // Re-renderiza para atualizar dropdowns
        }
    });

    renderConfigMsgList();
    setupConfigMsgEvents();
}

// ---------------------------------------------------------
// LÓGICA DE PROCEDIMENTOS (RESTAURADA DO OLDAPP)
// ---------------------------------------------------------

function renderConfigProcsList() {
    const container = document.getElementById('lista-config-proc');
    container.innerHTML = '';

    listaProcedimentosGlobal.forEach((proc, index) => {
        const div = document.createElement('div');
        div.className = 'proc-config-item';
        
        const docsCount = proc.docs ? proc.docs.length : 0;
        const docsLabel = docsCount === 1 ? 'documento' : 'documentos';
        
        // Tag Sistema
        const tagSistema = proc.sistema 
            ? `<span class="tag-fixed"><i class="fa-solid fa-lock"></i> Sistema</span>` 
            : `<span class="tag-fixed" style="background:#e3f2fd; color:#1565c0;"><i class="fa-solid fa-user"></i> Personalizado</span>`;

        // Botão Deletar (Só para personalizados)
        const btnDelete = !proc.sistema 
            ? `<button class="btn-mini btn-del-proc" data-index="${index}" title="Excluir Procedimento" style="color:#d32f2f; border-color:#ffcdd2;"><i class="fa-solid fa-trash"></i></button>`
            : '';

        div.innerHTML = `
            <div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <strong style="font-size:1rem; color:var(--col-primary);">${proc.name}</strong>
                    ${tagSistema}
                </div>
                <div style="font-size:0.85rem; color:#777; margin-top:5px;">
                    ${docsCount} ${docsLabel} obrigatórios configurados.
                </div>
            </div>
            <div class="proc-config-actions">
                <button class="btn-mini btn-edit-config-proc" data-index="${index}" title="Editar">
                    <i class="fa-solid fa-pencil"></i>
                </button>
                ${btnDelete}
            </div>
        `;
        container.appendChild(div);
    });

    // Eventos de clique
    document.querySelectorAll('.btn-edit-config-proc').forEach(btn => {
        btn.addEventListener('click', () => openConfigModal(parseInt(btn.getAttribute('data-index'))));
    });

    document.querySelectorAll('.btn-del-proc').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm("Tem certeza que deseja excluir este procedimento?")) {
                const idx = parseInt(btn.getAttribute('data-index'));
                listaProcedimentosGlobal.splice(idx, 1);
                await salvarProcedimentosNoBanco();
                renderConfigProcsList();
            }
        });
    });
}

let currentEditingProcIndex = null;
let tempDocsList = [];
let isNewProc = false;

function openConfigModal(index) {
    isNewProc = (index === null);
    currentEditingProcIndex = index;
    
    const inputName = document.getElementById('input-config-name');
    const warn = document.getElementById('warn-system-proc');

    if (isNewProc) {
        document.getElementById('title-config-proc').innerText = "Novo Procedimento";
        inputName.value = "";
        inputName.disabled = false;
        inputName.style.background = "#fff";
        warn.style.display = "none";
        tempDocsList = [];
    } else {
        const proc = listaProcedimentosGlobal[index];
        document.getElementById('title-config-proc').innerText = `Editar: ${proc.name}`;
        inputName.value = proc.name;
        tempDocsList = [...(proc.docs || [])];

        if (proc.sistema) {
            inputName.disabled = true;
            inputName.style.background = "#f0f0f0";
            warn.style.display = "block";
        } else {
            inputName.disabled = false;
            inputName.style.background = "#fff";
            warn.style.display = "none";
        }
    }
    
    renderTempDocsList();
    document.getElementById('modal-config-proc').classList.remove('hidden');
}

function renderTempDocsList() {
    const container = document.getElementById('list-config-docs');
    container.innerHTML = '';

    if(tempDocsList.length === 0) {
        container.innerHTML = '<p style="color:#ccc; font-style:italic;">Nenhum documento obrigatório configurado.</p>';
    } else {
        tempDocsList.forEach((docName, idx) => {
            const row = document.createElement('div');
            row.className = 'doc-config-row';
            row.innerHTML = `
                <input type="text" value="${docName}" class="input-doc-name" data-idx="${idx}" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:4px;">
                <button class="btn-mini btn-del-config-doc" data-idx="${idx}" style="color:#d32f2f; border-color:#ffcdd2;"><i class="fa-solid fa-trash"></i></button>
            `;
            container.appendChild(row);
        });
    }

    // Eventos dentro da lista de docs
    document.querySelectorAll('.input-doc-name').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = e.target.getAttribute('data-idx');
            tempDocsList[idx] = e.target.value;
        });
    });

    document.querySelectorAll('.btn-del-config-doc').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = btn.getAttribute('data-idx');
            tempDocsList.splice(idx, 1);
            renderTempDocsList();
        });
    });
}

function setupConfigModalEvents() {
    const modal = document.getElementById('modal-config-proc');
    const close = () => modal.classList.add('hidden');

    document.getElementById('btn-close-config-proc').addEventListener('click', close);
    document.getElementById('btn-cancel-config-proc').addEventListener('click', close);

    document.getElementById('btn-add-config-doc').addEventListener('click', () => {
        tempDocsList.push("Novo Documento");
        renderTempDocsList();
    });

    document.getElementById('btn-save-config-proc').addEventListener('click', async () => {
        const nameInput = document.getElementById('input-config-name');
        const newName = nameInput.value.trim();
        
        if (isNewProc && newName === "") {
            alert("O nome do procedimento é obrigatório.");
            return;
        }

        const finalDocs = tempDocsList.filter(d => d.trim() !== "");

        if (isNewProc) {
            listaProcedimentosGlobal.push({
                name: newName,
                sistema: false,
                docs: finalDocs
            });
        } else {
            const proc = listaProcedimentosGlobal[currentEditingProcIndex];
            // Se não for sistema, atualiza o nome
            if (!proc.sistema) proc.name = newName;
            proc.docs = finalDocs;
        }
        
        await salvarProcedimentosNoBanco();
        renderConfigProcsList();
        close();
    });
}

async function salvarProcedimentosNoBanco() {
    try {
        const docRef = doc(db, "configuracoes", "procedimentos");
        await setDoc(docRef, { lista: listaProcedimentosGlobal });
        
        // LOG NOVO
        await registrarLog("Configuração", "Atualizou a lista de Procedimentos");

    } catch (e) {
        console.error("Erro ao salvar configurações:", e);
        alert("Erro ao salvar alterações.");
    }
}

// ---------------------------------------------------------
// LÓGICA DE MENSAGENS (MANTIDA DO NOVO)
// ---------------------------------------------------------

function renderCatsList() {
    const container = document.getElementById('list-cats');
    container.innerHTML = '';
    listaCategoriasGlobal.forEach((cat, idx) => {
        const div = document.createElement('div');
        div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:8px; border-bottom:1px solid #eee;";
        div.innerHTML = `<span>${cat}</span>`;
        if (cat !== "Geral") {
            div.innerHTML += `<button class="btn-mini btn-del-cat" data-idx="${idx}" style="color:red; border:none;"><i class="fa-solid fa-trash"></i></button>`;
        }
        container.appendChild(div);
    });
    
    container.querySelectorAll('.btn-del-cat').forEach(btn => {
        btn.addEventListener('click', async () => {
            if(confirm("Excluir categoria?")) {
                listaCategoriasGlobal.splice(btn.getAttribute('data-idx'), 1);
                await salvarTemplatesNoBanco();
                renderCatsList();
                renderScreenConfiguracoes();
            }
        });
    });
}

function renderConfigMsgList() {
    const container = document.getElementById('lista-config-msg');
    const filter = document.getElementById('config-msg-filter').value;
    container.innerHTML = '';
    
    listaTemplatesGlobal.forEach((tpl, index) => {
        if (filter && tpl.category !== filter) return;

        const card = document.createElement('div');
        card.className = 'msg-card';
        card.style.cssText = "background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; display:flex; flex-direction:column; justify-content:space-between; box-shadow: 0 2px 4px rgba(0,0,0,0.05);";
        
        card.innerHTML = `
            <div>
                <div style="display:flex; justify-content:space-between;">
                    <h4 style="color:var(--col-primary); margin-bottom:5px;">${tpl.title}</h4>
                    <span style="font-size:0.7rem; background:#eee; padding:2px 6px; border-radius:4px; height:fit-content;">${tpl.category || 'Geral'}</span>
                </div>
                <p style="font-size:0.8rem; color:#666; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${tpl.content}</p>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px; justify-content:flex-end;">
                <button class="btn-mini btn-edit-msg" data-index="${index}"><i class="fa-solid fa-pencil"></i></button>
                <button class="btn-mini btn-del-msg" data-index="${index}" style="color:#d32f2f; border-color:#ffcdd2;"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(card);
    });

    document.querySelectorAll('.btn-edit-msg').forEach(btn => btn.addEventListener('click', () => openConfigMsgModal(btn.getAttribute('data-index'))));
    document.querySelectorAll('.btn-del-msg').forEach(btn => btn.addEventListener('click', async () => {
        if(confirm("Excluir este modelo?")) {
            listaTemplatesGlobal.splice(btn.getAttribute('data-index'), 1);
            await salvarTemplatesNoBanco();
            renderConfigMsgList();
        }
    }));
}

let currentMsgIndex = null;
function openConfigMsgModal(index) {
    const modal = document.getElementById('modal-config-msg');
    const titleInput = document.getElementById('input-msg-title');
    const contentInput = document.getElementById('input-msg-content');
    const catInput = document.getElementById('input-msg-cat');
    
    currentMsgIndex = index;
    modal.classList.remove('hidden');

    if (index === null) {
        document.getElementById('title-config-msg').innerText = "Novo Modelo";
        titleInput.value = "";
        contentInput.value = "";
        catInput.value = "Geral";
    } else {
        const tpl = listaTemplatesGlobal[index];
        document.getElementById('title-config-msg').innerText = "Editar Modelo";
        titleInput.value = tpl.title;
        contentInput.value = tpl.content;
        catInput.value = tpl.category || "Geral";
    }
}

function setupConfigMsgEvents() {
    const modal = document.getElementById('modal-config-msg');
    const close = () => modal.classList.add('hidden');
    
    document.getElementById('btn-close-config-msg').addEventListener('click', close);
    document.getElementById('btn-cancel-config-msg').addEventListener('click', close);

    document.querySelectorAll('.btn-var').forEach(btn => {
        btn.addEventListener('click', () => {
            const textarea = document.getElementById('input-msg-content');
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            const insert = btn.getAttribute('data-var');
            textarea.value = text.substring(0, start) + insert + text.substring(end);
            textarea.focus();
            textarea.selectionEnd = start + insert.length;
        });
    });

    document.getElementById('btn-save-config-msg').addEventListener('click', async () => {
        const title = document.getElementById('input-msg-title').value.trim();
        const content = document.getElementById('input-msg-content').value;
        const category = document.getElementById('input-msg-cat').value;

        if(!title) { alert("O título é obrigatório."); return; }

        const novoObj = { title, content, category };

        if (currentMsgIndex === null) {
            listaTemplatesGlobal.push(novoObj);
        } else {
            listaTemplatesGlobal[currentMsgIndex] = novoObj;
        }

        await salvarTemplatesNoBanco();
        renderConfigMsgList();
        close();
    });
}

async function salvarTemplatesNoBanco() {
    try {
        const docRef = doc(db, "configuracoes", "mensagens");
        // Salva templates E categorias
        await setDoc(docRef, { templates: listaTemplatesGlobal, categories: listaCategoriasGlobal });
    } catch (e) {
        console.error("Erro ao salvar templates:", e);
        alert("Erro ao salvar templates.");
    }
}

// ==================================================
// 7. TELA DE BACKUP (IMPORTAR / EXPORTAR)
// ==================================================
function renderScreenBackup() {
    const pageTitle = document.getElementById('page-title');
    pageTitle.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Backup do Sistema';

    contentArea.innerHTML = `
        <div class="welcome-card" style="background: white; color: var(--col-primary); border: 1px solid #e2e8f0;">
            <h3 style="color: var(--col-primary); margin-bottom: 10px;">Exportar Dados (Salvar)</h3>
            <p style="color: #64748b; margin-bottom: 20px;">
                Isso criará um arquivo <b>.json</b> contendo: <br>
                1. Todos os cadastros (ativos e lixeira).<br>
                2. Configurações de Procedimentos.<br>
                3. Modelos de Mensagens.
            </p>
            <button id="btn-exportar" class="action-btn-main">
                <i class="fa-solid fa-download"></i> Baixar Backup Completo
            </button>
            <div id="status-export" style="margin-top:10px; font-weight:bold;"></div>
        </div>

        <div class="welcome-card" style="background: white; color: var(--col-primary); border: 1px solid #e2e8f0; margin-top: 30px;">
            <h3 style="color: var(--col-primary); margin-bottom: 10px;">Importar Dados (Restaurar)</h3>
            <p style="color: #64748b; margin-bottom: 20px;">
                Selecione um arquivo <b>.json</b> gerado anteriormente para restaurar os dados no sistema.
                <br><span style="color:#d32f2f; font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation"></i> Cuidado: Isso irá adicionar/sobrescrever os dados existentes.</span>
            </p>
            
            <input type="file" id="input-import-file" accept=".json" style="margin-bottom: 15px;">
            
            <button id="btn-importar" class="action-btn-main" style="background: #e2e8f0; color: #333;">
                <i class="fa-solid fa-upload"></i> Restaurar Backup
            </button>
            <div id="status-import" style="margin-top:10px; font-weight:bold;"></div>
        </div>
    `;

    // --- LÓGICA DE EXPORTAÇÃO ---
    document.getElementById('btn-exportar').addEventListener('click', async () => {
        const status = document.getElementById('status-export');
        status.innerText = "Lendo banco de dados... aguarde.";
        status.style.color = "blue";

        try {
            // 1. Pega Processos (Ativos e Lixeira)
            const snapProcessos = await getDocs(collection(db, "pre-processuais"));
            const listaProcessos = [];
            snapProcessos.forEach(doc => {
                // Salva o ID junto para poder restaurar no mesmo lugar se precisar
                listaProcessos.push({ _id: doc.id, ...doc.data() });
            });

            // 2. Pega Configurações
            const docProc = await getDoc(doc(db, "configuracoes", "procedimentos"));
            const docMsg = await getDoc(doc(db, "configuracoes", "mensagens"));

            const dadosConfig = {
                procedimentos: docProc.exists() ? docProc.data() : null,
                mensagens: docMsg.exists() ? docMsg.data() : null
            };

            // 3. Monta o Arquivo Final
            const backupData = {
                data_backup: new Date().toISOString(),
                versao: "1.0",
                processos: listaProcessos,
                configuracoes: dadosConfig
            };

            // 4. Gera o Download
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            const nomeArquivo = "backup_gestao_" + new Date().toISOString().slice(0,10) + ".json";
            downloadAnchorNode.setAttribute("download", nomeArquivo);
            document.body.appendChild(downloadAnchorNode); // Required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();

            status.innerText = "Backup baixado com sucesso!";
            status.style.color = "green";

        } catch (e) {
            console.error(e);
            status.innerText = "Erro ao exportar: " + e.message;
            status.style.color = "red";
        }
    });

    // --- LÓGICA DE IMPORTAÇÃO ---
    document.getElementById('btn-importar').addEventListener('click', async () => {
        const inputFile = document.getElementById('input-import-file');
        const status = document.getElementById('status-import');
        
        if (!inputFile.files || inputFile.files.length === 0) {
            alert("Selecione um arquivo .json primeiro.");
            return;
        }

        if(!confirm("Tem certeza? Dados com o mesmo ID serão atualizados. Novos dados serão criados.")) return;

        const file = inputFile.files[0];
        const reader = new FileReader();

        status.innerText = "Lendo arquivo...";
        status.style.color = "blue";

        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target.result);
                status.innerText = "Restaurando dados no Firebase... Isso pode demorar.";
                
                // Helper para converter datas (string/objeto) de volta para Timestamp do Firestore
                const fixTimestamps = (obj) => {
                    if (obj === null || typeof obj !== 'object') return obj;
                    
                    // Se encontrar o formato {seconds, nanoseconds}, converte para Timestamp
                    if (obj.hasOwnProperty('seconds') && obj.hasOwnProperty('nanoseconds') && Object.keys(obj).length === 2) {
                        return new Timestamp(obj.seconds, obj.nanoseconds);
                    }
                    
                    // Se for array, percorre itens
                    if (Array.isArray(obj)) return obj.map(fixTimestamps);
                    
                    // Se for objeto, percorre chaves recursivamente
                    const newObj = {};
                    for (const k in obj) {
                        newObj[k] = fixTimestamps(obj[k]);
                    }
                    return newObj;
                };

                // 1. Restaurar Configurações
                if (json.configuracoes) {
                    if (json.configuracoes.procedimentos) {
                        await setDoc(doc(db, "configuracoes", "procedimentos"), json.configuracoes.procedimentos);
                    }
                    if (json.configuracoes.mensagens) {
                        await setDoc(doc(db, "configuracoes", "mensagens"), json.configuracoes.mensagens);
                    }
                }

                // 2. Restaurar Processos
                if (json.processos && Array.isArray(json.processos)) {
                    let count = 0;
                    for (const item of json.processos) {
                        const docId = item._id; 
                        delete item._id; // Remove o ID de dentro do objeto para não salvar duplicado
                        
                        // Corrige as datas recursivamente
                        const dadosCorrigidos = fixTimestamps(item);

                        if (docId) {
                            await setDoc(doc(db, "pre-processuais", docId), dadosCorrigidos);
                        } else {
                            await addDoc(collection(db, "pre-processuais"), dadosCorrigidos);
                        }
                        count++;
                        status.innerText = `Processando item ${count} de ${json.processos.length}...`;
                    }
                }

                status.innerText = "Restauração concluída com sucesso!";
                status.style.color = "green";
                setTimeout(() => window.location.reload(), 2000); // Recarrega para atualizar tudo

            } catch (err) {
                console.error(err);
                status.innerText = "Erro ao importar: " + err.message;
                status.style.color = "red";
            }
        };

        reader.readAsText(file);
    });
}

// ==================================================
// 8. TELA DE LOGS DO SISTEMA
// ==================================================
async function renderScreenLogs() {
    const pageTitle = document.getElementById('page-title');
    pageTitle.innerHTML = '<i class="fa-solid fa-terminal"></i> Logs do Sistema';

    contentArea.innerHTML = `
        <div class="filter-bar" style="justify-content: space-between;">
            <div style="color:#666;">Histórico de movimentações</div>
            <button id="btn-limpar-logs" class="action-btn-main" style="background:#d32f2f; font-size:0.9rem;">
                <i class="fa-solid fa-fire"></i> Limpar Histórico
            </button>
        </div>
        <div class="table-responsive">
            <table class="custom-table">
                <thead>
                    <tr>
                        <th>Data/Hora</th>
                        <th>Usuário</th>
                        <th>Ação</th>
                        <th>Detalhes</th>
                    </tr>
                </thead>
                <tbody id="tabela-logs">
                    <tr><td colspan="4" style="text-align:center;">Carregando logs...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    try {
        // Busca os logs ordenados pela data (mais recente primeiro)
        // Nota: Limitamos a 100 para não travar se tiver muitos
        const q = query(collection(db, "sistema_logs"), orderBy("data", "desc")); 
        const querySnapshot = await getDocs(q);
        
        const tbody = document.getElementById('tabela-logs');
        tbody.innerHTML = '';

        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum registro encontrado.</td></tr>';
        } else {
            querySnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const dataFormatada = data.data && data.data.toDate ? data.data.toDate().toLocaleString('pt-BR') : '-';
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-size:0.85rem; color:#666;">${dataFormatada}</td>
                    <td style="font-weight:bold;">${data.usuario}</td>
                    <td><span class="tag-fixed" style="background:#e0f7fa; color:#006064;">${data.acao}</span></td>
                    <td style="font-size:0.9rem; color:#444;">${data.detalhes || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Botão Limpar Logs
        document.getElementById('btn-limpar-logs').addEventListener('click', async () => {
            if(confirm("ATENÇÃO: Isso apagará TODO o histórico de atividades. Confirma?")) {
                const btn = document.getElementById('btn-limpar-logs');
                btn.innerText = "Apagando...";
                btn.disabled = true;

                try {
                    const logsSnap = await getDocs(collection(db, "sistema_logs"));
                    const batch = writeBatch(db);
                    logsSnap.forEach(doc => {
                        batch.delete(doc.ref);
                    });
                    await batch.commit();
                    
                    alert("Histórico limpo com sucesso.");
                    renderScreenLogs();
                } catch (err) {
                    alert("Erro ao limpar: " + err.message);
                    btn.innerText = "Erro";
                }
            }
        });

    } catch (e) {
        console.error(e);
        document.getElementById('tabela-logs').innerHTML = '<tr><td colspan="4">Erro ao carregar logs.</td></tr>';
    }
}

// ==================================================
// 9. SISTEMA DE NOTIFICAÇÕES
// ==================================================
async function checkNotifications() {
    const bellIcon = document.querySelector('.fa-bell');
    if(!bellIcon) return; // Segurança

    // Garante que o container tenha posição relativa para a bolinha
    const containerActions = bellIcon.parentElement;
    containerActions.style.position = 'relative';

    try {
        // Busca todos os processos (exceto lixeira)
        const q = query(collection(db, "pre-processuais"));
        const querySnapshot = await getDocs(q);
        
        const alertas = [];
        const hoje = new Date();

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (data.lixeira) return;

            const id = docSnap.id;
            const num = data.num_processo || data.num_planilha || "S/N";
            const nome = data.solicitante ? data.solicitante.nome : "Desconhecido";

            // CRITÉRIO 1: Status "Com Pendências"
            if (data.status === 'Com Pendências') {
                alertas.push({
                    id: id,
                    tipo: 'pendencia',
                    titulo: `Pendência: Proc. ${num}`,
                    msg: `O cadastro de <b>${nome.split(' ')[0]}</b> consta com pendências.`
                });
            }

            // CRITÉRIO 2: 3 Dias sem movimentação
            if (data.data_ultima_movimentacao) {
                const dataMov = data.data_ultima_movimentacao.toDate();
                const diferencaTempo = Math.abs(hoje - dataMov);
                const diferencaDias = Math.ceil(diferencaTempo / (1000 * 60 * 60 * 24)); 

                if (diferencaDias >= 3) {
                    alertas.push({
                        id: id,
                        tipo: 'atraso',
                        titulo: `Parado há ${diferencaDias} dias`,
                        msg: `O processo ${num} não é atualizado desde ${dataMov.toLocaleDateString()}.`
                    });
                }
            }
        });

        // Atualiza a "Bolinha" (Badge)
        let badge = document.getElementById('notif-badge');
        if (alertas.length > 0) {
            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'notif-badge';
                badge.className = 'notification-badge';
                containerActions.appendChild(badge);
            }
            badge.innerText = alertas.length;
            badge.style.display = 'flex';
        } else {
            if (badge) badge.style.display = 'none';
        }

        // Configura o Clique no Sino
        bellIcon.style.cursor = 'pointer';
        // Remove listener antigo para não duplicar (truque do clone)
        const newBell = bellIcon.cloneNode(true);
        bellIcon.parentNode.replaceChild(newBell, bellIcon);
        
        newBell.addEventListener('click', () => showModalAlertas(alertas));

    } catch (e) {
        console.error("Erro ao verificar notificações:", e);
    }
}

function showModalAlertas(listaAlertas) {
    // Remove modal anterior se existir
    const oldModal = document.getElementById('modal-alerts');
    if(oldModal) oldModal.remove();

    const div = document.createElement('div');
    div.id = 'modal-alerts';
    div.className = 'modal-overlay';
    
    let itensHtml = '';
    if(listaAlertas.length === 0) {
        itensHtml = '<div style="text-align:center; padding:20px; color:#666;">Nenhum alerta no momento. Tudo em dia!</div>';
    } else {
        listaAlertas.forEach((alerta, index) => {
            const classeExtra = alerta.tipo === 'pendencia' ? 'alert-pendencia' : 'alert-atraso';
            const icone = alerta.tipo === 'pendencia' ? '<i class="fa-solid fa-triangle-exclamation" style="color:#f57c00;"></i>' : '<i class="fa-solid fa-clock" style="color:#d32f2f;"></i>';
            
            // ALTERAÇÃO AQUI: Removemos o onclick="loadScreen..." e adicionamos a classe 'btn-ver-alerta' e 'data-id'
            itensHtml += `
                <div class="alert-item ${classeExtra}" id="alert-item-${index}">
                    <div style="display:flex; gap:15px; align-items:center;">
                        <div style="font-size:1.2rem;">${icone}</div>
                        <div class="alert-info">
                            <strong>${alerta.titulo}</strong>
                            <small>${alerta.msg}</small>
                        </div>
                    </div>
                    <div style="display:flex; gap:10px;">
                         <button class="btn-mini btn-ver-alerta" data-id="${alerta.id}" title="Ver Processo"><i class="fa-solid fa-arrow-right"></i></button>
                         <button class="btn-dismiss-alert" onclick="document.getElementById('alert-item-${index}').remove(); atualizarContadorBadge();" title="Dispensar"><i class="fa-solid fa-times"></i></button>
                    </div>
                </div>
            `;
        });
    }

    div.innerHTML = `
        <div class="modal-content" style="max-width:500px; max-height:80vh; display:flex; flex-direction:column;">
            <div class="modal-header">
                <h3><i class="fa-regular fa-bell"></i> Central de Alertas</h3>
                <button class="btn-close-modal" onclick="document.getElementById('modal-alerts').remove()">✖</button>
            </div>
            <div class="form-body" style="overflow-y:auto; padding:15px; background:#f9f9f9;">
                ${itensHtml}
            </div>
            <div class="modal-actions" style="justify-content:space-between;">
                <small style="color:#999;">* Dispensar remove o alerta da lista visualmente.</small>
                <button class="action-btn-main" style="background:#607d8b;" onclick="document.querySelectorAll('.alert-item').forEach(e => e.remove()); atualizarContadorBadge();">Limpar Tudo</button>
            </div>
        </div>
    `;

    document.body.appendChild(div);

    // CORREÇÃO: Adicionando o evento de clique via Javascript
    // Isso conecta o botão à função loadScreen corretamente
    document.querySelectorAll('.btn-ver-alerta').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            // Fecha o modal
            const modal = document.getElementById('modal-alerts');
            if(modal) modal.remove();
            
            // Navega para o processo
            loadScreen('detalhes-processo', id);
        });
    });
}

// Função auxiliar para baixar o número da bolinha quando o usuário exclui itens
window.atualizarContadorBadge = function() {
    const total = document.querySelectorAll('.alert-item').length;
    const badge = document.getElementById('notif-badge');
    if(badge) {
        badge.innerText = total;
        if(total === 0) badge.style.display = 'none';
    }
};

// ==================================================
// 10. DASHBOARD INICIAL (KPIS)
// ==================================================
// ==================================================
// 10. DASHBOARD INICIAL (KPIS) - COM FILTRO DE DATA
// ==================================================
// ==================================================
// 10. DASHBOARD INICIAL (KPIS) - COM BADGE NA AGENDA
// ==================================================
async function renderScreenDashboard() {
    const pageTitle = document.getElementById('page-title');
    pageTitle.innerHTML = '<i class="fa-solid fa-chart-line"></i> Painel de Controle';

    contentArea.innerHTML = `
        <div style="text-align:center; padding:50px;">
            <i class="fa-solid fa-circle-notch fa-spin fa-2x" style="color:var(--col-primary);"></i>
            <p>Calculando indicadores...</p>
        </div>
    `;

    try {
        // 1. Busca todos os PROCESSOS (ativos e lixeira)
        const q = query(collection(db, "pre-processuais"));
        const querySnapshot = await getDocs(q);
        
        let todosDados = [];
        querySnapshot.forEach((docSnap) => {
            todosDados.push(docSnap.data());
        });

        // 2. Busca eventos da AGENDA para HOJE (Para a bolinha azul)
        const hojeISO = new Date().toISOString().split('T')[0]; // Pega data YYYY-MM-DD de hoje
        const qAgenda = query(collection(db, "agenda_eventos"), where("data", "==", hojeISO));
        const snapAgenda = await getDocs(qAgenda);
        
        let pendenciasAgendaHoje = 0;
        snapAgenda.forEach(doc => {
            // Conta apenas o que não está concluído
            if(doc.data().status !== 'concluido') pendenciasAgendaHoje++;
        });

        // 3. Renderiza a Estrutura HTML
        // Note o botão da Agenda alterado com 'position: relative' e a div do 'badge'
        contentArea.innerHTML = `
            <div class="welcome-card" style="margin-bottom:30px; padding:25px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px;">
                <div>
                    <h3 style="margin-bottom:5px;">Olá, Gestor!</h3>
                    <p style="opacity:0.9;">Aqui está o resumo do seu escritório.</p>
                </div>
                
                <div style="background: rgba(255,255,255,0.2); padding: 10px; border-radius: 8px; display:flex; gap:10px; align-items:flex-end;">
                    <div>
                        <label style="font-size:0.75rem; display:block; margin-bottom:2px;">Data Inicial</label>
                        <input type="date" id="dash-start" style="border:none; border-radius:4px; padding:5px; color:#333;">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; display:block; margin-bottom:2px;">Data Final</label>
                        <input type="date" id="dash-end" style="border:none; border-radius:4px; padding:5px; color:#333;">
                    </div>
                    <button id="btn-limpar-filtro" title="Limpar Filtro" style="background:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer; height:36px; color:var(--col-primary);">
                        <i class="fa-solid fa-filter-circle-xmark"></i>
                    </button>
                </div>
            </div>

            <div class="dashboard-grid">
                <div class="kpi-card">
                    <div class="kpi-header">
                        <span>Total no Período</span>
                        <i class="fa-solid fa-folder-open"></i>
                    </div>
                    <div class="kpi-value" id="kpi-total">-</div>
                    <div class="kpi-subtext">Cadastros criados</div>
                </div>

                <div class="kpi-card kpi-red">
                    <div class="kpi-header" style="color:#d32f2f;">
                        <span>Com Pendências</span>
                        <i class="fa-solid fa-triangle-exclamation"></i>
                    </div>
                    <div class="kpi-value" id="kpi-pendentes">-</div>
                    <div class="kpi-subtext">Neste período</div>
                </div>

                <div class="kpi-card kpi-blue">
                    <div class="kpi-header" style="color:#1565c0;">
                        <span>Aguard. Audiência</span>
                        <i class="fa-solid fa-gavel"></i>
                    </div>
                    <div class="kpi-value" id="kpi-audiencia">-</div>
                    <div class="kpi-subtext">Neste período</div>
                </div>

                <div class="kpi-card">
                    <div class="kpi-header">
                        <span>Meta do Mês Atual</span>
                        <i class="fa-solid fa-bullseye"></i>
                    </div>
                    <div style="font-size:1.5rem; font-weight:bold; color:var(--col-primary);">
                        <span id="kpi-meta-valor">-</span> <span style="font-size:1rem; color:#999;">/ 30</span>
                    </div>
                    <div class="progress-container">
                        <div class="progress-bar" id="kpi-meta-bar" style="width: 0%"></div>
                    </div>
                    <div class="kpi-subtext" style="text-align:right; margin-top:5px;" id="kpi-meta-text">0% atingido</div>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:20px;">
                
                <div class="kpi-card">
                    <h4 style="color:var(--col-primary); margin-bottom:15px;">Eficiência no Período</h4>
                    <div class="simple-chart">
                        <div class="chart-bar-group">
                            <div class="chart-value-top" id="chart-val-concluido">0</div>
                            <div class="chart-bar" id="bar-concluido" style="height:0%; background:#2e7d32;" title="Concluídos"></div>
                            <div class="chart-label">Concluídos</div>
                        </div>
                        <div class="chart-bar-group">
                            <div class="chart-value-top" id="chart-val-prejudicado">0</div>
                            <div class="chart-bar" id="bar-prejudicado" style="height:0%; background:#d32f2f;" title="Prejudicados"></div>
                            <div class="chart-label">Prejudicados</div>
                        </div>
                         <div class="chart-bar-group">
                            <div class="chart-value-top" id="chart-val-pendente">0</div>
                            <div class="chart-bar" id="bar-pendente" style="height:0%; background:#f57f17;" title="Pendentes"></div>
                            <div class="chart-label">Pendentes</div>
                        </div>
                    </div>
                </div>

                <div class="kpi-card" style="justify-content:flex-start;">
                    <h4 style="color:var(--col-primary); margin-bottom:15px;">Acesso Rápido</h4>
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                        
                        <button id="btn-quick-add" style="padding:15px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:8px; cursor:pointer; text-align:center; transition:0.2s;">
                            <i class="fa-solid fa-plus fa-2x" style="color:var(--col-primary); margin-bottom:5px;"></i>
                            <div style="font-size:0.85rem; font-weight:bold;">Novo Cadastro</div>
                        </button>
                        
                        <button id="btn-quick-agenda" style="position:relative; padding:15px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:8px; cursor:pointer; text-align:center; transition:0.2s;">
                            
                            <div id="badge-agenda-dashboard" style="display:none; position:absolute; top:-8px; right:-8px; background:#1565c0; color:white; border-radius:50%; width:24px; height:24px; align-items:center; justify-content:center; font-size:0.75rem; font-weight:bold; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);">0</div>

                            <i class="fa-regular fa-calendar-days fa-2x" style="color:var(--col-primary); margin-bottom:5px;"></i>
                            <div style="font-size:0.85rem; font-weight:bold;">Agenda</div>
                        </button>

                        <button id="btn-quick-backup" style="padding:15px; border:1px solid #e2e8f0; background:#f8fafc; border-radius:8px; cursor:pointer; text-align:center; transition:0.2s;">
                            <i class="fa-solid fa-cloud-arrow-down fa-2x" style="color:var(--col-primary); margin-bottom:5px;"></i>
                            <div style="font-size:0.85rem; font-weight:bold;">Backup</div>
                        </button>

                    </div>
                </div>
            </div>
        `;

        // 4. Exibe a bolinha se tiver pendências
        const badgeEl = document.getElementById('badge-agenda-dashboard');
        if(pendenciasAgendaHoje > 0) {
            badgeEl.innerText = pendenciasAgendaHoje;
            badgeEl.style.display = 'flex';
        }

        // 5. Função que recalcula KPIs (Mantida Igual)
        const atualizarKPIs = () => {
            const inputStart = document.getElementById('dash-start').value;
            const inputEnd = document.getElementById('dash-end').value;

            let dataInicio = inputStart ? new Date(inputStart + "T00:00:00") : null;
            let dataFim = inputEnd ? new Date(inputEnd + "T23:59:59") : (inputStart ? new Date() : null);
            if(dataFim) dataFim.setHours(23,59,59,999);

            let totalAtivos = 0, pendentes = 0, audiencia = 0, concluidos = 0, prejudicados = 0;
            const hoje = new Date();
            const mesAtual = hoje.getMonth();
            const anoAtual = hoje.getFullYear();
            let novosEsteMes = 0;

            todosDados.forEach((data) => {
                if (!data.lixeira) {
                    const dataCriacao = data.data_criacao && data.data_criacao.toDate ? data.data_criacao.toDate() : null;

                    if (dataCriacao && dataCriacao.getMonth() === mesAtual && dataCriacao.getFullYear() === anoAtual) {
                        novosEsteMes++;
                    }

                    let entraNaContagem = true;
                    if (dataInicio && dataCriacao) {
                        if (dataCriacao < dataInicio) entraNaContagem = false;
                        if (dataFim && dataCriacao > dataFim) entraNaContagem = false;
                    }

                    if (entraNaContagem) {
                        totalAtivos++;
                        const status = data.status || "";
                        if (status === 'Com Pendências') pendentes++;
                        else if (status === 'Aguardando Audiência') audiencia++;
                        else if (status === 'Concluído') concluidos++;
                        else if (status === 'Prejudicado') prejudicados++;
                    }
                }
            });

            const metaMensal = 30;
            const porcentagemMeta = Math.min(Math.round((novosEsteMes / metaMensal) * 100), 100);
            document.getElementById('kpi-meta-valor').innerText = novosEsteMes;
            document.getElementById('kpi-meta-bar').style.width = `${porcentagemMeta}%`;
            document.getElementById('kpi-meta-text').innerText = `${porcentagemMeta}% atingido`;

            document.getElementById('kpi-total').innerText = totalAtivos;
            document.getElementById('kpi-pendentes').innerText = pendentes;
            document.getElementById('kpi-audiencia').innerText = audiencia;

            const maxChart = Math.max(concluidos, prejudicados, pendentes, 1);
            document.getElementById('chart-val-concluido').innerText = concluidos;
            document.getElementById('bar-concluido').style.height = `${Math.round((concluidos / maxChart) * 100)}%`;
            document.getElementById('chart-val-prejudicado').innerText = prejudicados;
            document.getElementById('bar-prejudicado').style.height = `${Math.round((prejudicados / maxChart) * 100)}%`;
            document.getElementById('chart-val-pendente').innerText = pendentes;
            document.getElementById('bar-pendente').style.height = `${Math.round((pendentes / maxChart) * 100)}%`;
        };

        const startInput = document.getElementById('dash-start');
        const endInput = document.getElementById('dash-end');
        startInput.addEventListener('change', atualizarKPIs);
        endInput.addEventListener('change', atualizarKPIs);
        document.getElementById('btn-limpar-filtro').addEventListener('click', () => {
            startInput.value = ''; endInput.value = ''; atualizarKPIs();
        });

        atualizarKPIs();

        // 6. Listeners dos Botões
        const btnAdd = document.getElementById('btn-quick-add');
        if(btnAdd) btnAdd.addEventListener('click', () => loadScreen('adicionar-pre'));

        const btnAgenda = document.getElementById('btn-quick-agenda');
        if(btnAgenda) btnAgenda.addEventListener('click', () => loadScreen('agenda-geral'));

        const btnBackup = document.getElementById('btn-quick-backup');
        if(btnBackup) btnBackup.addEventListener('click', () => loadScreen('backup'));

    } catch (e) {
        console.error("Erro no dashboard:", e);
        contentArea.innerHTML = `<p style="color:red; text-align:center;">Erro ao carregar dashboard: ${e.message}</p>`;
    }
}

// ==================================================
// 11. TELA: AGENDA GERAL (DESIGN PREMIUM)
// ==================================================
async function renderScreenAgenda() {
    const pageTitle = document.getElementById('page-title');
    pageTitle.innerHTML = '<i class="fa-regular fa-calendar-days"></i> Agenda Geral';

    // 1. Estrutura HTML da tela
    contentArea.innerHTML = `
        <div class="welcome-card" style="background:white; color:#333; border:1px solid #e2e8f0; padding:20px; margin-bottom:20px;">
            <div id="calendar" style="max-height: 75vh;"></div>
        </div>
        
        <div id="modal-agenda-list" class="modal-overlay hidden">
            <div class="modal-content" style="max-width: 600px; display:flex; flex-direction:column; max-height:80vh;">
                <div class="modal-header">
                    <h3 id="agenda-list-title"><i class="fa-solid fa-list-check"></i> Tarefas do Dia</h3>
                    <button id="btn-close-agenda-list" class="btn-close-modal">✖</button>
                </div>
                <div id="agenda-list-body" class="form-body" style="overflow-y:auto; background:#f8fafc; padding:10px;">
                    </div>
            </div>
        </div>

        <style>
            /* Reset visual do FullCalendar para ficar limpo */
            .fc-toolbar-title { font-size: 1.2rem !important; color: var(--col-primary); font-weight: 700; }
            .fc-button-primary { background-color: var(--col-primary) !important; border-color: var(--col-primary) !important; text-transform: capitalize; }
            .fc-day-today { background-color: #f8fafc !important; }
            .fc-col-header-cell-cushion { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 0.8rem; }
            .fc-daygrid-day-number { color: #334155; font-weight: 600; }

            /* =========================================
               NOVO DESIGN DOS EVENTOS (CARD SOFT UI)
               ========================================= */
            .fc-event {
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
                margin-bottom: 4px !important;
            }

            .custom-event-badge {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                border-radius: 6px;
                font-size: 0.85rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                border-left: 3px solid transparent; /* A borda colorida esquerda */
                box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }

            .custom-event-badge:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 6px rgba(0,0,0,0.08);
            }

            /* Estilo PENDENTE (Vermelho/Laranja Suave) */
            .badge-pendente {
                background-color: #fef2f2; /* Vermelho muito claro */
                color: #b91c1c;            /* Vermelho escuro */
                border-left-color: #ef4444; /* Vermelho vibrante */
            }

            /* Estilo CONCLUÍDO (Verde Menta Suave) */
            .badge-concluido {
                background-color: #f0fdf4; /* Verde muito claro */
                color: #15803d;            /* Verde escuro */
                border-left-color: #22c55e; /* Verde vibrante */
            }

            /* Estilo da Lista dentro do Modal (Mantido igual) */
            .agenda-item-row {
                background: white; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;
                margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px;
                border-left: 4px solid var(--col-primary);
            }
            .agenda-item-row.done { border-left-color: #2e7d32; background: #f1f8e9; opacity: 0.8; }
            .agenda-info { flex: 1; cursor: pointer; }
            .agenda-actions { display: flex; gap: 8px; }
            .btn-action-agenda { width: 32px; height: 32px; border-radius: 4px; border: 1px solid #ccc; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
            .btn-action-agenda:hover { transform: translateY(-2px); }
            .btn-act-check:hover { background: #e8f5e9; color: #2e7d32; border-color: #a5d6a7; }
            .btn-act-date:hover { background: #e3f2fd; color: #1565c0; border-color: #90caf9; }
            .btn-act-del:hover { background: #ffebee; color: #d32f2f; border-color: #ef9a9a; }
            .agenda-time { font-size: 0.8rem; color: #64748b; font-weight: 600; margin-bottom: 2px; }
            .agenda-title { font-size: 1rem; color: #334155; font-weight: 700; }
            .agenda-proc { font-size: 0.85rem; color: #94a3b8; margin-top: 4px; }
        </style>
    `;

    try {
        const q = query(collection(db, "agenda_eventos"));
        const querySnapshot = await getDocs(q);
        
        const eventosMap = {}; 

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const diaKey = data.data; 
            
            if (!eventosMap[diaKey]) {
                eventosMap[diaKey] = { pendentes: [], concluidos: [] };
            }

            const item = { id: doc.id, ...data };

            if (data.status === 'concluido') {
                eventosMap[diaKey].concluidos.push(item);
            } else {
                eventosMap[diaKey].pendentes.push(item);
            }
        });

        const eventosCalendar = [];

        Object.keys(eventosMap).forEach(dia => {
            const diaData = eventosMap[dia];

            // PENDÊNCIAS
            if (diaData.pendentes.length > 0) {
                const qtd = diaData.pendentes.length;
                eventosCalendar.push({
                    start: dia,
                    // Passamos dados customizados para o renderizador
                    extendedProps: {
                        tipo: 'pendente', // Usado para escolher a classe CSS
                        texto: qtd === 1 ? "1 Pendência" : `${qtd} Pendências`,
                        icone: '<i class="fa-solid fa-clock"></i>', // Ícone de relógio
                        listaCompleta: diaData
                    }
                });
            }

            // CONCLUÍDOS
            if (diaData.concluidos.length > 0) {
                const qtd = diaData.concluidos.length;
                eventosCalendar.push({
                    start: dia,
                    extendedProps: {
                        tipo: 'concluido',
                        texto: qtd === 1 ? "1 Concluído" : `${qtd} Concluídos`,
                        icone: '<i class="fa-solid fa-check-circle"></i>', // Ícone de check
                        listaCompleta: diaData
                    }
                });
            }
        });

        const calendarEl = document.getElementById('calendar');
        const calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'pt-br',
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth'
            },
            events: eventosCalendar,
            
            // --- AQUI ESTÁ A MÁGICA VISUAL ---
            // Em vez de usar o padrão, nós "desenhamos" o HTML do evento
            eventContent: function(arg) {
                const props = arg.event.extendedProps;
                const classeCss = props.tipo === 'pendente' ? 'badge-pendente' : 'badge-concluido';
                
                // Retorna um HTML personalizado
                return {
                    html: `
                        <div class="custom-event-badge ${classeCss}">
                            ${props.icone}
                            <span>${props.texto}</span>
                        </div>
                    `
                };
            },

            eventClick: function(info) {
                const props = info.event.extendedProps;
                const dataFormatada = info.event.start.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
                abrirModalLista(dataFormatada, props.listaCompleta);
            }
        });

        calendar.render();

        // 5. Lógica do Modal (Mantida)
        const modalList = document.getElementById('modal-agenda-list');
        const listBody = document.getElementById('agenda-list-body');
        const listTitle = document.getElementById('agenda-list-title');

        document.getElementById('btn-close-agenda-list').addEventListener('click', () => {
            modalList.classList.add('hidden');
        });

        function abrirModalLista(dataTexto, listas) {
            listTitle.innerHTML = `<i class="fa-solid fa-clock"></i> ${dataTexto}`;
            listBody.innerHTML = '';

            const todosItens = [
                ...listas.pendentes.map(i => ({...i, isDone: false})),
                ...listas.concluidos.map(i => ({...i, isDone: true}))
            ];

            todosItens.sort((a, b) => {
                if (a.isDone === b.isDone) return (a.hora || '00:00').localeCompare(b.hora || '00:00');
                return a.isDone ? 1 : -1;
            });

            if(todosItens.length === 0) {
                listBody.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Nada agendado para este dia.</p>';
                return;
            }

            todosItens.forEach(task => {
                const div = document.createElement('div');
                div.className = `agenda-item-row ${task.isDone ? 'done' : ''}`;
                
                const horaDisplay = task.hora ? `<i class="fa-regular fa-clock"></i> ${task.hora}` : 'Dia todo';
                const obsDisplay = task.obs ? `<div style="font-size:0.8rem; color:#666; margin-top:5px; font-style:italic;">"${task.obs}"</div>` : '';
                const styleTitle = task.isDone ? 'text-decoration: line-through; color: #888;' : '';

                div.innerHTML = `
                    <div class="agenda-info">
                        <div class="agenda-time">${horaDisplay}</div>
                        <div class="agenda-title" style="${styleTitle}">${task.tipo}</div>
                        <div class="agenda-proc">Proc: ${task.processo_num || 'S/N'}</div>
                        ${obsDisplay}
                    </div>
                    <div class="agenda-actions">
                        ${!task.isDone ? 
                            `<button class="btn-action-agenda btn-act-check" title="Concluir" onclick="window.agendaAction('concluir', '${task.id}')"><i class="fa-solid fa-check"></i></button>` : 
                            `<button class="btn-action-agenda btn-act-check" title="Reabrir" onclick="window.agendaAction('reabrir', '${task.id}')" style="color:#999;"><i class="fa-solid fa-rotate-left"></i></button>`
                        }
                        <button class="btn-action-agenda btn-act-date" title="Reagendar" onclick="window.agendaAction('reagendar', '${task.id}')"><i class="fa-regular fa-calendar-days"></i></button>
                        <button class="btn-action-agenda btn-act-del" title="Excluir" onclick="window.agendaAction('excluir', '${task.id}')"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `;

                div.querySelector('.agenda-info').addEventListener('click', () => {
                    if(task.processo_id) {
                        modalList.classList.add('hidden');
                        loadScreen('detalhes-processo', task.processo_id);
                    }
                });
                listBody.appendChild(div);
            });
            modalList.classList.remove('hidden');
        }

        // --- FUNÇÕES DE AÇÃO (GLOBAIS PARA O ONCLICK FUNCIONAR) ---
        window.agendaAction = async function(action, id) {
            const docRefEvent = doc(db, "agenda_eventos", id);

            try {
                if (action === 'concluir') {
                    await updateDoc(docRefEvent, { status: 'concluido' });
                    renderScreenAgenda();
                
                } else if (action === 'reabrir') {
                    await updateDoc(docRefEvent, { status: 'pendente' });
                    renderScreenAgenda();

                } else if (action === 'excluir') {
                    if(confirm("Tem certeza que deseja excluir este agendamento?")) {
                        await deleteDoc(docRefEvent);
                        renderScreenAgenda();
                    }

                } else if (action === 'reagendar') {
                    // 1. Pede a data no formato BRASILEIRO
                    const inputData = prompt("Digite a nova data (DD/MM/AAAA):", "30/11/2025");
                    
                    if (inputData) {
                        // 2. Verifica se foi digitado corretamente (Ex: 30/11/2025)
                        if(!/^\d{2}\/\d{2}\/\d{4}$/.test(inputData)) {
                            alert("Formato inválido. Por favor use DIA/MÊS/ANO (Ex: 30/11/2025)");
                            return;
                        }

                        // 3. Converte de BR (DD/MM/AAAA) para Banco (AAAA-MM-DD)
                        const partes = inputData.split('/'); // Quebra onde tem a barra
                        // partes[0] é Dia, partes[1] é Mês, partes[2] é Ano
                        const dataBanco = `${partes[2]}-${partes[1]}-${partes[0]}`;

                        const novaHora = prompt("Digite a nova hora (HH:MM) ou deixe vazio:", "09:00");
                        
                        await updateDoc(docRefEvent, { 
                            data: dataBanco, // Salva no formato que o sistema entende
                            hora: novaHora || '',
                            status: 'pendente' 
                        });
                        
                        alert("Reagendado com sucesso!");
                        renderScreenAgenda();
                    }
                }
            } catch (error) {
                console.error("Erro na ação:", error);
                alert("Erro ao processar ação: " + error.message);
            }
        };

    } catch (e) {
        console.error("Erro agenda:", e);
        contentArea.innerHTML = `<p style="color:red; padding:20px;">Erro: ${e.message}</p>`;
    }
}

// ==================================================
// EVENTO: BOTÃO NOVO CADASTRO (TOPO)
// ==================================================
// Aguarda o HTML carregar para garantir que o botão existe
const btnTopNew = document.getElementById('btn-top-new');
if(btnTopNew) {
    btnTopNew.addEventListener('click', () => {
        // Usa a função de navegação existente para ir à tela de cadastro
        loadScreen('adicionar-pre');
    });
}