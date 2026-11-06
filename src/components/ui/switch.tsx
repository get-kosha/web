import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "cn"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-[background-color,box-shadow] duration-200 ease-out outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-6 data-[size=default]:w-10 data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] max-md:data-[size=default]:h-[30px] max-md:data-[size=default]:w-12 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:bg-brand data-unchecked:bg-[#d4d4cf] dark:data-unchecked:bg-[#3a3a40] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-0 transition-transform duration-[260ms] ease-out group-data-[size=default]/switch:ml-[2px] group-data-[size=default]/switch:size-[18px] group-data-[size=sm]/switch:size-3 max-md:group-data-[size=default]/switch:size-6 group-data-[size=default]/switch:data-checked:translate-x-4 group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] max-md:group-data-[size=default]/switch:data-checked:translate-x-[18px] group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
