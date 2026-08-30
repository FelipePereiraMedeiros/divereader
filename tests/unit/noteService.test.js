import { describe, it, expect, beforeEach } from 'vitest';
import { NoteService } from '../../src/js/services/noteService.js';
import { Highlight } from '../../src/js/models/Highlight.js';
import { appState } from '../../src/js/state.js';

describe('Note Service', () => {
  beforeEach(() => {
    localStorage.clear();
    appState.set({
      fileKey: 'dr2_artigo.pdf_777',
      fileName: 'artigo.pdf',
      highlights: {},
      manualNotes: {},
      pageNum: 1,
    });
  });

  it('deve salvar e obter a síntese manual da página', () => {
    NoteService.savePageSynthesis(1, 'Primeira síntese do capítulo');
    expect(NoteService.getPageSynthesis(1)).toBe('Primeira síntese do capítulo');
  });

  it('deve retornar mensagem padrão ao compilar fichamento vazio', () => {
    const compiled = NoteService.compileGlobalDossier();
    expect(compiled).toBe('Nenhuma anotação ou grifo feito ainda.');
  });

  it('deve compilar fichamento global com grifos, comentários vinculados e síntese', () => {
    const hl = new Highlight({
      id: 'hl_1',
      pageNum: 2,
      text: 'A ciência avança em paradigmas.',
      note: 'Conceito de Thomas Kuhn',
    });

    appState.set({
      highlights: { 2: [hl] },
      manualNotes: {
        2: 'Refletir sobre a estrutura das revoluções científicas.',
      },
    });

    const compiled = NoteService.compileGlobalDossier();
    expect(compiled).toContain('PÁGINA 2');
    expect(compiled).toContain('A ciência avança em paradigmas.');
    expect(compiled).toContain('Conceito de Thomas Kuhn');
    expect(compiled).toContain('Refletir sobre a estrutura das revoluções científicas.');
  });

  it('deve gerar markdown com formatação estruturada para exportação', () => {
    const hl = new Highlight({
      id: 'hl_md',
      pageNum: 5,
      text: 'O design é como funciona.',
      note: 'Steve Jobs quote',
    });

    appState.set({
      highlights: { 5: [hl] },
      manualNotes: { 5: 'Síntese da página 5' },
    });

    const md = NoteService.generateMarkdown();
    expect(md).toContain('# 📖 Fichamento de Leitura');
    expect(md).toContain('## 📄 Página 5');
    expect(md).toContain('> "O design é como funciona."');
    expect(md).toContain('> **Nota:** *Steve Jobs quote*');
    expect(md).toContain('### ✍️ Síntese da Página');
    expect(md).toContain('Síntese da página 5');
  });
});
