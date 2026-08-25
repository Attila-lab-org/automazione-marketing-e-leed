import type { OperatorAssistMode } from './capabilities';
import type { OperatorEntityRefs } from './context';
import type { OperatorEnvelope } from './envelope';
import type { OperatorHistoryItem, OperatorPlan } from './orchestrator-schema';
import type { OperatorToolName } from './registry';

export type OperatorAnswerInput = {
  question: string;
  history: OperatorHistoryItem[];
  refs: OperatorEntityRefs;
  envelope: OperatorEnvelope;
  assistMode: OperatorAssistMode;
  allowedTools: OperatorToolName[];
  capabilities: string[];
};

export type OperatorComposeInput = {
  question: string;
  plan: OperatorPlan;
  traces: Array<{ name: string; ok: boolean; result: unknown }>;
  writeSummaries: string[];
  assistMode: OperatorAssistMode;
};
