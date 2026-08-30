/**
 * Setup do ambiente de testes Vitest / JSDOM
 */

// Mock de localStorage caso não esteja presente
if (typeof window !== 'undefined' && !window.localStorage) {
  let store = {};
  window.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i) => Object.keys(store)[i] || null,
  };
}

// Mock do Lucide Icons
if (typeof window !== 'undefined') {
  window.lucide = {
    createIcons: () => {},
  };
}

// Mock básico de PDF.js
if (typeof window !== 'undefined') {
  window.pdfjsLib = {
    GlobalWorkerOptions: { workerSrc: '' },
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 10,
        getPage: (num) =>
          Promise.resolve({
            getViewport: () => ({ width: 600, height: 800, scale: 1 }),
            render: () => ({ promise: Promise.resolve() }),
            getTextContent: () =>
              Promise.resolve({
                items: [
                  { str: 'Texto de teste', hasEOL: true, transform: [1, 0, 0, 1, 10, 20], width: 100, fontName: 'sans-serif' },
                ],
              }),
          }),
      }),
    }),
    Util: {
      transform: (viewportTransform, itemTransform) => [1, 0, 0, 1, 10, 20],
    },
  };
}
