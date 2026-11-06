import { describe, it, expect } from 'vitest';
import { buildPageText, splitSentences, scoreVoice, sentenceRects } from '../../src/js/services/ttsService.js';

// Item no formato do PDF.js: transform = [scaleX, skewY, skewX, scaleY, x, y]
const item = (str, x, y, { size = 12, width = null, hasEOL = false } = {}) => ({
  str,
  transform: [size, 0, 0, size, x, y],
  width: width ?? str.length * size * 0.5,
  height: size,
  hasEOL,
});

describe('Leitura em voz alta: reconstrução do texto da página', () => {
  it('junta linhas em texto corrido com espaço entre elas', () => {
    const { text } = buildPageText([
      item('A leitura atenta exige', 50, 700),
      item('tempo e dedicação.', 50, 685),
    ]);
    expect(text).toBe('A leitura atenta exige tempo e dedicação.');
  });

  it('desfaz a hifenização de fim de linha', () => {
    const { text } = buildPageText([
      item('O desenvolvi-', 50, 700),
      item('mento sustentável é central.', 50, 685),
    ]);
    expect(text).toBe('O desenvolvimento sustentável é central.');
  });

  it('mantém o hífen e cola a palavra composta quando a próxima linha começa com maiúscula', () => {
    const { text } = buildPageText([
      item('Ver Rio-', 50, 700),
      item('Grande do Sul.', 50, 685),
    ]);
    expect(text).toBe('Ver Rio-Grande do Sul.');
  });

  it('não insere espaço entre pedaços colados da mesma palavra na mesma linha', () => {
    const { text } = buildPageText([
      item('desen', 50, 700, { width: 30 }),
      item('volvimento', 80, 700, { width: 60 }),
    ]);
    expect(text).toBe('desenvolvimento');
  });

  it('descarta cabeçalho, rodapé e número de página', () => {
    const { text } = buildPageText(
      [
        item('Revista de Estudos — Vol. 3', 50, 780),
        item('Corpo do texto principal da página.', 50, 600),
        item('42', 300, 20),
      ],
      { pageHeight: 800, skipHeaderFooter: true },
    );
    expect(text).toBe('Corpo do texto principal da página.');
  });

  it('registra o intervalo de cada item no texto final', () => {
    const { text, spans } = buildPageText([item('Olá', 50, 700), item('mundo.', 50, 685)]);
    spans.forEach((s) => expect(text.slice(s.start, s.end)).toBe(s.item.str.trim()));
  });
});

describe('Leitura em voz alta: divisão em frases', () => {
  it('divide em frases e preserva os limites no texto original', () => {
    const text = 'A primeira frase é bem clara para o leitor. A segunda frase também é razoavelmente longa!';
    const sentences = splitSentences(text);
    expect(sentences).toHaveLength(2);
    sentences.forEach((s) => expect(text.slice(s.start, s.end)).toBe(s.text));
  });

  it('junta fragmentos curtos (ex.: abreviações) à frase seguinte', () => {
    const sentences = splitSentences('Art. 5º Todos são iguais perante a lei, sem distinção de qualquer natureza.');
    expect(sentences).toHaveLength(1);
  });

  it('quebra frases muito longas em pontuação interna', () => {
    const longText = `${'Este trecho tem várias orações, '.repeat(12)}e termina aqui.`;
    const sentences = splitSentences(longText);
    expect(sentences.length).toBeGreaterThan(1);
    sentences.forEach((s) => expect(s.text.length).toBeLessThanOrEqual(220));
  });

  it('ignora segmentos sem letras ou números', () => {
    expect(splitSentences('   ...   ')).toEqual([]);
  });
});

describe('Leitura em voz alta: escolha de voz', () => {
  const v = (name, lang, localService = true) => ({ name, lang, localService });

  it('prefere vozes naturais/neurais em pt-BR', () => {
    const voices = [
      v('Microsoft Maria - Portuguese (Brazil)', 'pt-BR'),
      v('Microsoft Francisca Online (Natural) - Portuguese (Brazil)', 'pt-BR', false),
      v('Google português do Brasil', 'pt-BR', false),
      v('Microsoft Zira - English (United States)', 'en-US'),
    ];
    const best = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
    expect(best.name).toContain('Francisca');
  });

  it('aceita pt-PT quando não há pt-BR e rejeita outros idiomas', () => {
    expect(scoreVoice(v('Joana', 'pt-PT'))).toBeGreaterThan(0);
    expect(scoreVoice(v('Zira', 'en-US'))).toBeLessThan(0);
  });
});

describe('Leitura em voz alta: retângulos de destaque', () => {
  it('gera um retângulo por linha coberta pela frase', () => {
    const items = [item('Primeira linha da frase', 50, 700, { width: 200 }), item('segunda linha.', 50, 685, { width: 100 })];
    const { text, spans } = buildPageText(items);
    const viewport = {
      width: 600,
      height: 800,
      convertToViewportRectangle: ([x1, y1, x2, y2]) => [x1, 800 - y1, x2, 800 - y2],
    };
    const [sentence] = splitSentences(text);
    const rects = sentenceRects({ spans, viewport }, sentence);
    expect(rects).toHaveLength(2);
    rects.forEach((r) => {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThan(0);
      expect(r.width).toBeGreaterThan(0);
    });
  });
});
