import { cn } from "@/lib/utils"

/**
 * The Kosha symbol: a K whose arm is a coin. Peacock body on light grounds, paper body on dark,
 * marigold coin in both. The only brand colour inside the app.
 */
export function KoshaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 475 552" aria-hidden="true" className={cn("h-6 w-auto shrink-0", className)}>
      <path
        className="fill-[#0F524E] dark:fill-[#F3F5F0]"
        d="M124 18.1 122.7 11.4 118.9 5.5 113.1 1.5 109.8 0.4 106.1 0 16 0.1 10.9 1.5 6.4 4.3 2.9 8.2 0.4 14.2 0 18.1 0 533.9 0.7 539 2.9 543.8 5.5 546.9 9.3 549.7 13 551.3 18.1 552 107.5 551.9 111 551.3 114.7 549.7 120.1 545.2 123.1 539.5 124 534.1 124.1 385.6 125.3 381.6 127.9 378.4 131.5 376.4 134.6 375.9 138.8 376.6 142.3 378.9 317.5 546.9 321.5 549.9 325.2 551.3 330.2 552 457 552 462.2 551.3 467 549.1 469.8 546.8 472.4 543.6 474.4 539.3 475.1 535.8 475.1 532.2 474.2 528.2 472.1 523.9 469.7 521.1 125.9 191.1 124.5 188.2 124 184.9Z"
      />
      <circle cx="342.4" cy="126" r="126" fill="#F4A62A" />
    </svg>
  )
}
