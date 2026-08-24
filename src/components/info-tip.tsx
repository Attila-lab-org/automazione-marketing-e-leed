"use client";

type InfoTipProps = {
  text: string;
  label?: string;
};

/** Spiegazione visibile al passaggio del mouse e al focus da tastiera. */
export default function InfoTip({ text, label = "Cosa significa?" }: InfoTipProps) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`${label}: ${text}`}
        className="flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-stone-300 bg-white text-[11px] font-semibold text-stone-500 outline-none hover:border-amber-400 hover:text-amber-700 focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-64 -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-lg group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  );
}
