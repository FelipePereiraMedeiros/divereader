/**
 * Módulo de Persistência em IndexedDB para Cache de Documentos PDF
 * Permite reabertura instantânea da sessão e contorna o limite de 5MB do localStorage
 */

const DB_NAME = 'divereader_db';
const DB_VERSION = 1;
const PDF_STORE = 'pdf_cache';

let dbInstance = null;

/**
 * Abre ou inicializa o banco de dados IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
export async function getDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB não suportado neste ambiente.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) {
        const store = db.createObjectStore(PDF_STORE, { keyPath: 'key' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.warn('Erro ao abrir IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Salva o ArrayBuffer do arquivo PDF no cache persistente do IndexedDB
 * @param {string} key Identificador único do documento (dr2_sha_... ou dr2_nome_tam)
 * @param {string} fileName Nome original do arquivo
 * @param {number} fileSize Tamanho em bytes
 * @param {ArrayBuffer} arrayBuffer Dados brutos do PDF
 * @returns {Promise<boolean>}
 */
export async function cachePdfDocument(key, fileName, fileSize, arrayBuffer) {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(PDF_STORE, 'readwrite');
      const store = tx.objectStore(PDF_STORE);

      const record = {
        key,
        fileName,
        fileSize,
        arrayBuffer,
        updatedAt: Date.now(),
      };

      const req = store.put(record);
      req.onsuccess = () => {
        // Mantém no máximo 3 documentos recentes (LRU)
        pruneOldPdfCache(db, 3).catch(() => {});
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('Falha ao salvar PDF no IndexedDB:', err);
    return false;
  }
}

/**
 * Remove documentos antigos excedentes para evitar consumo excessivo de memória/cota
 * @param {IDBDatabase} db
 * @param {number} maxItems
 */
async function pruneOldPdfCache(db, maxItems = 3) {
  try {
    const tx = db.transaction(PDF_STORE, 'readwrite');
    const store = tx.objectStore(PDF_STORE);
    if (!store.indexNames.contains('updatedAt')) return;

    const countReq = store.count();
    countReq.onsuccess = () => {
      let count = countReq.result;
      if (count > maxItems) {
        const index = store.index('updatedAt');
        const cursorReq = index.openCursor(null, 'next'); // Mais antigos primeiro
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && count > maxItems) {
            cursor.delete();
            count--;
            cursor.continue();
          }
        };
      }
    };
  } catch (e) {}
}

/**
 * Obtém o último documento PDF armazenado no cache local via cursor (sem carregar todos em memória)
 * @returns {Promise<{ key: string, fileName: string, fileSize: number, arrayBuffer: ArrayBuffer, updatedAt: number }|null>}
 */
export async function getLastCachedPdf() {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(PDF_STORE, 'readonly');
      const store = tx.objectStore(PDF_STORE);

      if (store.indexNames.contains('updatedAt')) {
        const index = store.index('updatedAt');
        const req = index.openCursor(null, 'prev'); // Documento mais recente primeiro
        req.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            resolve(cursor.value);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          if (list.length === 0) return resolve(null);
          list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          resolve(list[0]);
        };
        req.onerror = () => resolve(null);
      }
    });
  } catch (err) {
    return null;
  }
}

/**
 * Obtém um PDF do cache pelo identificador único (chave)
 * @param {string} key
 * @returns {Promise<{ key: string, fileName: string, fileSize: number, arrayBuffer: ArrayBuffer }|null>}
 */
export async function getCachedPdfByKey(key) {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(PDF_STORE, 'readonly');
      const store = tx.objectStore(PDF_STORE);
      const req = store.get(key);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Limpa todo o cache de PDFs locais
 * @returns {Promise<boolean>}
 */
export async function clearPdfCache() {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(PDF_STORE, 'readwrite');
      const store = tx.objectStore(PDF_STORE);
      const req = store.clear();

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    return false;
  }
}
