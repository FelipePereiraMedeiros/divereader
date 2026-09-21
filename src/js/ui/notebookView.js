/**
 * Renderizador da Interface do Caderno de Estudos (Cards de Grifos + Síntese + Sumário TOC + Fichamento)
 * com Suporte a Busca em Tempo Real e Filtragem Semântica por Cores
 */

import { appState } from '../state.js';
import { HighlightService } from '../services/highlightService.js';
import { NoteService } from '../services/noteService.js';
import { DialogService } from './dialogs.js';
import { showToast } from './toast.js';
import { DOM, refreshIcons } from './dom.js';
import { EVENTS } from '../constants.js';

// Templates SVG pré-compilados para eliminar Layout Thrashing na renderização de listas longas de grifos
const SVG_ICONS = {
  QUOTE: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path></svg>`,
  EYE: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  TRASH: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>`,
  BOOK: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
  EXTERNAL_LINK: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>`,
  HIGHLIGHTER: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="m9 11-6 6v3h3l6-6"></path><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"></path></svg>`,
  MESSAGE: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; color: var(--primary); flex-shrink: 0;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
  PEN: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path></svg>`,
  SEARCH_X: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 4px; display: inline-block;"><circle cx="11" cy="11" r="8"></circle><line x1="21" x2="16.65" y1="21" y2="16.65"></line><line x1="8" x2="14" y1="8" y2="14"></line><line x1="14" x2="8" y1="8" y2="14"></line></svg>`,
};

