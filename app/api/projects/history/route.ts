import { database, json } from "@/lib/server";
import { projectPrincipal, projectFailure } from "@/lib/project-server";
import { evidenceHistory } from "@/lib/project-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const u = new URL(request.url);
    return json(
      await evidenceHistory(
        database(),
        await projectPrincipal(),
        u.searchParams.get("id") ?? "",
        u.searchParams.get("evidenceId") ?? "",
      ),
    );
  } catch (e) {
    return projectFailure(e);
  }
}
