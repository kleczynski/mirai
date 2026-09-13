import { body, database, json } from "@/lib/server";
import { projectPrincipal, projectFailure } from "@/lib/project-server";
import {
  createProject,
  getProject,
  listProjects,
  mutateProject,
} from "@/lib/project-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const p = await projectPrincipal(),
      id = new URL(request.url).searchParams.get("id");
    return json(
      id ? await getProject(database(), p, id) : await listProjects(database(), p),
    );
  } catch (e) {
    return projectFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    return json(
      await createProject(database(), await projectPrincipal(), await body(request)),
      201,
    );
  } catch (e) {
    return projectFailure(e);
  }
}
export async function PATCH(request: Request) {
  try {
    return json(
      await mutateProject(
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
