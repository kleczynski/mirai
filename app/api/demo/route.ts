import { z } from "zod";
import {
  body,
  clientSession,
  ownedSession,
  database,
  failure,
  json,
  ApiError,
} from "@/lib/server";
import { cutSchema, retailSchema, dentalSchema, demoDefaults } from "@/lib/demo-engine";
export const dynamic = "force-dynamic";
async function access(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) throw new ApiError(400, "Brak sesji.");
  const s = request.headers.has("authorization")
    ? await clientSession(request)
    : await ownedSession(id);
  if (s.id !== id) throw new ApiError(404, "Demo nie jest dostępne w tej sesji.");
  const demo = s.demos.find((d) => d.bundled);
  if (!demo || s.template === "custom")
    throw new ApiError(404, "Brak połączonego demo.");
  return { s, demo, key: `${s.id}:${demo.id}` };
}
export async function GET(request: Request) {
  try {
    const { s, demo, key } = await access(request);
    const row = await database()
      .prepare("SELECT data,revision,updated_at FROM demo_states WHERE id=?")
      .bind(key)
      .first<{ data: string; revision: number; updated_at: string }>();
    return json({
      title: s.title,
      template: s.template,
      demoId: demo.id,
      version: demo.version,
      state: row
        ? JSON.parse(row.data)
        : demoDefaults[s.template as keyof typeof demoDefaults],
      revision: row?.revision ?? 0,
      updatedAt: row?.updated_at ?? null,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { s, key } = await access(request);
    const m = z
      .object({ revision: z.number().int().min(0), state: z.unknown() })
      .parse(await body(request));
    const schema =
      s.template === "carpenter"
        ? cutSchema
        : s.template === "retail"
          ? retailSchema
          : dentalSchema;
    const data = schema.parse(m.state);
    const now = new Date().toISOString();
    const result =
      m.revision === 0
        ? await database()
            .prepare(
              "INSERT INTO demo_states (id,session_id,data,revision,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(id) DO NOTHING",
            )
            .bind(key, s.id, JSON.stringify(data), now)
            .run()
        : await database()
            .prepare(
              "UPDATE demo_states SET data=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
            )
            .bind(JSON.stringify(data), now, key, m.revision)
            .run();
    if (!result.meta.changes)
      throw new ApiError(
        409,
        "Inna karta zapisała nowsze dane. Skopiuj swoje zmiany i wczytaj zapis ponownie.",
      );
    return json({ revision: m.revision + 1, updatedAt: now });
  } catch (e) {
    return failure(e);
  }
}
