"use client";

import { DISCOVERY_CATEGORY_GROUPS } from "@/lib/leads/discovery-categories";

export default function SectorSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
    >
      <option value="" disabled>
        Scegli un settore
      </option>
      {DISCOVERY_CATEGORY_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
