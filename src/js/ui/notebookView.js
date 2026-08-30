/**
 * Renderizador da Interface do Caderno de Estudos (Cards de Grifos + Síntese + Sumário TOC + Fichamento)
 */

import { appState } from '../state.js';
import { HighlightService } from '../services/highlightService.js';
import { NoteService } from '../services/noteService.js';
import { DialogService } from './dialogs.js';
import { showToast } from './toast.js';
import { DOM, refreshIcons } from './dom.js';
import { EVENTS } from '../constants.js';

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
   * Renderiza os dados do caderno para a página ativa
   */
  render() {
    const pageNum = appState.get('pageNum') || 1;
    const isSingle = appState.isSinglePageMode();
    const highlights = appState.get('highlights') || {};

    // Obtém grifos da página ativa (e da página direita se estiver no modo livro aberto de 2 páginas)
    let pageHighlights = [...(highlights[pageNum] || [])];
    if (!isSingle) {
      const rightPageNum = pageNum + 1;
      const rightHighlights = highlights[rightPageNum] || [];
      pageHighlights = [...pageHighlights, ...rightHighlights];
    }

    // Atualiza a lista de cards de grifos
    const container = DOM.highlightsContainer || document.getElementById('page-highlights-list');
    if (container) {
      container.innerHTML = '';

      const countBadge = document.getElementById('page-highlights-count');
      if (countBadge) countBadge.textContent = String(pageHighlights.length);

      if (pageHighlights.length === 0) {
        container.innerHTML = `
          <div class="empty-highlights-hint">
            <i data-lucide="highlighter" style="width: 20px; height: 20px; margin-bottom: 4px; display: inline-block;"></i>
            <p style="margin: 0;">Nenhum grifo nesta página.</p>
            <p style="margin: 4px 0 0 0; font-size: 11px; opacity: 0.8;">Selecione qualquer trecho de texto no PDF para grifar!</p>
          </div>
        `;
      } else {
        pageHighlights.forEach((h) => {
          const hPageNum = h.pageNum || pageNum;
          const card = document.createElement('div');
          const colorKey = h.color || 'yellow';
          card.className = `highlight-card color-${colorKey}`;
          card.dataset.highlightId = h.id;

          const badgeLabel = this.COLOR_LABELS[colorKey] || '🟡 Conceito';

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
            <div class="highlight-quote">"${h.text}"</div>
            <div class="highlight-card-note">
              <input 
                type="text" 
                placeholder="Adicionar nota a esta citação..." 
                value="${h.note || ''}" 
                data-highlight-id="${h.id}"
              />
            </div>
            <div class="highlight-actions">
              <button class="btn-abnt" title="Copiar citação formatada ABNT">
                <i data-lucide="quote" style="width: 12px; height: 12px;"></i> Copiar ABNT
              </button>
              <button class="btn-locate" title="Localizar no documento">
                <i data-lucide="eye" style="width: 12px; height: 12px;"></i> Ver no PDF
              </button>
              <button class="btn-del" title="Excluir este grifo">
                <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Excluir
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
                title: 'Excluir Grifo do Caderno',
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

          // Evento: Input da nota vinculada ao grifo
          const noteInput = card.querySelector('input');
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

      refreshIcons(container);
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
   * Renderiza a aba de Fichamento Completo com cards estruturados por página
   */
  renderGlobalDossier() {
    const globalViewEl = DOM.globalView || document.getElementById('global-view');
    if (!globalViewEl) return;
    const highlights = appState.get('highlights') || {};
    const manualNotes = appState.get('manualNotes') || {};

    const pageSet = new Set([
      ...Object.keys(highlights).map(Number),
      ...Object.keys(manualNotes).map(Number),
    ]);

    const pages = Array.from(pageSet).sort((a, b) => a - b);
    globalViewEl.innerHTML = '';

    const validPages = pages.filter((p) => {
      const hList = highlights[p] || [];
      const note = (manualNotes[p] || '').trim();
      return hList.length > 0 || note.length > 0;
    });

    if (validPages.length === 0) {
      globalViewEl.innerHTML = `
        <div class="global-empty-state">
          <i data-lucide="file-text" style="width: 36px; height: 36px; opacity: 0.4;"></i>
          <p style="margin: 0; font-weight: 600;">Nenhum fichamento gerado ainda.</p>
          <p style="margin: 0; font-size: 12px;">Seus grifos e anotações aparecerão compilados aqui automaticamente.</p>
        </div>
      `;
      refreshIcons(globalViewEl);
      return;
    }

    validPages.forEach((pageNum) => {
      const pageHighlights = highlights[pageNum] || [];
      const pageSynthesis = (manualNotes[pageNum] || '').trim();

      const pageCard = document.createElement('div');
      pageCard.className = 'global-page-card';

      // Header do Card da Página
      const header = document.createElement('div');
      header.className = 'global-page-header';
      header.innerHTML = `
        <span class="page-tag">
          <i data-lucide="book-open" style="width: 14px; height: 14px;"></i> Página ${pageNum}
        </span>
        <button class="btn-jump-page" title="Ir para a página ${pageNum}">
          <i data-lucide="external-link" style="width: 12px; height: 12px;"></i> Ir para página
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
      if (pageHighlights.length > 0) {
        const quotesSection = document.createElement('div');
        quotesSection.innerHTML = `
          <div class="global-section-title">
            <i data-lucide="highlighter" style="width: 12px; height: 12px;"></i> Citações Grifadas (${pageHighlights.length})
          </div>
        `;

        const quotesList = document.createElement('div');
        quotesList.className = 'global-quotes-list';

        pageHighlights.forEach((h) => {
          const item = document.createElement('div');
          const colorKey = h.color || 'yellow';
          item.className = `global-quote-item color-${colorKey}`;
          const badgeLabel = this.COLOR_LABELS[colorKey] || '🟡 Conceito';

          item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="highlight-color-badge color-${colorKey}">${badgeLabel}</span>
            </div>
            <div class="global-quote-text">"${h.text}"</div>
            <div class="global-quote-note-edit">
              <i data-lucide="message-square" style="width: 13px; height: 13px; color: var(--primary); flex-shrink: 0;"></i>
              <input 
                type="text" 
                class="global-quote-note-input" 
                placeholder="Adicionar nota a este grifo..." 
                value="${h.note || ''}" 
                data-highlight-id="${h.id}"
                data-page-num="${pageNum}"
              />
            </div>
            <div class="global-quote-actions">
              <button class="btn-abnt" title="Copiar citação ABNT">
                <i data-lucide="quote" style="width: 11px; height: 11px;"></i> Copiar ABNT
              </button>
              <button class="btn-locate" title="Ver grifo no PDF">
                <i data-lucide="eye" style="width: 11px; height: 11px;"></i> Ver no PDF
              </button>
              <button class="btn-del" title="Excluir este grifo">
                <i data-lucide="trash-2" style="width: 11px; height: 11px;"></i> Excluir
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

      // Seção de Síntese / Anotações da Página (Totalmente Editável)
      const synthesisSection = document.createElement('div');
      synthesisSection.innerHTML = `
        <div class="global-section-title">
          <i data-lucide="pen-tool" style="width: 12px; height: 12px;"></i> Síntese da Página
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
      globalViewEl.appendChild(pageCard);
    });

    refreshIcons(globalViewEl);
  },
};
