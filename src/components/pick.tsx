import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/** Single-value select over a flat option list. Empty string means "none". */
export function Pick({
  value,
  onChange,
  options,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder: string
  className?: string
  "aria-label"?: string
}) {
  const items = [{ value: "", label: placeholder }, ...options]
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange((v as string | null) ?? "")}>
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
