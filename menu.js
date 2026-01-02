// menu.js - Versão para Arquivos na RAIZ

document.addEventListener("DOMContentLoaded", function() {
    
    const sidebarContainer = document.getElementById('sidebar-container');
    if (!sidebarContainer) return;

    // Links DIRETOS (Sem pastas, pois tudo está junto)
    const links = {
        home: 'home.html',
        cronograma: 'Cronograma.HTML',
        acompanhamento: 'index.html',
        jurisprudencia: 'jurisprudencia.html',
        charts: 'charts.html',
        concurso: localStorage.getItem("concursoURL") || "#"
    };

    // Detectar página ativa
    const currentPath = window.location.pathname;
    const isActive = (key) => {
        if (key === 'acompanhamento' && (currentPath.endsWith('index.html') || currentPath === '/')) return true;
        if (key === 'home' && currentPath.includes('home.html')) return true;
        if (key === 'cronograma' && currentPath.includes('Cronograma')) return true;
        if (key === 'jurisprudencia' && currentPath.includes('jurisprudencia')) return true;
        return false;
    };

    const getBtnClass = (active) => active 
        ? "w-10 h-10 rounded-xl bg-sky-500 text-white shadow-lg flex items-center justify-center transition transform scale-105" 
        : "w-10 h-10 rounded-xl text-sky-300 hover:bg-sky-800 hover:text-white flex items-center justify-center transition";

    const sidebarHTML = `
        <aside class="w-16 bg-sky-900 text-sky-100 flex flex-col items-center py-6 shadow-2xl z-30 flex-shrink-0 transition-colors duration-300 h-full">
            <a href="${links.home}" class="mb-8 p-2 bg-sky-800 rounded-lg cursor-pointer hover:bg-sky-700 transition flex items-center justify-center shadow-lg group">
                <div class="font-bold text-xl text-white">⏺</div>
            </a>
            <nav class="flex-1 flex flex-col gap-4 w-full px-2">
                <a href="${links.home}" class="${getBtnClass(isActive('home'))}" title="Início"><i class="fa-solid fa-house"></i></a>
                <a href="${links.cronograma}" class="${getBtnClass(isActive('cronograma'))}" title="Cronograma"><i class="fa-solid fa-calendar-days"></i></a>
                <a href="${links.acompanhamento}" class="${getBtnClass(isActive('acompanhamento'))}" title="Acompanhamento"><i class="fa-solid fa-list-check"></i></a>
                <a href="${links.jurisprudencia}" class="${getBtnClass(isActive('jurisprudencia'))}" title="Jurisprudência"><i class="fa-solid fa-gavel"></i></a>
                <a href="Flashcards.html" class="w-10 h-10 rounded-xl text-sky-300 hover:bg-sky-800 hover:text-white flex items-center justify-center transition" title="Flashcards">
                <i class="fa-solid fa-layer-group"></i>
                </a>
                <a href="#" id="btnChartsMenu" class="${getBtnClass(false)}" title="Gráficos"><i class="fa-solid fa-chart-pie"></i></a>
                <a href="${links.concurso}" target="_blank" class="w-10 h-10 rounded-xl text-sky-300 hover:bg-sky-800 hover:text-white flex items-center justify-center transition" title="Link do Concurso"><i class="fa-solid fa-link"></i></a>
                <button id="btnLogout" class="w-10 h-10 mt-auto rounded-xl text-red-300 hover:bg-red-900 hover:text-white flex items-center justify-center transition" title="Sair"><i class="fa-solid fa-right-from-bracket"></i></button>
            </nav>
        </aside>
    `;

    sidebarContainer.innerHTML = sidebarHTML;

    // Lógica do Modal de Gráficos (Mantida e integrada)
    function openChartsOverlay() {
        if (document.getElementById('chartsOverlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'chartsOverlay';
        overlay.style.cssText = `position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); z-index: 99999; padding: 20px; backdrop-filter: blur(3px);`;
        
        const frameWrap = document.createElement('div');
        frameWrap.style.cssText = `width: 100%; max-width: 1200px; height: 90%; background: #fff; border-radius: 16px; overflow: hidden; position: relative; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,0.2);`;
        
        const iframe = document.createElement('iframe');
        iframe.id = 'chartsIframe'; 
        iframe.src = links.charts; // Agora aponta corretamente para 'charts.html' na raiz
        iframe.style.cssText = 'width: 100%; height: 100%; border: 0; display: block; background: #fff;';
        
        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = `position: absolute; top: 15px; right: 20px; background: none; border: none; font-size: 32px; color: #64748b; cursor: pointer; z-index: 10; line-height: 1;`;
        closeBtn.onclick = () => overlay.remove();

        frameWrap.appendChild(closeBtn);
        frameWrap.appendChild(iframe);
        overlay.appendChild(frameWrap);
        overlay.onclick = (ev) => { if (ev.target === overlay) overlay.remove(); };
        document.body.appendChild(overlay);

        window.addEventListener('message', function(event) {
            if (event.data && event.data.action === 'closeChartsOverlay') overlay.remove();
        }, { once: true });
    }

    const btnCharts = document.getElementById('btnChartsMenu');
    if(btnCharts) {
        btnCharts.addEventListener('click', (e) => {
            e.preventDefault();
            openChartsOverlay();
        });
    }
});