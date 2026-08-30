import { describe, it, expect, beforeEach } from 'vitest';
import { appState } from '../../src/js/state.js';
import { Storage } from '../../src/js/storage.js';
import { Highlight } from '../../src/js/models/Highlight.js';
import { HighlightService } from '../../src/js/services/highlightService.js';
import { NoteService } from '../../src/js/services/noteService.js';
import { BackupService } from '../../src/js/services/backupService.js';

describe('App Study Workflow Integration', () => {
  const fileKey = 'dr2_livro_completo.pdf_99999';

  beforeEach(() => {
    localStorage.clear();
    appState.set({
      fileKey,
      fileName: 'livro_completo.pdf',
      highlights: {},
      manualNotes: {},
      pageNum: 1,
      totalPages: 10,
    });
  });

  it('deve simular um fluxo de estudo completo: leitura, grifos múltiplos, anotações, compilação e backup', () => {
    // 1. O estudante lê a página 1 e adiciona um grifo
    const hlPage1 = new Highlight({
      id: 'hl_p1',
      pageNum: 1,
      text: 'O método científico começa pela observação.',
      rects: [{ x: 0.1, y: 0.2, width: 0.7, height: 0.03 }],
      note: 'Premissa fundamental',
    });

    appState.set({
      highlights: { 1: [hlPage1] },
      manualNotes: { 1: 'Introdução ao método empírico.' },
    });
    Storage.saveHighlights(fileKey, appState.get('highlights'));
    Storage.saveManualNotes(fileKey, appState.get('manualNotes'));

    // 2. O estudante avança para a página 2 e adiciona novo grifo e síntese
    const hlPage2 = new Highlight({
      id: 'hl_p2',
      pageNum: 2,
      text: 'Hipóteses devem ser passíveis de falseamento.',
      rects: [{ x: 0.15, y: 0.35, width: 0.6, height: 0.04 }],
      note: 'Karl Popper',
    });

    const currentHighlights = appState.get('highlights');
    appState.set({
      pageNum: 2,
      highlights: { ...currentHighlights, 2: [hlPage2] },
      manualNotes: {
        ...appState.get('manualNotes'),
        2: 'Critério de demarcação científica.',
      },
    });
    Storage.saveHighlights(fileKey, appState.get('highlights'));
    Storage.saveManualNotes(fileKey, appState.get('manualNotes'));

    // 3. Verifica a compilação do Fichamento Geral
    const compiledDossier = NoteService.compileGlobalDossier();
    expect(compiledDossier).toContain('PÁGINA 1');
    expect(compiledDossier).toContain('O método científico começa pela observação.');
    expect(compiledDossier).toContain('PÁGINA 2');
    expect(compiledDossier).toContain('Hipóteses devem ser passíveis de falseamento.');
    expect(compiledDossier).toContain('Karl Popper');

    // 4. Verifica geração de Markdown
    const markdown = NoteService.generateMarkdown();
    expect(markdown).toContain('# 📖 Fichamento de Leitura');
    expect(markdown).toContain('## 📄 Página 1');
    expect(markdown).toContain('## 📄 Página 2');

    // 5. O estudante exporta o backup
    const backupData = Storage.getAllDataForBackup();
    expect(Object.keys(backupData).length).toBeGreaterThan(0);

    // 6. Simula a restauração em um navegador limpo
    localStorage.clear();
    const { count } = Storage.restoreBackup(backupData);
    expect(count).toBeGreaterThan(0);

    // 7. Recarrega os dados do documento restaurado
    const loadedHls = Storage.loadHighlights(fileKey);
    const loadedNotes = Storage.loadManualNotes(fileKey);

    expect(loadedHls[1].length).toBe(1);
    expect(loadedHls[2].length).toBe(1);
    expect(loadedHls[2][0].note).toBe('Karl Popper');
    expect(loadedNotes[2]).toBe('Critério de demarcação científica.');
  });
});
