import { createFileRoute } from "@tanstack/react-router"
import { userId } from "@/server/auth.server"
import { getAttachment } from "@/server/attachments.server"

// Serves one of the signed-in user's attachments from R2. The request middleware has already checked the session.
// The type was read from the file's bytes on upload, and nosniff stops the browser guessing another.
// ?download=1 saves it instead of opening it.
export const Route = createFileRoute("/api/attachments/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const file = await getAttachment(await userId(), params.id)
        if (!file) return new Response("Not found", { status: 404 })
        const download = new URL(request.url).searchParams.has("download")
        return new Response(file.body, {
          headers: {
            "Content-Type": file.type,
            "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
            // An attachment never changes; deleting it gives the next one a new id.
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        })
      },
    },
  },
})
