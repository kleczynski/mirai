"use client";
import { useMemo, useRef, useState } from "react";
import { Download, Upload, ShoppingBasket, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { retailFromCSV, restock, csvValue, type RetailInput } from "@/lib/demo-engine";
import { downloadFile } from "../workbench";
import { toast } from "sonner";
export default function RetailDemo({
  value,
  onChange,
}: {
  value: RetailInput;
  onChange: (v: RetailInput) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const { rows, error } = useMemo(() => {
    try {
      return { rows: restock(value), error: "" };
    } catch {
      return {
        rows: [],
        error: "Sprawdź ilości, ceny, zapas dni i wielkość opakowania.",
      };
    }
  }, [value]);
  const ready = rows.filter((r) => !r.issue && r.qty > 0);
  const total = ready.reduce((n, r) => n + r.total, 0);
  const blockers = rows.filter((r) => r.issue);
  const change = (next: RetailInput) => {
    setConfirmed(false);
    onChange(next);
  };
  const edit = (id: string, field: string, v: number | null) =>
    change({
      ...value,
      items: value.items.map((p) => (p.id === id ? { ...p, [field]: v } : p)),
    });
  const sample =
    "name;ean;stock;shelf;sales7;days;pack;Eurocash;Makro;Specjał\nMasło 200 g;5901234123457;5;0;28;3;10;6.20;6.45;6.10\nMleko 1 l;5901234123464;12;12;56;2;12;3.10;3.05;\n";
  return (
    <>
      <div className="retail-top">
        <section className="demo-panel retail-instructions">
          <span className="step-dot">1</span>
          <div>
            <h2>Sprawdź półkę, nie tylko komputer</h2>
            <p>
              W przykładzie masło ma stan 5 w systemie. Wpisz 0 na półce i zobacz, jak
              zmienia się zamówienie.
            </p>
          </div>
        </section>
        <div className="import-actions">
          <input
            type="file"
            accept=".csv,text/csv"
            ref={file}
            className="sr-only"
            aria-label="Import CSV"
            onChange={async (e) => {
              try {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 100000) throw new Error("Maksymalny rozmiar: 100 KB.");
                change(retailFromCSV(await f.text()));
                toast.success("Wczytano CSV. Sprawdź dane i zapisz projekt.");
              } catch (err) {
                toast.error((err as Error).message);
              } finally {
                e.target.value = "";
              }
            }}
          />
          <button
            className="button secondary"
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
            Importuj CSV
          </button>
          <button
            className="text-button"
            onClick={() =>
              downloadFile("przyklad-stanow.csv", sample, "text/csv;charset=utf-8")
            }
          >
            <Download size={14} />
            Pobierz wzór CSV
          </button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="error-box"
        >
          {error}
        </div>
      )}
      <section className="stock-list">
        {value.items.map((p, i) => {
          const r = rows[i];
          return (
            <article
              className="demo-panel stock-item"
              key={p.id}
            >
              <div className="stock-item-heading">
                <span className="stock-icon">
                  <ShoppingBasket size={23} />
                </span>
                <div>
                  <h2>{p.name}</h2>
                  <span className="meta">EAN {p.ean}</span>
                </div>
                {r && (
                  <span
                    className={`status ${r.issue ? "status-demo-review" : "status-approved"}`}
                  >
                    {r.issue || "Gotowe do zamówienia"}
                  </span>
                )}
              </div>
              <div className="stock-fields">
                <label>
                  Stan w systemie
                  <input
                    type="number"
                    min={0}
                    value={p.stock}
                    onChange={(e) => edit(p.id, "stock", Number(e.target.value))}
                  />
                </label>
                <label className="shelf-field">
                  Faktycznie na półce
                  <input
                    type="number"
                    min={0}
                    value={p.shelf ?? ""}
                    placeholder="Sprawdź"
                    onChange={(e) =>
                      edit(
                        p.id,
                        "shelf",
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  Sprzedaż / 7 dni
                  <input
                    type="number"
                    min={0}
                    value={p.sales7}
                    onChange={(e) => edit(p.id, "sales7", Number(e.target.value))}
                  />
                </label>
                <label>
                  Zapas na dni
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={p.days}
                    onChange={(e) => edit(p.id, "days", Number(e.target.value))}
                  />
                </label>
                <label>
                  Sztuk / opakowanie
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={p.pack}
                    onChange={(e) => edit(p.id, "pack", Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="supplier-comparison">
                {p.offers.map((offer, j) => (
                  <label
                    className={r?.best?.supplier === offer.supplier ? "best-price" : ""}
                    key={j}
                  >
                    <span>
                      {offer.supplier}
                      {r?.best?.supplier === offer.supplier && <Check size={13} />}
                    </span>
                    <div>
                      <input
                        aria-label={`${p.name}, cena ${offer.supplier}`}
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={offer.price}
                        onChange={(e) =>
                          change({
                            ...value,
                            items: value.items.map((x) =>
                              x.id === p.id
                                ? {
                                    ...x,
                                    offers: x.offers.map((o, k) =>
                                      k === j
                                        ? { ...o, price: Number(e.target.value) }
                                        : o,
                                    ),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                      <span>zł / szt.</span>
                    </div>
                  </label>
                ))}
              </div>
              {r && (
                <div className="calculation">
                  <p>
                    ({p.sales7} ÷ 7 × {p.days} dni − {r.effective} szt.) → pełne
                    opakowania po {p.pack} szt.
                  </p>
                  <strong>
                    {r.qty} szt. <span>do uzupełnienia</span>
                  </strong>
                </div>
              )}
            </article>
          );
        })}
      </section>
      <section className="demo-panel order-summary">
        <div>
          <span className="step-dot">2</span>
          <h2>Sprawdź i pobierz zamówienie</h2>
          <p>
            {ready.length} pozycji gotowych · szacunkowa wartość{" "}
            <strong>{total.toFixed(2)} zł</strong>
          </p>
          <p className="meta">
            Ceny muszą być w tej samej jednostce i na tej samej podstawie podatkowej.
            Bez kosztów dostawy i minimów zamówienia. CSV to lista robocza, nie format
            EDI++.
          </p>
          {blockers.length > 0 && (
            <p className="error-text">
              {blockers.length} pozycji wymaga uwagi. Uzupełnij je przed eksportem.
            </p>
          )}
          <label className="check-label">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            Sprawdziłem półki, ilości i porównywalność cen.
          </label>
        </div>
        <button
          className="button"
          disabled={!confirmed || !!error || blockers.length > 0 || !ready.length}
          onClick={() => {
            const header = [
              "EAN",
              "Produkt",
              "Hurtownia",
              "Ilość",
              "Cena za szt.",
              "Wartość",
            ];
            const lines = ready.map((p) => [
              p.ean,
              p.name,
              p.best.supplier,
              p.qty,
              p.best.price.toFixed(2),
              p.total.toFixed(2),
            ]);
            downloadFile(
              "zamowienie-do-sprawdzenia.csv",
              "\uFEFF" +
                [header, ...lines].map((r) => r.map(csvValue).join(";")).join("\r\n"),
              "text/csv;charset=utf-8",
            );
          }}
        >
          <Download size={17} />
          Pobierz zamówienie CSV
        </button>
      </section>
    </>
  );
}
