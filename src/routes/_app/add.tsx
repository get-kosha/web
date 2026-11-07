import { createFileRoute } from "@tanstack/react-router"
import { PhoneAdd } from "@/components/phone-add"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_app/add")({
  head: () => ({ meta: [{ title: m.add_page_title() }] }),
  component: PhoneAdd,
})
