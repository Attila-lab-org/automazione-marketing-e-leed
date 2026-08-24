import { describe, expect, it } from 'vitest';
import { emailHtmlToText } from '../../src/lib/messaging/html-to-text';

describe('emailHtmlToText', () => {
  it('mantiene URL e testo dei pulsanti', () => {
    const text = emailHtmlToText(
      '<p>Buongiorno &amp; benvenuto</p><a href="https://example.com/demo">Vedi la proposta</a>',
    );

    expect(text).toContain('Buongiorno & benvenuto');
    expect(text).toContain('Vedi la proposta: https://example.com/demo');
  });

  it('usa il testo alternativo delle immagini collegate', () => {
    const text = emailHtmlToText(
      '<a href="https://example.com/demo"><img src="x" alt="Anteprima Locale" /></a>',
    );

    expect(text).toBe('Anteprima Locale: https://example.com/demo');
  });
});
