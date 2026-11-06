import { describe, it, expect, beforeEach } from 'vitest';
import { NotebookView } from '../../src/js/ui/notebookView.js';
import { NoteService } from '../../src/js/services/noteService.js';
import { HighlightService } from '../../src/js/services/highlightService.js';
import { DialogService } from '../../src/js/ui/dialogs.js';
import { showToast } from '../../src/js/ui/toast.js';
import { Highlight } from '../../src/js/models/Highlight.js';
import { Storage } from '../../src/js/storage.js';
import { appState } from '../../src/js/state.js';
import { DOM } from '../../src/js/ui/dom.js';

const fileKey = 'dr2_review.pdf_123';

describe('Correções da revisão geral', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="global-view"></div>
      <div id="toc-list"></div>
      <div id="page-highlights-list"></div>
      <textarea id="notepad"></textarea>
    `;
    DOM.globalView = document.getElementById('global-view');
    DOM.tocList = document.getElementById('toc-list');
    DOM.highlightsContainer = document.getElementById('page-highlights-list');
    DOM.notepad = document.getElementById('notepad');
    appState.set({
      fileKey,
      fileName: 'review.pdf',
      pageNum: 1,
      highlights: {},
      manualNotes: {},
      outline: [],
      searchQuery: '',
      activeColorFilter: 'all',
      activeTab: 'page',
    });
  });

  it('Fichamento renderiza sínteses salvas no formato de objeto (PageSynthesis) sem quebrar', () => {
    NoteService.savePageSynthesis(2, 'Síntese da página 2');
    expect(typeof appState.get('manualNotes')[2]).toBe('object');

    expect(() => NotebookView.renderGlobalDossier()).not.toThrow();
    const textarea = DOM.globalView.querySelector('.global-synthesis-textarea');
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('Síntese da página 2');
  });

  it('Fichamento escapa o conteúdo da síntese (não injeta HTML)', () => {
    NoteService.savePageSynthesis(1, '</textarea><img src=x onerror="window.__pwned=1">');
    NotebookView.renderGlobalDossier();
    expect(DOM.globalView.querySelector('img')).toBeNull();
    expect(DOM.globalView.querySelector('.global-synthesis-textarea').value).toContain('<img');
  });

  it('Sumário escapa títulos vindos do PDF e é acessível por teclado', () => {
    appState.set({ outline: [{ title: '<img src=x onerror=alert(1)>Cap. 1', pageNum: 3, items: [] }] });
    NotebookView.renderToc();
    expect(DOM.tocList.querySelector('img')).toBeNull();
    const item = DOM.tocList.querySelector('.toc-item');
    expect(item.textContent).toContain('<img src=x onerror=alert(1)>Cap. 1');
    expect(item.getAttribute('role')).toBe('button');
    expect(item.tabIndex).toBe(0);
  });

  it('Diálogo de confirmação escapa o trecho citado', async () => {
    // JSDOM não implementa <dialog>.showModal/close
    HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
    HTMLDialogElement.prototype.close ??= function () { this.open = false; };
    const promise = DialogService.confirmHighlightDeletion({
      title: 'Excluir',
      message: 'Confirma?',
      quoteText: '<b id="injetado">x</b>',
    });
    const dialog = document.getElementById('confirm-dialog');
    expect(dialog.querySelector('#injetado')).toBeNull();
    dialog.querySelector('#modal-btn-cancel').click();
    await expect(promise).resolves.toBe('cancel');
  });

  it('Toast exibe a mensagem como texto puro', () => {
    showToast('<i id="toast-injetado"></i>Olá');
    expect(document.getElementById('toast-injetado')).toBeNull();
    expect(document.querySelector('.toast span').textContent).toBe('<i id="toast-injetado"></i>Olá');
  });

  it('removeHighlightMarks remove a marcação do PDF mas mantém citação e nota no Caderno', () => {
    const hl = new Highlight({
      id: 'hl_keep_text',
      pageNum: 4,
      text: 'Trecho importante',
      rects: [{ x: 0.1, y: 0.1, width: 0.5, height: 0.02 }],
      note: 'Minha nota',
      color: 'blue',
    });
    appState.set({ highlights: { 4: [hl] } });

    HighlightService.removeHighlightMarks(4, 'hl_keep_text');

    const [updated] = appState.get('highlights')[4];
    expect(updated.rects).toEqual([]);
    expect(updated.text).toBe('Trecho importante');
    expect(updated.note).toBe('Minha nota');
    expect(updated.color).toBe('blue');
    expect(Storage.loadHighlights(fileKey)[4][0].rects).toEqual([]);
  });

  it('Backup não trata a chave de preferências (_prefs) como um documento separado', () => {
    localStorage.setItem(`${fileKey}_page`, '3');
    localStorage.setItem(`${fileKey}_prefs`, '{"zoomLevel":1}');
    const backup = Storage.getAllDataForBackup();
    expect(backup.totalDocuments).toBe(1);
  });
});
