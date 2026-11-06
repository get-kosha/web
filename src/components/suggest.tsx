import { Autocomplete } from "@base-ui/react/autocomplete"

/** A free-text field that offers matching values from `options` as you type. */
export function Suggest({
  value,
  onChange,
  options,
  ...input
}: Omit<Autocomplete.Input.Props, "value" | "onChange"> & {
  value: string
  onChange: (v: string) => void
  options: readonly string[]
}) {
  return (
    <Autocomplete.Root items={options} value={value} onValueChange={onChange} limit={8} openOnInputClick={false}>
      <Autocomplete.Input autoComplete="off" {...input} />
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={6} align="start" className="isolate z-50">
          <Autocomplete.Popup className="max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Autocomplete.List className="max-h-72 scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:hidden">
              {(item: string) => (
                <Autocomplete.Item
                  key={item}
                  value={item}
                  className="flex min-h-8 w-full cursor-default items-center rounded-md px-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground max-md:min-h-11"
                >
                  <span className="truncate">{item}</span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  )
}
