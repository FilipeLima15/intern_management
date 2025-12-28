// menu.js - Gerador da Sidebar Global e Funcionalidades Universais

document.addEventListener("DOMContentLoaded", function() {
    
    // 1. Onde colocar a sidebar?
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    // 2. Lógica de Caminhos
    // Verifica se estamos dentro da pasta 'outros'
    const inSubfolder = window.location.pathname.includes('/outros/');

    // Prefixo para voltar para a raiz (se estiver na subpasta, usa "../", senão usa nada)
    const toRoot = inSubfolder ? '../' : '';       
    
    // Prefixo para entrar na pasta (se estiver na raiz, usa "outros/", senão usa nada)
    const toFolder = inSubfolder ? '' : 'outros/'; 

    // Links do sistema corrigidos
    const links = {
        home: toRoot + 'home.html',
        cronograma: toRoot + 'Cronograma.HTML',
        acompanhamento: toRoot + 'index.html',
        jurisprudencia: toRoot + 'jurisprudencia.html',
        charts: toRoot + 'charts.html', // Caminho correto para o gráfico
        concurso: localStorage.getItem("concursoURL") || "#"
    };

    // 3. Detectar Página Ativa
    const currentPath = window.location.pathname;
    const isActive = (key) => {
        if (key === 'home' && (currentPath.endsWith('home.html') || currentPath.endsWith('/') || (currentPath.endsWith('index.html') && !inSubfolder))) return true;
        if (key === 'cronograma' && currentPath.includes('Cronograma')) return true;
        if (key === 'acompanhamento' && currentPath.includes('index.html') && inSubfolder) return true;
        if (key === 'jurisprudencia' && currentPath.includes('jurisprudencia')) return true;
        return false;
    };

    // Função auxiliar para classes CSS do botão
    const getBtnClass = (active) => active 
        ? "w-10 h-10 rounded-xl bg-sky-500 text-white shadow-lg flex items-center justify-center transition transform scale-105" 
        : "w-10 h-10 rounded-xl text-sky-300 hover:bg-sky-800 hover:text-white flex items-center justify-center transition";

    // 4. HTML da Sidebar
    const sidebarHTML = `
        <aside class="w-16 bg-sky-900 text-sky-100 flex flex-col items-center py-6 shadow-2xl z-30 flex-shrink-0 transition-colors duration-300 h-full">
            
            <a href="${links.home}" class="mb-8 p-2 bg-sky-800 rounded-lg cursor-pointer hover:bg-sky-700 transition flex items-center justify-center shadow-lg group">
                <div class="font-bold text-xl text-white">⏺</div>
            </a>

            <nav class="flex-1 flex flex-col gap-4 w-full px-2">
                
                <a href="${links.home}" class="${getBtnClass(isActive('home'))}" title="Início">
                    <i class="fa-solid fa-house"></i>
                </a>

                <a href="${links.cronograma}" class="${getBtnClass(isActive('cronograma'))}" title="Cronograma">
                    <i class="fa-solid fa-calendar-days"></i>
                </a>

                <a href="${links.acompanhamento}" class="${getBtnClass(isActive('acompanhamento'))}" title="Acompanhamento">
                    <i class="fa-solid fa-list-check"></i>
                </a>

                <a href="${links.jurisprudencia}" class="${getBtnClass(isActive('jurisprudencia'))}" title="Jurisprudência">
                    <i class="fa-solid fa-gavel"></i>
                </a>

                <a href="#" id="btnChartsMenu" class="${getBtnClass(false)}" title="Gráficos">
                    <i class="fa-solid fa-chart-pie"></i>
                </a>

                <a href="${links.concurso}" target="_blank" class="w-10 h-10 rounded-xl text-sky-300 hover:bg-sky-800 hover:text-white flex items-center justify-center transition" title="Link do Concurso">
                    <i class="fa-solid fa-link"></i>
                </a>
                
                <button id="btnLogout" class="w-10 h-10 mt-auto rounded-xl text-red-300 hover:bg-red-900 hover:text-white flex items-center justify-center transition" title="Sair">
                    <i class="fa-solid fa-right-from-bracket"></i>
                </button>
            </nav>
        </aside>
    `;

    // 5. Injetar na página
    sidebarContainer.innerHTML = sidebarHTML;

    // 6. FUNÇÃO DO MODAL DE GRÁFICOS (Definida aqui para funcionar em todas as páginas)
    function openChartsOverlay() {
        if (document.getElementById('chartsOverlay')) return;

        // Cria o fundo do modal
        const overlay = document.createElement('div');
        overlay.id = 'chartsOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; 
            display: flex; align-items: center; justify-content: center; 
            background: rgba(0,0,0,0.55); z-index: 99999; 
            padding: 20px; backdrop-filter: blur(3px);
        `;
        
        // Cria o container branco
        const frameWrap = document.createElement('div');
        frameWrap.style.cssText = `
            width: 100%; max-width: 1200px; height: 90%; 
            background: #fff; border-radius: 16px; 
            overflow: hidden; position: relative; 
            display: flex; flex-direction: column; 
            box-shadow: 0 20px 50px rgba(0,0,0,0.2);
        `;
        
        // Cria o iframe apontando para o link correto
        const iframe = document.createElement('iframe');
        iframe.id = 'chartsIframe'; 
        iframe.src = links.charts; // Usa o link calculado lá em cima
        iframe.style.cssText = 'width: 100%; height: 100%; border: 0; display: block; background: #fff;';
        
        // Botão de fechar manual (X)
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `
            position: absolute; top: 15px; right: 20px; 
            background: none; border: none; font-size: 32px; 
            color: #64748b; cursor: pointer; z-index: 10; line-height: 1;
        `;
        closeBtn.onclick = () => overlay.remove();

        // Monta o modal
        frameWrap.appendChild(closeBtn);
        frameWrap.appendChild(iframe);
        overlay.appendChild(frameWrap);
        
        // Fecha ao clicar fora
        overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };

        document.body.appendChild(overlay);

        // Ouve mensagem para fechar (caso venha de dentro do iframe)
        window.addEventListener('message', function(event) {
            if (event.data && event.data.action === 'closeChartsOverlay') {
                overlay.remove();
            }
        }, { once: true });
    }

    // 7. Adiciona o evento de clique no botão
    const btnCharts = document.getElementById('btnChartsMenu');
    if(btnCharts) {
        btnCharts.addEventListener('click', (e) => {
            e.preventDefault();
            openChartsOverlay();
        });
    }
});