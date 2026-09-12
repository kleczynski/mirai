"use client";
import { useMemo } from "react";
import { Plus, Trash2, Download, MoveVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cuttingPlan, type CutInput } from "@/lib/demo-engine";
import { downloadFile } from "../workbench";
const colors = ["#b9cbed", "#a7c8c2", "#dac4a6", "#c6bedf", "#aecad9", "#d3c99d"];
export default function CuttingDemo({
  value: c,
  onChange,
}: {
  value: CutInput;
  onChange: (v: CutInput) => void;
}) {
  const result = useMemo(() => {
    try {
      return { plan: cuttingPlan(c), error: "" };
    } catch (e) {
      return {
        plan: null,
        error: (e as Error).message.startsWith("[")
          ? "Sprawdź wymiary, ilości i ustawienia. Maksymalnie 50 elementów."
          : (e as Error).message,
      };
    }
  }, [c]);
  const edit = (id: string, field: string, v: string | number | boolean) =>
    onChange({
      ...c,
      parts: c.parts.map((p) => (p.id === id ? { ...p, [field]: v } : p)),
    });
  return (
    <div className="cut-layout">
      <section className="demo-panel">
        <div className="section-heading">
          <h2>Twój zestaw elementów</h2>
          <span className="meta">Wymiary gotowe, mm</span>
        </div>
        <div className="dimension-settings">
          <label>
            Szerokość płyty
            <input
              type="number"
              value={c.boardWidth}
              min={100}
              max={6000}
              onChange={(e) => onChange({ ...c, boardWidth: Number(e.target.value) })}
            />
          </label>
          <label>
            Wysokość płyty
            <input
              type="number"
              value={c.boardHeight}
              min={100}
              max={6000}
              onChange={(e) => onChange({ ...c, boardHeight: Number(e.target.value) })}
            />
          </label>
          <label>
            Rzaz piły
            <input
              type="number"
              value={c.kerf}
              min={0}
              max={10}
              step={0.1}
              onChange={(e) => onChange({ ...c, kerf: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="part-list">
          {c.parts.map((p, i) => (
            <article
              className="part-editor"
              key={p.id}
            >
              <div className="row-between">
                <span
                  className="part-color"
                  style={{ background: colors[i % colors.length] }}
                />
                <input
                  aria-label={`Nazwa elementu ${i + 1}`}
                  value={p.name}
                  maxLength={80}
                  onChange={(e) => edit(p.id, "name", e.target.value)}
                />
                <button
                  className="text-button"
                  disabled={c.parts.length === 1}
                  aria-label={`Usuń ${p.name}`}
                  onClick={() =>
                    onChange({ ...c, parts: c.parts.filter((x) => x.id !== p.id) })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="part-dimensions">
                <label>
                  Szerokość
                  <input
                    type="number"
                    min={1}
                    max={6000}
                    value={p.width}
                    onChange={(e) => edit(p.id, "width", Number(e.target.value))}
                  />
                </label>
                <span>×</span>
                <label>
                  Wysokość
                  <input
                    type="number"
                    min={1}
                    max={6000}
                    value={p.height}
                    onChange={(e) => edit(p.id, "height", Number(e.target.value))}
                  />
                </label>
                <label>
                  Sztuki
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={p.quantity}
                    onChange={(e) => edit(p.id, "quantity", Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="part-options">
                <label className="check-label">
                  <Checkbox
                    checked={p.grain}
                    onCheckedChange={(v) => edit(p.id, "grain", v === true)}
                  />
                  <MoveVertical size={14} />
                  Nie obracaj słojów
                </label>
                <label>
                  Obrzeże
                  <select
                    value={p.edge}
                    onChange={(e) => edit(p.id, "edge", Number(e.target.value))}
                  >
                    <option value={0}>Brak</option>
                    <option value={0.8}>ABS 0,8 mm</option>
                    <option value={2}>ABS 2 mm</option>
                  </select>
                </label>
              </div>
            </article>
          ))}
        </div>
        <button
          className="button secondary full"
          disabled={c.parts.reduce((n, p) => n + p.quantity, 0) >= 50}
          onClick={() =>
            onChange({
              ...c,
              parts: [
                ...c.parts,
                {
                  id: crypto.randomUUID(),
                  name: "Nowy element",
                  width: 400,
                  height: 300,
                  quantity: 1,
                  grain: false,
                  edge: 0,
                },
              ],
            })
          }
        >
          <Plus size={16} />
          Dodaj element
        </button>
        <p className="meta helper">
          Obrzeże odejmujemy z obu stron szerokości i wysokości (wszystkie 4 krawędzie).
          Na planie widzisz wymiary cięcia. Dokładność obliczeń: 0,1 mm.
        </p>
      </section>
      <section className="demo-panel board-panel">
        <div className="section-heading">
          <h2>Plan rozkroju</h2>
          <span className="live-label">Przeliczany na bieżąco</span>
        </div>
        {result.error ? (
          <div
            role="alert"
            className="error-box"
          >
            {result.error}
          </div>
        ) : (
          result.plan && (
            <>
              <div className="result-strip">
                <div>
                  <strong>{result.plan.boards.length}</strong>
                  <span>Płyty</span>
                </div>
                <div>
                  <strong>{result.plan.utilization.toFixed(1)}%</strong>
                  <span>Wykorzystanie</span>
                </div>
                <div>
                  <strong>{result.plan.waste.toFixed(2)} m²</strong>
                  <span>Odpad + rzaz</span>
                </div>
              </div>
              {result.plan.boards.map((pieces, i) => (
                <div
                  className="board-wrap"
                  key={i}
                >
                  <div className="row-between">
                    <h3>Płyta {i + 1}</h3>
                    <span className="meta">
                      {c.boardWidth} × {c.boardHeight} mm
                    </span>
                  </div>
                  <svg
                    viewBox={`0 0 ${c.boardWidth} ${c.boardHeight}`}
                    role="img"
                    aria-label={`Rozkrój płyty ${i + 1}: ${pieces.length} elementów`}
                  >
                    <rect
                      width={c.boardWidth}
                      height={c.boardHeight}
                      fill="#f1f3f6"
                    />
                    {pieces.map((p, j) => (
                      <g key={p.id}>
                        <rect
                          x={p.x}
                          y={p.y}
                          width={p.width}
                          height={p.height}
                          fill={colors[j % colors.length]}
                          stroke="#fff"
                          strokeWidth={2}
                        />
                        <text
                          x={p.x + p.width / 2}
                          y={p.y + p.height / 2 - 12}
                          fontSize={Math.min(
                            45,
                            (p.width / Math.max(p.name.length, 1)) * 1.4,
                            p.height / 4,
                          )}
                          fill="#30415b"
                          textAnchor="middle"
                        >
                          {p.name}
                        </text>
                        <text
                          x={p.x + p.width / 2}
                          y={p.y + p.height / 2 + 35}
                          fontSize={Math.min(32, p.width / 10, p.height / 5)}
                          fill="#42536a"
                          textAnchor="middle"
                        >
                          {p.width} × {p.height}
                          {p.rotated ? " ↻" : ""}
                          {p.grain ? " ↕" : ""}
                        </text>
                      </g>
                    ))}
                  </svg>
                  <div className="piece-legend">
                    {pieces.map((p) => (
                      <span key={p.id}>
                        {p.name}: {p.width} × {p.height} mm{p.rotated ? " (obrót)" : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <button
                className="button secondary full"
                onClick={() => {
                  if (!result.plan) return;
                  const lines = result.plan.boards
                    .map(
                      (b, i) =>
                        `PŁYTA ${i + 1}\n` +
                        b
                          .map(
                            (p) =>
                              `${p.name}: ${p.width} × ${p.height} mm; x=${p.x}, y=${p.y}; obrót=${p.rotated ? "tak" : "nie"}`,
                          )
                          .join("\n"),
                    )
                    .join("\n\n");
                  downloadFile(
                    "plan-rozkroju.txt",
                    `PLAN ROZKROJU — SPRAWDŹ PRZED CIĘCIEM\nPłyta: ${c.boardWidth} × ${c.boardHeight} mm\nRzaz: ${c.kerf} mm\nWymiary cięcia po odjęciu obrzeża ze wszystkich czterech krawędzi.\n\n${lines}`,
                  );
                }}
              >
                <Download size={16} />
                Pobierz listę cięcia
              </button>
            </>
          )
        )}
      </section>
    </div>
  );
}
