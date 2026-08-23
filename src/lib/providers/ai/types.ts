/**
 * AIProvider — personalizzazione dati e messaggi (§9, §11.1).
 *
 * L'AI personalizza i DATI, non riscrive layout/CSS (§9). Lo score resta
 * deterministico (§5.1): l'AI non produce mai un numero opaco senza evidenze.
 */

export interface GenerateMessageInput {
  businessName: string;
  category: string | null;
  city: string | null;
  /** punti chiave dell'audit da citare (issues/opportunities sintetiche). */
  highlights: string[];
  demoUrl: string | null;
  senderName: string;
  /** tono richiesto (es. "professionale", "amichevole") */
  tone?: string;
}

export interface GeneratedMessage {
  subject: string;
  body: string;
  /** modello/adapter usato — auditability §1 */
  generatedBy: string;
}

export interface RegenerateFieldInput {
  /** nome del campo da rigenerare (§9.2 "Regenerate selected field with AI") */
  field: string;
  currentValue: string;
  context: Record<string, string>;
  instruction?: string;
}

export interface RegenerateFieldResult {
  field: string;
  value: string;
  generatedBy: string;
}

export interface AIProvider {
  generateMessage(input: GenerateMessageInput): Promise<GeneratedMessage>;
  regenerateField(input: RegenerateFieldInput): Promise<RegenerateFieldResult>;
}
