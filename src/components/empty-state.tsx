import Link from "next/link";
import type { ReactNode } from "react";

export type EmptyStateProps = {
  /** Titolo breve e leggibile dello stato vuoto. */
  title: string;
  /** Spiega perché la sezione è vuota e cosa ci sarà qui. */
  description: string;
  /** Prossimo passo operativo (§21.1: ogni empty state propone una next action). */
  nextAction: {
    label: string;
    href: string;
  };
  /** Icona o illustrazione opzionale. */
  icon?: ReactNode;
};

/**
 * EmptyState — §21 inventory.
 * Ogni stato vuoto spiega il prossimo passo con un'azione esplicita.
 */
export default function EmptyState({
  title,
  description,
  nextAction,
  icon,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white px-8 py-14 text-center">
      {icon ? (
        <div className="mb-4 text-stone-400" aria-hidden>
          {icon}
        </div>
      ) : (
        <div
          aria-hidden
          className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="h-6 w-6"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7m16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5m16 0h-2.6a1 1 0 0 0-.8.4l-1.2 1.6a1 1 0 0 1-.8.4H9.4a1 1 0 0 1-.8-.4L7.4 13.4a1 1 0 0 0-.8-.4H4"
            />
          </svg>
        </div>
      )}
      <h3 className="text-base font-semibold text-stone-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-stone-500">{description}</p>
      <Link
        href={nextAction.href}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-stone-50 transition-colors hover:bg-stone-700"
      >
        {nextAction.label}
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
