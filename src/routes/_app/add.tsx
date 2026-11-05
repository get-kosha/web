import { createFileRoute } from "@tanstack/react-router"
import { PhoneAdd } from "@/components/phone-add"

export const Route = createFileRoute("/_app/add")({
  head: () => ({ meta: [{ title: "Add · Kosha" }] }),
  component: PhoneAdd,
})
