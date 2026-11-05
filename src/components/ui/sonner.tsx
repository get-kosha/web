"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useTheme } from "@/lib/theme"
import { CheckCircleIcon, CircleNotchIcon, InfoIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react/ssr"

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={useTheme()}
      className="toaster group"
      icons={{
        success: <CheckCircleIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <WarningIcon className="size-4" />,
        error: <XCircleIcon className="size-4" />,
        loading: <CircleNotchIcon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
