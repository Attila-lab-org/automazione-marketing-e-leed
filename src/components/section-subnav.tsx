"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

export type SectionSubnavItem = {
  href: string;
  label: string;
};

function matches(href: string, pathname: string, search: string) {
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  if (!query) {
    if (path === "/leads") return !search || search === "?";
    return true;
  }
  return search.replace(/^\?/, "") === query;
}

function SectionSubnavInner({ items }: { items: SectionSubnavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString() ? `?${searchParams.toString()}` : "";

  return (
    <nav
      aria-label="Sottosezioni"
      className="mb-6 flex flex-wrap gap-1 rounded-xl border border-stone-200 bg-white p-1"
    >
      {items.map((item) => {
        const active = matches(item.href, pathname, search);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-stone-900 font-medium text-white"
                : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function SectionSubnav({ items }: { items: SectionSubnavItem[] }) {
  return (
    <Suspense fallback={<div className="mb-6 h-10 rounded-xl border border-stone-200 bg-white" />}>
      <SectionSubnavInner items={items} />
    </Suspense>
  );
}