export const NotebookView = {
  /** Callback opcional de navegação externa */
  onNavigatePage: null,

  COLOR_LABELS: {
    yellow: '🟡 Conceito',
    green: '🟢 Exemplo',
    pink: '🔴 Dúvida',
    blue: '🔵 Citação',
    purple: '🟣 Tese',
  },

  /**
   * Escapa caracteres HTML para exibição segura
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  /**
   * Destaca termos coincidentes da busca no texto
   * @param {string} text
   * @param {string} query
   * @returns {string}
   */
  highlightMatch(text, query) {
    if (!text) return '';
    const safeText = this.escapeHtml(text);
    if (!query || !query.trim()) return safeText;

    const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${q})`, 'gi');
    return safeText.replace(regex, '<mark class="search-match">$1</mark>');
  },

  /**
   * Inicializa ouvintes e comportamentos do Caderno
   */
  init(callbacks = {}) {
    if (callbacks.onNavigatePage) {
      this.onNavigatePage = callbacks.onNavigatePage;
    }

    // Reatividade: renderiza sempre que os grifos mudarem
    appState.on(EVENTS.HIGHLIGHTS_UPDATED, () => {
      this.render();
    });

    // Campo de Busca em Tempo Real
    const searchInput = DOM.notebookSearchInput || document.getElementById('notebook-search-input');
    const clearBtn = DOM.btnClearSearch || document.getElementById('btn-clear-search');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        appState.set({ searchQuery: query });
        if (clearBtn) {
          clearBtn.classList.toggle('hidden', !query);
        }
        this.render();
      });
    }

    if (clearBtn) {
      clearBtn.onclick = () => {
        if (searchInput) searchInput.value = '';
        appState.set({ searchQuery: '' });
        clearBtn.classList.add('hidden');
        this.render();
      };
    }

    // Chips de Filtro de Cor
    const filterChipsContainer = DOM.colorFilterChips || document.getElementById('color-filter-chips');
    if (filterChipsContainer) {
      filterChipsContainer.addEventListener('click', (e) => {
        const chip = e.target.closest('.color-chip');
        if (!chip) return;

        filterChipsContainer.querySelectorAll('.color-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');

        const color = chip.dataset.color || 'all';
        appState.set({ activeColorFilter: color });
        this.render();
      });
    }

    // Alternância de Abas
    if (DOM.tabBtnPage) {
      DOM.tabBtnPage.onclick = () => this.switchTab('page');
    }
    if (DOM.tabBtnGlobal) {
      DOM.tabBtnGlobal.onclick = () => this.switchTab('global');
    }
    if (DOM.tabBtnToc) {
      DOM.tabBtnToc.onclick = () => this.switchTab('toc');
    }

    // Auto-save da Síntese Manual
    if (DOM.notepad) {
      let saveTimeout;
      DOM.notepad.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        const currentPage = appState.get('pageNum') || 1;
        saveTimeout = setTimeout(() => {
          NoteService.savePageSynthesis(currentPage, DOM.notepad.value);
        }, 250);
      });
    }

    // Copiar Fichamento
    if (DOM.btnCopyGlobal) {
      DOM.btnCopyGlobal.onclick = async () => {
        const ok = await NoteService.copyToClipboard();
        if (ok) {
          showToast('Fichamento copiado com sucesso!', 'copy-check');
        } else {
          showToast('Nenhum conteúdo para copiar.', 'alert-circle');
        }
      };
    }

    // Baixar Fichamento Markdown
    if (DOM.btnDownloadNotes) {
      DOM.btnDownloadNotes.onclick = () => {
        const text = NoteService.compileGlobalDossier();
        if (text.includes('Nenhuma anotação')) {
          return showToast('Não há notas ou grifos para baixar.', 'file-warning');
        }
        NoteService.downloadMarkdownDossier();
        showToast('Fichamento baixado em Markdown!', 'download-cloud');
      };
    }

    // Fechar Sidebar
    if (DOM.btnCloseSidebar) {
      DOM.btnCloseSidebar.onclick = () => this.toggleSidebar(false);
    }
  },

  /**
   * Navega para uma página e fecha a sidebar no mobile se necessário
   * @param {number} pageNum
   */
  navigateTo(pageNum) {
    if (!pageNum) return;
    if (this.onNavigatePage) {
      this.onNavigatePage(pageNum);
    } else if (window.app && typeof window.app.renderPages === 'function') {
      window.app.renderPages(pageNum);
    } else if (DOM.pageInput) {
      DOM.pageInput.value = String(pageNum);
      DOM.pageInput.dispatchEvent(new Event('change'));
    }

    // No mobile, fecha a sidebar ao selecionar item do sumário
    if (window.innerWidth <= 820) {
      this.toggleSidebar(false);
    }
  },

  /**
   * Alterna a visibilidade da barra lateral (Caderno)
   * @param {boolean} [forceState]
   */
  toggleSidebar(forceState) {
    if (!DOM.sidebar) return;
    const isCurrentlyHidden = DOM.sidebar.classList.contains('hidden');
    const shouldBeOpen = typeof forceState === 'boolean' ? forceState : isCurrentlyHidden;

    if (shouldBeOpen) {
      DOM.sidebar.classList.remove('hidden');
      appState.set({ isSidebarOpen: true });
      this.render();
    } else {
      DOM.sidebar.classList.add('hidden');
      appState.set({ isSidebarOpen: false });
    }
  },

  /**
   * Alterna entre as abas 'page', 'global' e 'toc'
   * @param {'page'|'global'|'toc'} tab
   */
  switchTab(tab) {
    appState.set({ activeTab: tab });

    if (DOM.tabBtnPage) DOM.tabBtnPage.classList.toggle('active', tab === 'page');
    if (DOM.tabBtnGlobal) DOM.tabBtnGlobal.classList.toggle('active', tab === 'global');
    if (DOM.tabBtnToc) DOM.tabBtnToc.classList.toggle('active', tab === 'toc');

    if (DOM.tabPage) DOM.tabPage.classList.toggle('active', tab === 'page');
    if (DOM.tabGlobal) DOM.tabGlobal.classList.toggle('active', tab === 'global');
    if (DOM.tabToc) DOM.tabToc.classList.toggle('active', tab === 'toc');

    if (tab === 'global') {
      this.renderGlobalDossier();
    } else if (tab === 'toc') {
      this.renderToc();
    }
  },

  /**
   * Renderiza os dados do caderno para a página ativa com filtros de busca e cor
   */
  render() {
    const pageNum = appState.get('pageNum') || 1;
    const isSingle = appState.isSinglePageMode();
    const highlights = appState.get('highlights') || {};
    const searchQuery = (appState.get('searchQuery') || '').trim().toLowerCase();
    const activeColorFilter = appState.get('activeColorFilter') || 'all';

    // Obtém grifos da página ativa (e da página direita se estiver no modo livro aberto de 2 páginas)
    let rawPageHighlights = [...(highlights[pageNum] || [])];
    if (!isSingle) {
      const rightPageNum = pageNum + 1;
      const rightHighlights = highlights[rightPageNum] || [];
      rawPageHighlights = [...rawPageHighlights, ...rightHighlights];
    }

    // Aplica filtro por cor e por termo de busca
    const filteredHighlights = rawPageHighlights.filter((h) => {
      const matchColor = activeColorFilter === 'all' || (h.color || 'yellow') === activeColorFilter;
      if (!matchColor) return false;

      if (!searchQuery) return true;
      const matchText = (h.text || '').toLowerCase().includes(searchQuery);
      const matchNote = (h.note || '').toLowerCase().includes(searchQuery);
      return matchText || matchNote;
    });

    // Atualiza a lista de cards de grifos
    const container = DOM.highlightsContainer || document.getElementById('page-highlights-list');
    if (container) {
      container.innerHTML = '';

      const countBadge = document.getElementById('page-highlights-count');
      if (countBadge) countBadge.textContent = String(filteredHighlights.length);

      if (filteredHighlights.length === 0) {
        const isFiltering = !!searchQuery || activeColorFilter !== 'all';
        container.innerHTML = `
          <div class="empty-highlights-hint">
            ${isFiltering ? SVG_ICONS.SEARCH_X : SVG_ICONS.HIGHLIGHTER}
            <p style="margin: 0;">${isFiltering ? 'Nenhum grifo corresponde ao filtro atual.' : 'Nenhum grifo nesta página.'}</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; opacity: 0.8;">${isFiltering ? 'Tente limpar a busca ou selecionar outra cor.' : 'Selecione qualquer trecho de texto no PDF para grifar!'}</p>
          </div>
        `;
      } else {
        filteredHighlights.forEach((h) => {
          const hPageNum = h.pageNum || pageNum;
          const card = document.createElement('div');
          const colorKey = h.color || 'yellow';
          card.className = `highlight-card color-${colorKey}`;
          card.dataset.highlightId = h.id;

          const badgeLabel = this.COLOR_LABELS[colorKey] || '🟡 Conceito';
          const highlightedQuote = this.highlightMatch(h.text, searchQuery);

          card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="highlight-color-badge color-${colorKey}">${badgeLabel}</span>
              <select class="highlight-color-select" title="Alterar cor do grifo" style="font-size: 11px; padding: 1px 4px; height: 22px; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: var(--ui-bg);">
                <option value="yellow" ${colorKey === 'yellow' ? 'selected' : ''}>🟡 Amarelo</option>
                <option value="green" ${colorKey === 'green' ? 'selected' : ''}>🟢 Verde</option>
                <option value="pink" ${colorKey === 'pink' ? 'selected' : ''}>🔴 Rosa</option>
                <option value="blue" ${colorKey === 'blue' ? 'selected' : ''}>🔵 Azul</option>
                <option value="purple" ${colorKey === 'purple' ? 'selected' : ''}>🟣 Roxo</option>
              </select>
            </div>
            <div class="highlight-quote">"${highlightedQuote}"</div>
            <div class="highlight-card-note">
              <input 
                type="text" 
                placeholder="Adicionar nota a esta citação..." 
                value="${this.escapeHtml(h.note || '')}" 
                data-highlight-id="${h.id}"
              />
            </div>
            <div class="highlight-actions">
              <button class="btn-abnt" title="Copiar citação formatada ABNT">
                ${SVG_ICONS.QUOTE} Copiar ABNT
              </button>
              <button class="btn-locate" title="Localizar no documento">
                ${SVG_ICONS.EYE} Ver no PDF
              </button>
              <button class="btn-del" title="Excluir este grifo">
                ${SVG_ICONS.TRASH} Excluir
              </button>
            </div>
          `;

          // Evento: Alterar Cor do Grifo
          const colorSelect = card.querySelector('.highlight-color-select');
          if (colorSelect) {
            colorSelect.onchange = (e) => {
              const newColor = e.target.value;
              HighlightService.updateHighlightColor(hPageNum, h.id, newColor);
              this.render();
              showToast(`Cor do grifo alterada!`, 'palette');
            };
          }

          // Evento: Copiar Citação ABNT
          const btnAbnt = card.querySelector('.btn-abnt');
          if (btnAbnt) {
            btnAbnt.onclick = async () => {
              const citation = `"${h.text}" (Pág. ${hPageNum})`;
              try {
                await navigator.clipboard.writeText(citation);
                showToast('Citação ABNT copiada!', 'copy-check');
              } catch (err) {
                showToast('Erro ao copiar citação.', 'alert-circle');
              }
            };
          }

          // Evento: Ver no PDF (pisca o grifo)
          const btnLocate = card.querySelector('.btn-locate');
          if (btnLocate) {
            btnLocate.onclick = () => {
              HighlightService.flashHighlight(hPageNum, h.id);
            };
          }

          // Evento: Excluir Grifo com Diálogo Bidirecional
          const btnDel = card.querySelector('.btn-del');
          if (btnDel) {
            btnDel.onclick = async () => {
              const choice = await DialogService.confirmHighlightDeletion({
                title: 'Excluir Grifo',
                message: 'Você deseja excluir este grifo também da página do PDF?',
                quoteText: h.text,
                hasNote: !!(h.note && h.note.trim()),
                primaryActionText: 'Sim, excluir do Caderno e do PDF',
                secondaryActionText: 'Remover apenas do Caderno',
              });

              if (choice === 'delete-all' || choice === 'delete-one') {
                HighlightService.deleteHighlight(hPageNum, h.id);
                this.render();
                showToast('Grifo excluído com sucesso.', 'eraser');
              }
            };
          }

          // Evento: Editar Nota do Grifo em Tempo Real
          const noteInput = card.querySelector('.highlight-card-note input');
          if (noteInput) {
            let inputTimeout;
            noteInput.oninput = () => {
              clearTimeout(inputTimeout);
              inputTimeout = setTimeout(() => {
                HighlightService.updateHighlightNote(hPageNum, h.id, noteInput.value);
              }, 400);
            };
          }

          container.appendChild(card);
        });
      }
    }

    // Atualiza a síntese manual da página
    if (DOM.notepad) {
      DOM.notepad.value = NoteService.getPageSynthesis(pageNum);
    }

    // Atualiza aba global ou sumário se estiver ativa
    if (appState.get('activeTab') === 'global') {
      this.renderGlobalDossier();
    } else if (appState.get('activeTab') === 'toc') {
      this.renderToc();
    }
  },

  /**
   * Renderiza a árvore hierárquica do Sumário (TOC)
   */
  renderToc() {
    const tocListEl = DOM.tocList || document.getElementById('toc-list');
    if (!tocListEl) return;
    const outline = appState.get('outline') || [];
    const currentPage = appState.get('pageNum') || 1;

    tocListEl.innerHTML = '';

    if (!outline || outline.length === 0) {
      tocListEl.innerHTML = `
        <div class="toc-empty">
          <i data-lucide="bookmark" style="width: 32px; height: 32px; opacity: 0.4;"></i>
          <p style="margin: 0; font-weight: 600;">Nenhum sumário encontrado</p>
          <p style="margin: 0; font-size: 11.5px; opacity: 0.8;">Este documento PDF não possui bookmarks/sumário estruturado embutido.</p>
        </div>
      `;
      refreshIcons(tocListEl);
      return;
    }

    const renderTree = (items, containerNode) => {
      items.forEach((item) => {
        const itemEl = document.createElement('div');
        const isActive = item.pageNum && (item.pageNum === currentPage || item.pageNum === currentPage + 1);
        itemEl.className = `toc-item ${isActive ? 'active' : ''}`;

        itemEl.innerHTML = `
          <span class="toc-title" title="${item.title}">${item.title}</span>
          ${item.pageNum ? `<span class="toc-page">p. ${item.pageNum}</span>` : ''}
        `;

        if (item.pageNum) {
          itemEl.onclick = () => {
            this.navigateTo(item.pageNum);
          };
        }

        containerNode.appendChild(itemEl);

        if (item.items && item.items.length > 0) {
          const nestedContainer = document.createElement('div');
          nestedContainer.className = 'toc-nested';
          renderTree(item.items, nestedContainer);
          containerNode.appendChild(nestedContainer);
        }
      });
    };

    renderTree(outline, tocListEl);
    refreshIcons(tocListEl);
  },

  /**
   * Renderiza a aba de Fichamento Completo com cards estruturados por página e filtragem
   */
  renderGlobalDossier() {
    const globalViewEl = DOM.globalView || document.getElementById('global-view');
    if (!globalViewEl) return;
    const highlights = appState.get('highlights') || {};
    const manualNotes = appState.get('manualNotes') || {};
    const searchQuery = (appState.get('searchQuery') || '').trim().toLowerCase();
    const activeColorFilter = appState.get('activeColorFilter') || 'all';

    const pageSet = new Set([
      ...Object.keys(highlights).map(Number),
      ...Object.keys(manualNotes).map(Number),
    ]);

    const pages = Array.from(pageSet).sort((a, b) => a - b);
    globalViewEl.innerHTML = '';

    const validPages = pages.filter((pageNum) => {
      const pageHighlights = highlights[pageNum] || [];
      const pageSynthesis = (manualNotes[pageNum] || '').trim();

      const matchingHighlights = pageHighlights.filter((h) => {
        const matchColor = activeColorFilter === 'all' || (h.color || 'yellow') === activeColorFilter;
        if (!matchColor) return false;
        if (!searchQuery) return true;
        return (
          (h.text || '').toLowerCase().includes(searchQuery) ||
          (h.note || '').toLowerCase().includes(searchQuery)
        );
      });

      const matchSynthesis = !searchQuery || pageSynthesis.toLowerCase().includes(searchQuery);

      return matchingHighlights.length > 0 || (matchSynthesis && pageSynthesis.length > 0 && activeColorFilter === 'all');
    });

    if (validPages.length === 0) {
      const isFiltering = !!searchQuery || activeColorFilter !== 'all';
      globalViewEl.innerHTML = `
        <div class="global-empty-state">
          <i data-lucide="${isFiltering ? 'search-x' : 'file-text'}" style="width: 36px; height: 36px; opacity: 0.4;"></i>
          <p style="margin: 0; font-weight: 600;">${isFiltering ? 'Nenhum item corresponde ao filtro da busca.' : 'Nenhum fichamento gerado ainda.'}</p>
          <p style="margin: 0; font-size: 12px;">${isFiltering ? 'Experimente buscar por outros termos ou limpar os filtros.' : 'Seus grifos e anotações aparecerão compilados aqui automaticamente.'}</p>
        </div>
      `;
      refreshIcons(globalViewEl);
      return;
    }

    validPages.forEach((pageNum) => {
      const pageHighlights = highlights[pageNum] || [];
      const pageSynthesis = (manualNotes[pageNum] || '').trim();

      // Filtra os grifos da página
      const matchingHighlights = pageHighlights.filter((h) => {
        const matchColor = activeColorFilter === 'all' || (h.color || 'yellow') === activeColorFilter;
        if (!matchColor) return false;
        if (!searchQuery) return true;
        return (
          (h.text || '').toLowerCase().includes(searchQuery) ||
          (h.note || '').toLowerCase().includes(searchQuery)
        );
      });

      const pageCard = document.createElement('div');
      pageCard.className = 'global-page-card';

      // Header do Card da Página
      const header = document.createElement('div');
      header.className = 'global-page-header';
      header.innerHTML = `
        <span class="page-tag">
          ${SVG_ICONS.BOOK} Página ${pageNum}
        </span>
        <button class="btn-jump-page" title="Ir para a página ${pageNum}">
          ${SVG_ICONS.EXTERNAL_LINK} Ir para página
        </button>
      `;

      const btnJump = header.querySelector('.btn-jump-page');
      if (btnJump) {
        btnJump.onclick = () => {
          this.navigateTo(pageNum);
        };
      }

      pageCard.appendChild(header);

      // Seção de Grifos / Citações da Página
      if (matchingHighlights.length > 0) {
        const quotesSection = document.createElement('div');
        quotesSection.innerHTML = `
          <div class="global-section-title">
            ${SVG_ICONS.HIGHLIGHTER} Citações Grifadas (${matchingHighlights.length})
          </div>
        `;

        const quotesList = document.createElement('div');
        quotesList.className = 'global-quotes-list';

        matchingHighlights.forEach((h) => {
          const item = document.createElement('div');
          const colorKey = h.color || 'yellow';
          item.className = `global-quote-item color-${colorKey}`;
          const badgeLabel = this.COLOR_LABELS[colorKey] || '🟡 Conceito';
          const highlightedQuote = this.highlightMatch(h.text, searchQuery);

          item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="highlight-color-badge color-${colorKey}">${badgeLabel}</span>
            </div>
            <div class="global-quote-text">"${highlightedQuote}"</div>
            <div class="global-quote-note-edit">
              ${SVG_ICONS.MESSAGE}
              <input 
                type="text" 
                class="global-quote-note-input" 
                placeholder="Adicionar nota a este grifo..." 
                value="${this.escapeHtml(h.note || '')}" 
                data-highlight-id="${h.id}"
                data-page-num="${pageNum}"
              />
            </div>
            <div class="global-quote-actions">
              <button class="btn-abnt" title="Copiar citação ABNT">
                ${SVG_ICONS.QUOTE} Copiar ABNT
              </button>
              <button class="btn-locate" title="Ver grifo no PDF">
                ${SVG_ICONS.EYE} Ver no PDF
              </button>
              <button class="btn-del" title="Excluir este grifo">
                ${SVG_ICONS.TRASH} Excluir
              </button>
            </div>
          `;

          // Ação: Copiar ABNT
          const btnAbnt = item.querySelector('.btn-abnt');
          if (btnAbnt) {
            btnAbnt.onclick = async () => {
              const citation = `"${h.text}" (Pág. ${pageNum})`;
              try {
                await navigator.clipboard.writeText(citation);
                showToast('Citação ABNT copiada!', 'copy-check');
              } catch (err) {
                showToast('Erro ao copiar citação.', 'alert-circle');
              }
            };
          }

          // Ação: Editar Nota da Citação em Tempo Real
          const noteInput = item.querySelector('.global-quote-note-input');
          if (noteInput) {
            let noteTimer;
            noteInput.oninput = () => {
              clearTimeout(noteTimer);
              noteTimer = setTimeout(() => {
                HighlightService.updateHighlightNote(pageNum, h.id, noteInput.value);
                if (appState.get('pageNum') === pageNum) {
                  const cardInput = (DOM.highlightsContainer || document).querySelector(
                    `input[data-highlight-id="${h.id}"]`,
                  );
                  if (cardInput && cardInput.value !== noteInput.value) {
                    cardInput.value = noteInput.value;
                  }
                }
              }, 300);
            };
          }

          // Ação: Localizar e piscar no PDF
          const btnLocate = item.querySelector('.btn-locate');
          if (btnLocate) {
            btnLocate.onclick = () => {
              this.navigateTo(pageNum);
              setTimeout(() => HighlightService.flashHighlight(pageNum, h.id), 350);
            };
          }

          // Ação: Excluir Grifo com Diálogo Bidirecional
          const btnDel = item.querySelector('.btn-del');
          if (btnDel) {
            btnDel.onclick = async () => {
              const choice = await DialogService.confirmHighlightDeletion({
                title: 'Excluir Grifo do Fichamento',
                message: 'Você deseja excluir este grifo também da página do PDF?',
                quoteText: h.text,
                hasNote: !!(h.note && h.note.trim()),
                primaryActionText: 'Sim, excluir do Fichamento e do PDF',
                secondaryActionText: 'Remover apenas do Fichamento',
              });

              if (choice === 'delete-all' || choice === 'delete-one') {
                HighlightService.deleteHighlight(pageNum, h.id);
                this.render();
                showToast('Grifo excluído com sucesso.', 'eraser');
              }
            };
          }

          quotesList.appendChild(item);
        });

        quotesSection.appendChild(quotesList);
        pageCard.appendChild(quotesSection);
      }

      // Seção de Síntese / Anotações da Página (Exibida se houver síntese ou se ativa)
      if (pageSynthesis.length > 0 && activeColorFilter === 'all') {
        const synthesisSection = document.createElement('div');
        synthesisSection.innerHTML = `
          <div class="global-section-title">
            ${SVG_ICONS.PEN} Síntese da Página
          </div>
          <textarea 
            class="global-synthesis-textarea" 
            placeholder="Escreva a síntese ou reflexões desta página..."
            data-page-num="${pageNum}"
          >${pageSynthesis}</textarea>
        `;

        const synthTextarea = synthesisSection.querySelector('.global-synthesis-textarea');
        if (synthTextarea) {
          let synthTimer;
          synthTextarea.oninput = () => {
            clearTimeout(synthTimer);
            synthTimer = setTimeout(() => {
              NoteService.savePageSynthesis(pageNum, synthTextarea.value);
              if (appState.get('pageNum') === pageNum && DOM.notepad) {
                DOM.notepad.value = synthTextarea.value;
              }
            }, 300);
          };
        }

        pageCard.appendChild(synthesisSection);
      }

      globalViewEl.appendChild(pageCard);
    });
  },
};
