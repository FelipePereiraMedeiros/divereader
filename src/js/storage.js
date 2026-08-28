/**
 * Módulo de Armazenamento Local (LocalStorage) e Migrador Retrocompatível
 */

import { STORAGE_PREFIX } from './constants.js';
import { Highlight } from './models/Highlight.js';

export const Storage = {
  /**
   * Gera a chave única para o documento PDF
   * @param {string} fileName
   * @param {number} fileSize
   * @returns {string}
   */
  generateFileKey(fileName, fileSize) {
    return `${STORAGE_PREFIX}${fileName}_${fileSize}`;
  },

  /**
   * Salva a última página lida
   * @param {string} fileKey
   * @param {number} pageNum
   */
  savePage(fileKey, pageNum) {
    if (!fileKey) return;
    try {
      localStorage.setItem(`${fileKey}_page`, String(pageNum));
    } catch (e) {
      console.error('Erro ao salvar página no localStorage:', e);
    }
  },

  /**
   * Carrega a última página lida
   * @param {string} fileKey
   * @returns {number}
   */
  loadPage(fileKey) {
    if (!fileKey) return 1;
    try {
      const saved = localStorage.getItem(`${fileKey}_page`);
      return saved ? parseInt(saved, 10) : 1;
    } catch (e) {
      return 1;
    }
  },

  /**
   * Salva os grifos estruturados
   * @param {string} fileKey
   * @param {Object.<number, Highlight[]>} highlightsMap
   */
  saveHighlights(fileKey, highlightsMap) {
    if (!fileKey) return;
    try {
      const serialized = {};
      for (const [pageNum, list] of Object.entries(highlightsMap)) {
        if (Array.isArray(list) && list.length > 0) {
          serialized[pageNum] = list.map((h) => (h instanceof Highlight ? h.toJSON() : h));
        }
      }
      localStorage.setItem(`${fileKey}_highlights_v2`, JSON.stringify(serialized));
    } catch (e) {
      console.error('Erro ao salvar grifos no localStorage:', e);
    }
  },

  /**
   * Carrega os grifos estruturados (com suporte a migração de v1)
   * @param {string} fileKey
   * @returns {Object.<number, Highlight[]>}
   */
  loadHighlights(fileKey) {
    if (!fileKey) return {};
    try {
      // 1. Tenta carregar v2 estruturado
      const v2Data = localStorage.getItem(`${fileKey}_highlights_v2`);
      if (v2Data) {
        const parsed = JSON.parse(v2Data);
        const result = {};
        for (const [p, list] of Object.entries(parsed)) {
          result[Number(p)] = list.map((h) => Highlight.fromJSON(h));
        }
        return result;
      }

      // 2. Se não houver v2, executa migração dos dados legados v1
      return this.migrateLegacyData(fileKey).highlights;
    } catch (e) {
      console.error('Erro ao carregar grifos:', e);
      return {};
    }
  },

  /**
   * Salva as anotações manuais / síntese
   * @param {string} fileKey
   * @param {Object.<number, string>} notesMap
   */
  saveManualNotes(fileKey, notesMap) {
    if (!fileKey) return;
    try {
      localStorage.setItem(`${fileKey}_notes_v2`, JSON.stringify(notesMap));
    } catch (e) {
      console.error('Erro ao salvar anotações manuais:', e);
    }
  },

  /**
   * Carrega as anotações manuais / síntese
   * @param {string} fileKey
   * @returns {Object.<number, string>}
   */
  loadManualNotes(fileKey) {
    if (!fileKey) return {};
    try {
      // 1. Tenta carregar v2
      const v2Data = localStorage.getItem(`${fileKey}_notes_v2`);
      if (v2Data) {
        return JSON.parse(v2Data);
      }

      // 2. Se não houver v2, executa migração dos dados legados v1
      return this.migrateLegacyData(fileKey).notes;
    } catch (e) {
      console.error('Erro ao carregar anotações manuais:', e);
      return {};
    }
  },

  /**
   * Executa a migração transparente de dados legados (v1 -> v2) para um arquivo
   * Suporta formatos com prefixo `> *(pág. X)* "..."` e citações multilinhas
   * @param {string} fileKey
   * @returns {{ highlights: Object, notes: Object }}
   */
  migrateLegacyData(fileKey) {
    const migratedHighlights = {};
    const migratedNotes = {};

    try {
      const legacyHighlightsRaw = localStorage.getItem(`${fileKey}_highlights`);
      const legacyNotesRaw = localStorage.getItem(`${fileKey}_anotacoes`);
      const existingV2HighlightsRaw = localStorage.getItem(`${fileKey}_highlights_v2`);
      const existingV2NotesRaw = localStorage.getItem(`${fileKey}_notes_v2`);

      const legacyHighlights = legacyHighlightsRaw ? JSON.parse(legacyHighlightsRaw) : {};
      const legacyNotes = legacyNotesRaw ? JSON.parse(legacyNotesRaw) : {};
      const existingV2Highlights = existingV2HighlightsRaw ? JSON.parse(existingV2HighlightsRaw) : {};
      const existingV2Notes = existingV2NotesRaw ? JSON.parse(existingV2NotesRaw) : {};

      // 1. Extração Global de Citações e Notas Limpas
      // Mapeia citações para as suas páginas de destino (mesmo quando salvas na página esquerda com > *(pág. X)*)
      const quotesByTargetPage = {};

      for (const [pageKey, noteContent] of Object.entries(legacyNotes)) {
        if (!noteContent || typeof noteContent !== 'string') continue;

        const originalPageNum = parseInt(pageKey, 10);
        const remainingNoteLines = [];

        // Divide em blocos separados por quebras de linha duplas ou blocos '>'
        const rawBlocks = noteContent.split(/\n\s*\n/);

        rawBlocks.forEach((block) => {
          const trimmed = block.trim();
          if (!trimmed) return;

          // Detecta se o bloco é uma citação do tipo: > *(pág. 28)* "..." ou > "..."
          const quoteRegex = />\s*(?:\*\([Pp][áa]g\.?\s*(\d+)\)\*\s*)?["“]([\s\S]*?)["”]$/;
          const match = trimmed.match(quoteRegex);

          if (match) {
            const specifiedPage = match[1] ? parseInt(match[1], 10) : originalPageNum;
            const quoteText = match[2].trim();

            if (!quotesByTargetPage[specifiedPage]) {
              quotesByTargetPage[specifiedPage] = [];
            }
            quotesByTargetPage[specifiedPage].push(quoteText);
          } else if (trimmed.startsWith('>')) {
            // Citação flexível
            const simpleMatch = trimmed.match(/>\s*(?:\*\([Pp][áa]g\.?\s*(\d+)\)\*\s*)?([\s\S]*)/);
            if (simpleMatch) {
              const specifiedPage = simpleMatch[1] ? parseInt(simpleMatch[1], 10) : originalPageNum;
              let quoteText = simpleMatch[2].trim();
              if (
                (quoteText.startsWith('"') && quoteText.endsWith('"')) ||
                (quoteText.startsWith('“') && quoteText.endsWith('”'))
              ) {
                quoteText = quoteText.slice(1, -1).trim();
              }
              if (quoteText) {
                if (!quotesByTargetPage[specifiedPage]) quotesByTargetPage[specifiedPage] = [];
                quotesByTargetPage[specifiedPage].push(quoteText);
              }
            } else {
              remainingNoteLines.push(trimmed);
            }
          } else {
            // Nota pura / síntese manual do usuário
            remainingNoteLines.push(trimmed);
          }
        });

        const cleanNotes = remainingNoteLines.join('\n\n').trim();
        if (cleanNotes) {
          migratedNotes[originalPageNum] = cleanNotes;
        }
      }

      // Se já havia notes_v2 salvas sem citações, mescla mantendo a prioridade
      for (const [pNum, noteText] of Object.entries(existingV2Notes)) {
        if (noteText && typeof noteText === 'string') {
          if (!noteText.trim().startsWith('>')) {
            migratedNotes[pNum] = noteText;
          }
        }
      }

      // 2. Mapeia e Associa Grifos com as Coordenadas
      const allPages = new Set([
        ...Object.keys(legacyHighlights).map(Number),
        ...Object.keys(quotesByTargetPage).map(Number),
        ...Object.keys(existingV2Highlights).map(Number),
      ]);

      for (const pageNum of allPages) {
        if (isNaN(pageNum) || pageNum < 1) continue;

        const quotesForPage = quotesByTargetPage[pageNum] ? [...quotesByTargetPage[pageNum]] : [];
        const pageHighlightsList = [];

        // Se já existirem highlights na v2 para esta página
        const v2List = existingV2Highlights[pageNum] || [];
        if (Array.isArray(v2List) && v2List.length > 0) {
          v2List.forEach((h) => {
            let text = h.text || '';
            // Se o texto do grifo estava vazio, preenche com a citação correspondente da página
            if (!text.trim() && quotesForPage.length > 0) {
              text = quotesForPage.shift();
            }
            pageHighlightsList.push(
              new Highlight({
                id: h.id,
                pageNum,
                text,
                rects: h.rects || [],
                color: h.color || 'yellow',
                note: h.note || '',
                createdAt: h.createdAt || new Date().toISOString(),
              }),
            );
          });
        } else {
          // Processa os retângulos legados da v1
          const pageRects = legacyHighlights[pageNum] || [];
          const groupedById = {};

          pageRects.forEach((r, idx) => {
            const id = r.id || `legacy_${pageNum}_${idx}`;
            if (!groupedById[id]) groupedById[id] = [];
            groupedById[id].push({
              x: Number(r.x) || 0,
              y: Number(r.y) || 0,
              width: Number(r.width) || 0,
              height: Number(r.height) || 0,
            });
          });

          const groupIds = Object.keys(groupedById);

          // Associa citações aos grupos de retângulos
          groupIds.forEach((id) => {
            const matchedQuote = quotesForPage.length > 0 ? quotesForPage.shift() : '';
            pageHighlightsList.push(
              new Highlight({
                id,
                pageNum,
                text: matchedQuote,
                rects: groupedById[id],
              }),
            );
          });
        }

        // Se sobraram citações sem retângulos nesta página
        while (quotesForPage.length > 0) {
          const remainingQuote = quotesForPage.shift();
          const alreadyExists = pageHighlightsList.some(
            (h) => h.text.trim() === remainingQuote.trim(),
          );
          if (!alreadyExists && remainingQuote.trim()) {
            pageHighlightsList.push(
              new Highlight({
                id: `quote_legacy_${pageNum}_${Math.random().toString(36).substring(2, 6)}`,
                pageNum,
                text: remainingQuote,
                rects: [],
              }),
            );
          }
        }

        if (pageHighlightsList.length > 0) {
          migratedHighlights[pageNum] = pageHighlightsList;
        }
      }

      // Salva os dados migrados na v2 de forma consolidada e segura
      if (Object.keys(migratedHighlights).length > 0 || Object.keys(migratedNotes).length > 0) {
        this.saveHighlights(fileKey, migratedHighlights);
        this.saveManualNotes(fileKey, migratedNotes);
      }
    } catch (e) {
      console.warn('Aviso: Falha na migração automática de dados legados:', e);
    }

    return {
      highlights: migratedHighlights,
      notes: migratedNotes,
    };
  },

  /**
   * Salva preferência de tema
   * @param {string} theme
   */
  saveTheme(theme) {
    try {
      localStorage.setItem('dr2_theme', theme);
    } catch (e) {
      console.error(e);
    }
  },

  /**
   * Carrega preferência de tema
   * @returns {string}
   */
  loadTheme() {
    try {
      return localStorage.getItem('dr2_theme') || 'theme-light';
    } catch (e) {
      return 'theme-light';
    }
  },

  /**
   * Coleta todos os dados de estudo formatados para exportação
   * @returns {{ version: string, format: string, exportedAt: string, totalDocuments: number, data: Object.<string, string> }}
   */
  getAllDataForBackup() {
    const dataMap = {};
    const discoveredFileKeys = new Set();

    // 1. Coleta todas as chaves do DiveReader
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX) && key !== 'dr2_theme') {
        const val = localStorage.getItem(key);
        dataMap[key] = val;

        // Extrai a raiz do fileKey
        const baseKey = key
          .replace(/_highlights_v2$/, '')
          .replace(/_notes_v2$/, '')
          .replace(/_highlights$/, '')
          .replace(/_anotacoes$/, '')
          .replace(/_page$/, '');
        if (baseKey.startsWith(STORAGE_PREFIX)) {
          discoveredFileKeys.add(baseKey);
        }
      } else if (key === 'dr2_theme') {
        dataMap[key] = localStorage.getItem(key);
      }
    }

    // 2. Garante que todos os documentos encontrados estejam sincronizados no padrão v2
    discoveredFileKeys.forEach((fileKey) => {
      this.migrateLegacyData(fileKey);
      const v2Hl = localStorage.getItem(`${fileKey}_highlights_v2`);
      const v2Notes = localStorage.getItem(`${fileKey}_notes_v2`);
      if (v2Hl) dataMap[`${fileKey}_highlights_v2`] = v2Hl;
      if (v2Notes) dataMap[`${fileKey}_notes_v2`] = v2Notes;
    });

    return {
      version: '2.0',
      format: 'divereader_backup',
      exportedAt: new Date().toISOString(),
      totalDocuments: discoveredFileKeys.size,
      data: dataMap,
    };
  },

  /**
   * Restaura e converte dados de backup de qualquer versão (v1 plana ou v2 envelopada)
   * @param {Object} backupPayload
   * @returns {{ count: number, documentsCount: number, fileKeys: string[] }}
   */
  restoreBackup(backupPayload) {
    let count = 0;
    const discoveredFileKeys = new Set();

    if (!backupPayload || typeof backupPayload !== 'object') {
      return { count: 0, documentsCount: 0, fileKeys: [] };
    }

    // Identifica se o backup está no formato envelopado ({ data: { ... } }) ou plano ({ "dr2_...": "..." })
    const sourceData =
      backupPayload.data && typeof backupPayload.data === 'object'
        ? backupPayload.data
        : backupPayload;

    // 1. Injeta todas as chaves no localStorage com tratamento de tipos
    for (const [key, val] of Object.entries(sourceData)) {
      if (key && key.startsWith(STORAGE_PREFIX)) {
        let stringValue = '';
        if (typeof val === 'string') {
          stringValue = val;
        } else if (typeof val === 'object' && val !== null) {
          stringValue = JSON.stringify(val);
        } else {
          stringValue = String(val);
        }

        localStorage.setItem(key, stringValue);
        count++;

        // Descobre as chaves dos documentos importados
        if (key !== 'dr2_theme') {
          const baseKey = key
            .replace(/_highlights_v2$/, '')
            .replace(/_notes_v2$/, '')
            .replace(/_highlights$/, '')
            .replace(/_anotacoes$/, '')
            .replace(/_page$/, '');
          if (baseKey.startsWith(STORAGE_PREFIX)) {
            discoveredFileKeys.add(baseKey);
          }
        }
      }
    }

    // 2. Executa a migração automática para cada documento importado para garantir a v2
    const fileKeysList = Array.from(discoveredFileKeys);
    fileKeysList.forEach((fileKey) => {
      this.migrateLegacyData(fileKey);
    });

    return {
      count,
      documentsCount: fileKeysList.length,
      fileKeys: fileKeysList,
    };
  },
};
