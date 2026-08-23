/**
 * Mock AIProvider — deterministico, nessuna chiamata di rete.
 * Generazione template-based: output riproducibile per test e demo.
 */

import type {
  AIProvider,
  GeneratedMessage,
  GenerateMessageInput,
  RegenerateFieldInput,
  RegenerateFieldResult,
} from './types';

export class AIProviderMock implements AIProvider {
  readonly generatedBy = 'ai-mock';

  async generateMessage(input: GenerateMessageInput): Promise<GeneratedMessage> {
    const where = input.city ? ` a ${input.city}` : '';
    const highlight =
      input.highlights.length > 0
        ? `Ho notato che ${input.highlights[0]} — è un'occasione concreta per migliorare la presenza online.`
        : 'Ho notato alcuni margini di miglioramento nella presenza online.';
    const demoLine = input.demoUrl ? `Ho preparato una demo: ${input.demoUrl}` : '';

    const subject = `Una proposta per ${input.businessName}`;
    const body = [
      `Gentile ${input.businessName}${where},`,
      '',
      highlight,
      demoLine,
      '',
      `${input.senderName}`,
    ]
      .filter(Boolean)
      .join('\n');

    return { subject, body, generatedBy: this.generatedBy };
  }

  async regenerateField(input: RegenerateFieldInput): Promise<RegenerateFieldResult> {
    const suffix = input.instruction ? ` (${input.instruction})` : '';
    return {
      field: input.field,
      value: `${input.currentValue} — rigenerato${suffix}`.trim(),
      generatedBy: this.generatedBy,
    };
  }
}
