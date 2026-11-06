import { createFileRoute } from "@tanstack/react-router"
import { getAvatar, userId } from "@/server/auth.server"

// Serves the signed-in user's profile picture from R2. The request middleware has already checked the
// session. The URL in user.image changes with each upload, so the browser may keep this one forever.
export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      GET: async () => {
        const photo = await getAvatar(await userId())
        if (!photo) return new Response("Not found", { status: 404 })
        return new Response(photo.body, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        })
      },
    },
  },
})
