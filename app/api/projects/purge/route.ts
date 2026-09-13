import { z } from "zod";
import { env } from "cloudflare:workers";
import { body, database, json } from "@/lib/server";
import { projectPrincipal, projectFailure } from "@/lib/project-server";
import { purgeProject } from "@/lib/project-service";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const m = z
      .object({
        revision: z.number().int().nonnegative(),
        confirmation: z.literal("PURGE"),
      })
      .strict()
      .parse(await body(request));
    const id = new URL(request.url).searchParams.get("id") ?? "",
      r = await purgeProject(database(), await projectPrincipal(), id, m.revision);
    let pending = 0;
    for (const file of r.objects) {
      try {
        if (!env.BUCKET) {
          pending++;
          continue;
        }
        await env.BUCKET.delete(file.object_key);
        await database()
          .prepare("DELETE FROM project_files WHERE id=? AND project_id=?")
          .bind(file.id, id)
          .run();
      } catch {
        pending++;
      }
    }
    return json({ revision: r.revision, purged: pending === 0, pendingFiles: pending });
  } catch (e) {
    return projectFailure(e);
  }
}
