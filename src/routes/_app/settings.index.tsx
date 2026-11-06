import { createFileRoute } from "@tanstack/react-router"
import { PhoneList, SectionView } from "@/components/settings/layout"
import { findSection } from "@/components/settings/registry"

// Phones get the list of sections. From md up, General shows and the rail marks it.
export const Route = createFileRoute("/_app/settings/")({
  component: () => (
    <>
      <PhoneList />
      <div className="max-md:hidden">
        <SectionView section={findSection("general")!} />
      </div>
    </>
  ),
})
