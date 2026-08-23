import type { ReactNode } from "react";

export type PageHeaderProps = {
  title: string;
  /** Descrizione operativa: cosa fa questa sezione e perché serve. */
  description: string;
  /** Badge o azioni contestuali a destra del titolo. */
  actions?: ReactNode;
};

/**
 * Intestazione standard delle pagine dashboard: titolo, descrizione
 * operativa e spazio per azioni contestuali (§6, §21.1).
 */
export default function PageHeader({
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-xl font-semibold tracking-tight text-stone-900">
          {title}
        </h1>
        <p className="mt-1 text-sm text-stone-500">{description}</p>
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </div>
  );
}
