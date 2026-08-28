import { describe, it, expect, beforeEach } from 'vitest';
import { Highlight } from '../../src/js/models/Highlight.js';
import { HighlightService } from '../../src/js/services/highlightService.js';
import { NoteService } from '../../src/js/services/noteService.js';
import { Storage } from '../../src/js/storage.js';
import { appState } from '../../src/js/state.js';

describe('Bidirectional Sync & Data Separation', () => {
  const fileKey = 'dr2_estudo_direito.pdf_45678';

  beforeEach(() => {
    localStorage.clear();
    appState.set({
      fileKey,
      fileName: 'estudo_direito.pdf',
      highlights: {},
      manualNotes: {},
      pageNum: 1,
    });
  });

  it('deve manter grifos e anotações manuais totalmente desacoplados no armazenamento', () => {
    const hl = new Highlight({
      id: 'hl_dir1',
      pageNum: 3,
      text: 'Princípio da dignidade da pessoa humana',
      rects: [{ x: 0.1, y: 0.2, width: 0.8, height: 0.03 }],
      note: 'Art. 1º, III da CF/88',
    });

    // Salva grifo
    Storage.saveHighlights(fileKey, { 3: [hl] });

    // Salva síntese manual separada
    NoteService.savePageSynthesis(3, 'Esta página trata dos fundamentos da República.');

    // Carrega do storage
    const loadedHighlights = Storage.loadHighlights(fileKey);
    const loadedNotes = Storage.loadManualNotes(fileKey);

    expect(loadedHighlights[3].length).toBe(1);
    expect(loadedHighlights[3][0].text).toBe('Princípio da dignidade da pessoa humana');
    expect(loadedHighlights[3][0].note).toBe('Art. 1º, III da CF/88');

    expect(loadedNotes[3]).toBe('Esta página trata dos fundamentos da República.');
  });

  it('deve permitir atualizar anotação vinculada ao grifo sem afetar a síntese manual da página', () => {
    const hl = new Highlight({
      id: 'hl_sync',
      pageNum: 4,
      text: 'Texto grifado',
      note: 'Nota inicial',
    });

    appState.set({
      highlights: { 4: [hl] },
      manualNotes: { 4: 'Síntese intocada' },
    });

    // Atualiza nota do grifo
    HighlightService.updateHighlightNote(4, 'hl_sync', 'Nova nota do grifo');

    const updatedHl = HighlightService.getHighlight(4, 'hl_sync');
    expect(updatedHl?.note).toBe('Nova nota do grifo');

    // Síntese deve permanecer a mesma
    expect(NoteService.getPageSynthesis(4)).toBe('Síntese intocada');
  });

  it('deve remover o grifo do estado e do storage sem apagar a síntese da página', () => {
    const hl1 = new Highlight({ id: 'hl_del', pageNum: 2, text: 'Remover este' });
    const hl2 = new Highlight({ id: 'hl_keep', pageNum: 2, text: 'Manter este' });

    appState.set({
      highlights: { 2: [hl1, hl2] },
      manualNotes: { 2: 'Minha anotação crítica da página 2.' },
    });

    HighlightService.deleteHighlight(2, 'hl_del');

    const remainingHighlights = appState.get('highlights')[2];
    expect(remainingHighlights.length).toBe(1);
    expect(remainingHighlights[0].id).toBe('hl_keep');

    // Síntese continua preservada
    expect(NoteService.getPageSynthesis(2)).toBe('Minha anotação crítica da página 2.');
  });
});
