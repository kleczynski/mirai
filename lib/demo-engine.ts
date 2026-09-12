import { z } from "zod";
export const cutSchema = z.object({
  boardWidth: z.number().min(100).max(6000),
  boardHeight: z.number().min(100).max(6000),
  kerf: z.number().min(0).max(10),
  parts: z
    .array(
      z.object({
        id: z.string().max(80),
        name: z.string().trim().min(1).max(80),
        width: z.number().positive().max(6000),
        height: z.number().positive().max(6000),
        quantity: z.number().int().min(1).max(50),
        grain: z.boolean(),
        edge: z.number().min(0).max(2),
      }),
    )
    .min(1)
    .max(50)
    .refine(
      (p) => p.reduce((s, x) => s + x.quantity, 0) <= 50,
      "Maksymalnie 50 elementów.",
    ),
});
export type CutInput = z.infer<typeof cutSchema>;
export type Placement = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  grain: boolean;
};
export function cuttingPlan(input: CutInput) {
  const c = cutSchema.parse(input),
    scale = (n: number) => Math.round(n * 10),
    W = scale(c.boardWidth),
    H = scale(c.boardHeight),
    K = scale(c.kerf);
  type Rect = { x: number; y: number; w: number; h: number };
  const boards: { free: Rect[]; pieces: Placement[] }[] = [];
  const parts = c.parts
    .flatMap((p) =>
      Array.from({ length: p.quantity }, (_, i) => ({
        ...p,
        id: p.id + "-" + i,
        w: scale(p.width - 2 * p.edge),
        h: scale(p.height - 2 * p.edge),
      })),
    )
    .sort((a, b) => b.w * b.h - a.w * a.h);
  for (const p of parts) {
    if (p.w <= 0 || p.h <= 0)
      throw new Error(`Obrzeże jest większe niż element „${p.name}”.`);
    if (!((p.w <= W && p.h <= H) || (!p.grain && p.h <= W && p.w <= H)))
      throw new Error(
        `Element „${p.name}” nie mieści się na płycie przy wybranym kierunku słojów.`,
      );
    let chosen: {
      b: number;
      r: number;
      w: number;
      h: number;
      rotated: boolean;
      score: number;
    } | null = null;
    const find = () => {
      boards.forEach((b, bi) =>
        b.free.forEach((r, ri) => {
          for (const rot of p.grain ? [false] : [false, true]) {
            const w = rot ? p.h : p.w,
              h = rot ? p.w : p.h;
            if (w <= r.w && h <= r.h) {
              const score = r.w * r.h - w * h;
              if (!chosen || score < chosen.score)
                chosen = { b: bi, r: ri, w, h, rotated: rot, score };
            }
          }
        }),
      );
    };
    find();
    if (!chosen) {
      boards.push({ free: [{ x: 0, y: 0, w: W, h: H }], pieces: [] });
      find();
    }
    const hit = chosen as unknown as {
      b: number;
      r: number;
      w: number;
      h: number;
      rotated: boolean;
    };
    const b = boards[hit.b],
      r = b.free.splice(hit.r, 1)[0];
    b.pieces.push({
      id: p.id,
      name: p.name,
      x: r.x / 10,
      y: r.y / 10,
      width: hit.w / 10,
      height: hit.h / 10,
      rotated: hit.rotated,
      grain: p.grain,
    });
    if (r.w - hit.w - K > 0)
      b.free.push({ x: r.x + hit.w + K, y: r.y, w: r.w - hit.w - K, h: r.h });
    if (r.h - hit.h - K > 0)
      b.free.push({ x: r.x, y: r.y + hit.h + K, w: hit.w, h: r.h - hit.h - K });
  }
  const used = parts.reduce((a, p) => a + p.w * p.h, 0),
    total = boards.length * W * H;
  return {
    boards: boards.map((b) => b.pieces),
    utilization: (used / total) * 100,
    waste: (total - used) / 100000000,
    partCount: parts.length,
  };
}
export function validEAN(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  return (
    (10 -
      ([...value.slice(0, 12)].reduce((s, n, i) => s + Number(n) * (i % 2 ? 3 : 1), 0) %
        10)) %
      10 ===
    Number(value[12])
  );
}
export const retailSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().max(80),
        name: z.string().trim().min(1).max(100),
        ean: z.string().max(30),
        stock: z.number().min(0).max(100000),
        shelf: z.number().min(0).max(100000).nullable(),
        sales7: z.number().min(0).max(100000),
        days: z.number().int().min(1).max(90),
        pack: z.number().int().min(1).max(1000),
        offers: z
          .array(
            z.object({
              supplier: z.string().trim().min(1).max(80),
              price: z.number().positive().max(100000),
            }),
          )
          .max(6),
      }),
    )
    .min(1)
    .max(100),
});
export type RetailInput = z.infer<typeof retailSchema>;
export function restock(input: RetailInput) {
  const data = retailSchema.parse(input);
  const seen = new Set<string>();
  return data.items.map((p) => {
    const duplicate = seen.has(p.ean);
    seen.add(p.ean);
    const issue = !validEAN(p.ean)
      ? "Nieprawidłowy EAN"
      : duplicate || data.items.filter((x) => x.ean === p.ean).length > 1
        ? "Powtórzony EAN"
        : !p.offers.length
          ? "Brak oferty"
          : p.shelf === null
            ? "Potwierdź stan półki"
            : p.sales7 === 0
              ? "Brak sprzedaży — oceń ręcznie"
              : null;
    const effective = p.shelf ?? p.stock;
    const qty =
      Math.ceil(Math.max(0, (p.sales7 / 7) * p.days - effective) / p.pack) * p.pack;
    const best = [...p.offers].sort((a, b) => a.price - b.price)[0];
    return {
      ...p,
      effective,
      qty,
      best,
      total: best ? Math.round(qty * best.price * 100) / 100 : 0,
      issue,
    };
  });
}
// Quoted CSV parser: accepts commas/semicolons, preserves EAN leading zeros.
export function parseCSV(text: string) {
  if (text.length > 100000) throw new Error("Plik jest zbyt duży (maks. 100 KB).");
  const delimiter = text.split(/\r?\n/)[0].includes(";") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell !== "")
        throw new Error("Nieprawidłowy cudzysłów w CSV.");
      else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new Error("Niezamknięty cudzysłów w CSV.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("CSV musi zawierać nagłówek i dane.");
  const header = rows.shift()!.map((x) => x.replace(/^\uFEFF/, "").trim());
  if (new Set(header).size !== header.length)
    throw new Error("Powtórzone kolumny CSV.");
  return rows.map((r) => {
    if (r.length !== header.length) throw new Error("Niezgodna liczba kolumn CSV.");
    return Object.fromEntries(header.map((h, i) => [h, r[i].trim()]));
  });
}
export function retailFromCSV(text: string): RetailInput {
  const rows = parseCSV(text);
  const number = (v: string | undefined, optional = false) => {
    if (v === undefined || v === "") {
      if (optional) return null;
      throw new Error("Brak wymaganej wartości liczbowej.");
    }
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n)) throw new Error("Nieprawidłowa liczba w CSV.");
    return n;
  };
  return retailSchema.parse({
    items: rows.map((r, i) => ({
      id: `import-${i}`,
      name: r.name,
      ean: r.ean,
      stock: number(r.stock),
      shelf: number(r.shelf, true),
      sales7: number(r.sales7),
      days: number(r.days),
      pack: number(r.pack),
      offers: ["Eurocash", "Makro", "Specjał"].flatMap((s) =>
        r[s] ? [{ supplier: s, price: number(r[s]) }] : [],
      ),
    })),
  });
}
export function csvValue(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export const dentalSchema = z.object({
  transcript: z.string().max(12000),
  note: z.string().max(15000),
  reviewed: z.boolean(),
});
export type DentalInput = z.infer<typeof dentalSchema>;
export function structureNote(transcript: string) {
  if (transcript.trim().length < 10)
    throw new Error("Wpisz co najmniej 10 znaków podsumowania.");
  const matches = [
    ...transcript.matchAll(
      /\b(?:ząb|zęba|zębie|zęby|zab|zeba|tooth)\s*[:#-]?\s*([1-4][1-8]|[5-8][1-5])\b/gi,
    ),
  ].map((x) => x[1]);
  const teeth = [...new Set(matches)];
  // Preserve all evidence verbatim. No inferred diagnoses, treatments, doses or codes.
  const note = `NOTATKA ROBOCZA — DO WERYFIKACJI\n\nPodsumowanie dyktowane przez lekarza:\n${transcript.trim()}\n\nWskazane numery zębów (automatyczne wyszukanie, do sprawdzenia):\n${teeth.length ? teeth.join(", ") : "Nie rozpoznano numerów — uzupełnij ręcznie."}\n\nRozpoznanie: do potwierdzenia przez lekarza.\nWykonane procedury: do potwierdzenia przez lekarza.\nZalecenia: do potwierdzenia przez lekarza.\nKody rozliczeniowe: nie przypisano.\n`;
  return { note, teeth };
}
export const demoDefaults = {
  carpenter: {
    boardWidth: 2800,
    boardHeight: 2070,
    kerf: 3.2,
    parts: [
      {
        id: "side",
        name: "Bok szafki",
        width: 720,
        height: 560,
        quantity: 2,
        grain: true,
        edge: 0.8,
      },
      {
        id: "shelf",
        name: "Półka",
        width: 564,
        height: 540,
        quantity: 3,
        grain: false,
        edge: 0.8,
      },
      {
        id: "front",
        name: "Front",
        width: 716,
        height: 596,
        quantity: 1,
        grain: true,
        edge: 2,
      },
    ],
  } satisfies CutInput,
  retail: {
    items: [
      {
        id: "butter",
        ean: "5901234123457",
        name: "Masło 200 g",
        stock: 5,
        shelf: null,
        sales7: 28,
        days: 3,
        pack: 10,
        offers: [
          { supplier: "Eurocash", price: 6.2 },
          { supplier: "Makro", price: 6.45 },
          { supplier: "Specjał", price: 6.1 },
        ],
      },
      {
        id: "milk",
        ean: "5901234123464",
        name: "Mleko 1 l",
        stock: 12,
        shelf: null,
        sales7: 56,
        days: 2,
        pack: 12,
        offers: [
          { supplier: "Eurocash", price: 3.1 },
          { supplier: "Makro", price: 3.05 },
        ],
      },
      {
        id: "pasta",
        ean: "5901234123471",
        name: "Makaron 500 g",
        stock: 8,
        shelf: null,
        sales7: 14,
        days: 14,
        pack: 6,
        offers: [
          { supplier: "Makro", price: 4.4 },
          { supplier: "Specjał", price: 4.25 },
        ],
      },
    ],
  } satisfies RetailInput,
  dental: {
    transcript:
      "Przykład fikcyjny. Ząb 16: wykonano wypełnienie. Pacjent otrzymał omówienie dalszego postępowania. Szczegóły rozpoznania i zaleceń uzupełni lekarz.",
    note: "",
    reviewed: false,
  } satisfies DentalInput,
};
