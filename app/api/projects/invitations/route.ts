import { z } from "zod";
import { body, database, json } from "@/lib/server";
import { projectPrincipal, projectFailure } from "@/lib/project-server";
import { acceptProjectInvitation, members } from "@/lib/project-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return json(
      await members(
        database(),
        await projectPrincipal(),
        new URL(request.url).searchParams.get("id") ?? "",
      ),
    );
  } catch (e) {
    return projectFailure(e);
  }
}
export async function POST(request: Request) {
  try {
    const p = await projectPrincipal(),
      m = z
        .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
        .strict()
        .parse(await body(request));
    return json(await acceptProjectInvitation(database(), p, m.token));
  } catch (e) {
    return projectFailure(e);
  }
}
