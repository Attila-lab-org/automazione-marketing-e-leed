export class StructuredOutputError extends Error {
  readonly rawPreview: string | null;

  constructor(message: string, rawPreview: string | null = null) {
    super(message);
    this.name = 'StructuredOutputError';
    this.rawPreview = rawPreview;
  }
}

export class AiTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Timeout AI dopo ${timeoutMs}ms`);
    this.name = 'AiTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class AiPhaseNotImplementedError extends Error {
  readonly method: string;
  readonly phase: string;

  constructor(method: string, phase: string) {
    super(`${method} non è disponibile in AI-0 (previsto in ${phase})`);
    this.name = 'AiPhaseNotImplementedError';
    this.method = method;
    this.phase = phase;
  }
}
