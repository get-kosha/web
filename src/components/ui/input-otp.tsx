import * as React from "react"
import { cn } from "cn"
import { OTPInput, OTPInputContext } from "input-otp"

// Restyled from shadcn's joined strip: separate boxes that share the row, so six of them fit any column width.

function InputOTP({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}) {
  return (
    <OTPInput
      data-slot="input-otp"
      containerClassName={cn(
        "cn-input-otp flex w-full items-center gap-2 has-disabled:opacity-50 max-md:gap-1.5",
        containerClassName
      )}
      spellCheck={false}
      className={cn("disabled:cursor-not-allowed", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex min-w-0 flex-1 items-center gap-2 max-md:gap-1.5", className)}
      {...props}
    />
  )
}

function InputOTPSlot({
  index,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  index: number
}) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex h-[60px] min-w-0 flex-1 items-center justify-center rounded-xl border border-border bg-card font-mono text-[26px] font-medium text-foreground transition-[border-color] outline-none aria-invalid:border-destructive data-[active=true]:border-2 data-[active=true]:border-foreground data-[active=true]:aria-invalid:border-destructive max-md:h-[58px] max-md:text-2xl",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[26px] w-px animate-caret-blink bg-foreground duration-1000" />
        </div>
      )}
    </div>
  )
}

/** A short bar between the two groups of three. */
function InputOTPSeparator({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-separator"
      aria-hidden="true"
      className="flex w-2.5 shrink-0 justify-center max-md:w-2"
      {...props}
    >
      <span className="h-0.5 w-full rounded-full bg-chart-4" />
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }
