import { ownedSession, failure, ApiError } from "@/lib/server";
import { buildDocument } from "@/lib/documents";
import { isDiscoveryComplete } from "@/lib/model";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const s = await ownedSession(url.searchParams.get("id") || "");
    const kind = url.searchParams.get("kind") === "deployment" ? "deployment" : "build";
    if (!isDiscoveryComplete(s))
      throw new ApiError(409, "Complete discovery before exporting a build brief.");
    if (
      kind === "deployment" &&
      (!s.approvedDemoId || s.approvedDemoId !== s.demos.at(-1)?.id)
    )
      throw new ApiError(
        409,
        "The client must approve the current demo before deployment guidance can be exported.",
      );
    return new Response(buildDocument(s, kind), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="mirai-${s.id}-${kind}.md"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
