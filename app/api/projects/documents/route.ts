import { database } from "@/lib/server";
import { projectPrincipal, projectFailure } from "@/lib/project-server";
import { projectDocument } from "@/lib/project-documents";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const u = new URL(request.url),
      id = u.searchParams.get("id") ?? "",
      kind = u.searchParams.get("kind") === "deployment" ? "deployment" : "build";
    const text = await projectDocument(database(), await projectPrincipal(), id, kind);
    return new Response(text, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="mirai-${id}-${kind}.md"`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return projectFailure(e);
  }
}
