import { createFileRoute, redirect } from "@tanstack/react-router"
import { SectionView } from "@/components/settings/layout"
import { findSection } from "@/components/settings/registry"
import { getAiUsage, listAiProviders, listCategories, listTitleRules, type ManagedCategory } from "@/lib/api"

export const Route = createFileRoute("/_app/settings/$section")({
  beforeLoad: ({ params }) => {
    if (!findSection(params.section)) throw redirect({ to: "/settings/$section", params: { section: "general" } })
  },
  // Only sections with data of their own load anything.
  loader: async ({ params }) => ({
    categories: params.section === "categories" ? await listCategories() : ([] as ManagedCategory[]),
    rules: params.section === "rules" ? await listTitleRules({ data: { q: "", page: 0 } }) : null,
    ai: params.section === "ai" ? { providers: await listAiProviders(), usage: await getAiUsage() } : null,
  }),
  head: ({ params }) => ({ meta: [{ title: `${findSection(params.section)?.title ?? "Settings"} · Kosha` }] }),
  component: Section,
})

function Section() {
  const { section } = Route.useParams()
  return <SectionView section={findSection(section)!} />
}
