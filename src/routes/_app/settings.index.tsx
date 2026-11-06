import { createFileRoute } from "@tanstack/react-router"
import { PhoneList, SectionView } from "@/components/settings/layout"
import { findSection } from "@/components/settings/registry"

// Phone: the list of sections. md and up: General, with the rail marking it.
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
