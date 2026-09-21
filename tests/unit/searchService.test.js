import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchService } from '../../src/js/services/searchService.js';
import { appState } from '../../src/js/state.js';

describe('SearchService (Full-Text In-Document Search)', () => {
  beforeEach(() => {
    SearchService.clearCache();

    // Mock do pdfDoc com 3 páginas de conteúdo acadêmico
    const mockPages = {
      1: {
        getTextContent: () =>
          Promise.resolve({
            items: [
              { str: 'Introdução', hasEOL: true },
              { str: 'O método científico', hasEOL: false },
              { str: 'e a epistemologia moderna.', hasEOL: true },
            ],
          }),
      },
      2: {
        getTextContent: () =>
          Promise.resolve({
            items: [
              { str: 'Capítulo 1:', hasEOL: false },
              { str: 'Análise de dados e método quantitativo.', hasEOL: true },
            ],
          }),
      },
      3: {
        getTextContent: () =>
          Promise.resolve({
            items: [
              { str: 'Conclusão e bibliografia geral.', hasEOL: true },
            ],
          }),
      },
    };

    appState.set({
      totalPages: 3,
      pageNum: 1,
      pdfDoc: {
        numPages: 3,
        getPage: vi.fn().mockImplementation((num) => Promise.resolve(mockPages[num])),
      },
    });
  });

  it('deve extrair e concatenar o texto da página corretamente com espaços lógicos', async () => {
    const { fullText } = await SearchService.getPageText(1);
    expect(fullText).toContain('Introdução\n');
    expect(fullText).toContain('O método científico e a epistemologia moderna.');
  });

  it('deve localizar ocorrências com correspondência insensível a maiúsculas/minúsculas', async () => {
    const results = await SearchService.search('método');
    expect(results.length).toBe(2);
    expect(results[0].pageNum).toBe(1);
    expect(results[1].pageNum).toBe(2);
    expect(results[0].snippet).toContain('método');
  });

  it('deve respeitar a opção matchCase quando solicitada', async () => {
    const sensitiveResults = await SearchService.search('MÉTODO', { matchCase: true });
    expect(sensitiveResults.length).toBe(0);

    const matchLower = await SearchService.search('método', { matchCase: true });
    expect(matchLower.length).toBe(2);
  });

  it('deve permitir navegação circular (nextMatch / prevMatch)', async () => {
    await SearchService.search('método');
    expect(SearchService.getTotalMatches()).toBe(2);

    const first = SearchService.getCurrentMatch();
    expect(first.match.pageNum).toBe(1);

    const next = SearchService.nextMatch();
    expect(next.pageNum).toBe(2);

    // Próximo deve voltar circularmente para o primeiro
    const wrapped = SearchService.nextMatch();
    expect(wrapped.pageNum).toBe(1);

    // Anterior deve voltar para o último
    const prev = SearchService.prevMatch();
    expect(prev.pageNum).toBe(2);
  });

  it('deve limpar ocorrências e notificar listeners ao pesquisar termo vazio', async () => {
    await SearchService.search('método');
    expect(SearchService.getTotalMatches()).toBe(2);

    await SearchService.search('');
    expect(SearchService.getTotalMatches()).toBe(0);
    expect(SearchService.getCurrentMatch()).toBeNull();
  });
});
