import { body, database, json } from "@/lib/server";
import { projectPrincipal, projectFailure } from "@/lib/project-server";
import { saveCanvas } from "@/lib/project-service";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    return json(
      await saveCanvas(
        database(),
        await projectPrincipal(),
        new URL(request.url).searchParams.get("id") ?? "",
        await body(request),
      ),
    );
  } catch (e) {
    return projectFailure(e);
  }
}
