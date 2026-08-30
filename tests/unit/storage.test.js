import { describe, it, expect, beforeEach } from 'vitest';
import { Storage } from '../../src/js/storage.js';
import { Highlight } from '../../src/js/models/Highlight.js';

describe('Storage Module', () => {
  const sampleFileKey = 'dr2_livro_teste.pdf_12345';

  beforeEach(() => {
    localStorage.clear();
  });

  it('deve gerar a chave de arquivo com o prefixo correto', () => {
    const key = Storage.generateFileKey('capitulo1.pdf', 54321);
    expect(key).toBe('dr2_capitulo1.pdf_54321');
  });

  it('deve salvar e recuperar a última página lida', () => {
    Storage.savePage(sampleFileKey, 14);
    expect(Storage.loadPage(sampleFileKey)).toBe(14);
  });

  it('deve retornar página 1 como padrão se não houver página salva', () => {
    expect(Storage.loadPage('chave_inexistente')).toBe(1);
  });

  it('deve salvar e carregar grifos estruturados v2', () => {
    const highlight1 = new Highlight({
      id: 'hl_1',
      pageNum: 3,
      text: 'Conceito importante sobre arquitetura',
      rects: [{ x: 0.1, y: 0.2, width: 0.5, height: 0.05 }],
      note: 'Rever para a prova',
    });

    Storage.saveHighlights(sampleFileKey, { 3: [highlight1] });
    const loaded = Storage.loadHighlights(sampleFileKey);

    expect(loaded[3]).toBeDefined();
    expect(loaded[3].length).toBe(1);
    expect(loaded[3][0].text).toBe('Conceito importante sobre arquitetura');
    expect(loaded[3][0].note).toBe('Rever para a prova');
    expect(loaded[3][0] instanceof Highlight).toBe(true);
  });

  it('deve salvar e carregar anotações manuais v2', () => {
    Storage.saveManualNotes(sampleFileKey, {
      1: 'Resumo da introdução',
      2: 'Pontos chave do autor',
    });

    const notes = Storage.loadManualNotes(sampleFileKey);
    expect(notes[1]).toBe('Resumo da introdução');
    expect(notes[2]).toBe('Pontos chave do autor');
  });

  it('deve migrar automaticamente dados legados v1 para o formato estruturado v2 sem perda', () => {
    // Simula dados legados salvos na v1
    const legacyKey = 'dr2_antigo.pdf_999';
    const legacyHighlights = {
      2: [
        { id: 'leg_1', x: 0.1, y: 0.2, width: 0.6, height: 0.04 },
      ],
    };
    const legacyAnotacoes = {
      2: '> "Citação extraída legada"\n\nMinha anotação pessoal sobre a página 2.',
    };

    localStorage.setItem(`${legacyKey}_highlights`, JSON.stringify(legacyHighlights));
    localStorage.setItem(`${legacyKey}_anotacoes`, JSON.stringify(legacyAnotacoes));

    // Carrega com a nova versão
    const highlights = Storage.loadHighlights(legacyKey);
    const notes = Storage.loadManualNotes(legacyKey);

    // Valida grifo migrado
    expect(highlights[2]).toBeDefined();
    expect(highlights[2].length).toBe(1);
    expect(highlights[2][0].text).toBe('Citação extraída legada');
    expect(highlights[2][0].rects[0].x).toBe(0.1);

    // Valida nota manual separada
    expect(notes[2]).toBe('Minha anotação pessoal sobre a página 2.');

    // Garante que a migração é não-destrutiva (chaves antigas ainda existem)
    expect(localStorage.getItem(`${legacyKey}_highlights`)).not.toBeNull();
    expect(localStorage.getItem(`${legacyKey}_anotacoes`)).not.toBeNull();
  });

  it('deve migrar página que contém apenas retângulos de grifo sem anotações', () => {
    const key = 'dr2_apenas_grifos.pdf_111';
    const legacyHighlights = {
      4: [{ id: 'hl_orphan', x: 0.2, y: 0.3, width: 0.4, height: 0.05 }],
    };
    localStorage.setItem(`${key}_highlights`, JSON.stringify(legacyHighlights));

    const highlights = Storage.loadHighlights(key);
    expect(highlights[4]).toBeDefined();
    expect(highlights[4].length).toBe(1);
    expect(highlights[4][0].rects[0].x).toBe(0.2);
  });

  it('deve exportar e restaurar backups no formato v2 envelopado', () => {
    Storage.saveTheme('theme-dark');
    Storage.savePage(sampleFileKey, 8);
    Storage.saveManualNotes(sampleFileKey, { 8: 'Nota importante' });

    const backup = Storage.getAllDataForBackup();
    expect(backup.version).toBe('2.0');
    expect(backup.format).toBe('divereader_backup');
    expect(Object.keys(backup.data).length).toBeGreaterThanOrEqual(3);

    // Limpa storage e restaura
    localStorage.clear();
    const result = Storage.restoreBackup(backup);
    expect(result.count).toBeGreaterThanOrEqual(3);
    expect(Storage.loadTheme()).toBe('theme-dark');
    expect(Storage.loadPage(sampleFileKey)).toBe(8);
  });

  it('deve restaurar e migrar backup v1 antigo diretamente', () => {
    const legacyBackup = {
      'dr2_apostila.pdf_888_page': '15',
      'dr2_apostila.pdf_888_highlights': JSON.stringify({
        2: [{ id: 'leg_hl', x: 0.1, y: 0.2, width: 0.5, height: 0.03 }],
      }),
      'dr2_apostila.pdf_888_anotacoes': JSON.stringify({
        2: '> "Citação v1"\n\nMinha anotação v1',
      }),
    };

    localStorage.clear();
    const result = Storage.restoreBackup(legacyBackup);
    expect(result.count).toBe(3);
    expect(result.documentsCount).toBe(1);

    // Valida se migrou automaticamente para v2
    const highlights = Storage.loadHighlights('dr2_apostila.pdf_888');
    const notes = Storage.loadManualNotes('dr2_apostila.pdf_888');

    expect(highlights[2].length).toBe(1);
    expect(highlights[2][0].text).toBe('Citação v1');
    expect(notes[2]).toBe('Minha anotação v1');
  });

  it('deve importar JSON 1 (legado) e JSON 2 (v2) produzindo dados equivalentes e completos', () => {
    const fileKey = 'dr2_Cristianismo e Liberalismo - MACHEN.pdf_13285814';
    
    // JSON 1 (Legado v1)
    const json1 = {
      [`${fileKey}_page`]: '73',
      [`${fileKey}_highlights`]: JSON.stringify({
        28: [{ id: '1787325595259', x: 0.14, y: 0.16, width: 0.76, height: 0.026 }],
      }),
      [`${fileKey}_anotacoes`]: JSON.stringify({
        27: '> *(pág. 28)* "Logo no início encontramos uma objeção. Ouvimos dizer que os ensinamentos não são importantes..."\n\nMinha síntese pessoal',
      }),
      'dr2_theme': 'theme-sepia',
    };

    localStorage.clear();
    Storage.restoreBackup(json1);

    const highlightsFromV1 = Storage.loadHighlights(fileKey);
    const notesFromV1 = Storage.loadManualNotes(fileKey);
    const pageFromV1 = Storage.loadPage(fileKey);

    expect(pageFromV1).toBe(73);
    expect(highlightsFromV1[28]).toBeDefined();
    expect(highlightsFromV1[28][0].text).toContain('Logo no início encontramos uma objeção');
    expect(highlightsFromV1[28][0].rects.length).toBe(1);
    expect(notesFromV1[27]).toBe('Minha síntese pessoal');

    // JSON 2 (v2 envelopado)
    const json2 = {
      version: '2.0',
      format: 'divereader_backup',
      data: {
        [`${fileKey}_page`]: '73',
        [`${fileKey}_highlights_v2`]: JSON.stringify(highlightsFromV1),
        [`${fileKey}_notes_v2`]: JSON.stringify(notesFromV1),
        'dr2_theme': 'theme-sepia',
      },
    };

    localStorage.clear();
    Storage.restoreBackup(json2);

    const highlightsFromV2 = Storage.loadHighlights(fileKey);
    const notesFromV2 = Storage.loadManualNotes(fileKey);
    const pageFromV2 = Storage.loadPage(fileKey);

    expect(pageFromV2).toBe(pageFromV1);
    expect(highlightsFromV2[28][0].text).toBe(highlightsFromV1[28][0].text);
    expect(notesFromV2[27]).toBe(notesFromV1[27]);
  });
});
