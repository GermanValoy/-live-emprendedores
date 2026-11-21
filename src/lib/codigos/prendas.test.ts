import { describe, expect, it } from "vitest";
import type { Codigo } from "./tipos";
import { prendasLibres } from "./prendas";

function codigo(p: Partial<Codigo>): Codigo {
  return {
    id: "x", live_session_id: "v", store_id: "t", word: "x", label: "X", price_cents: 100, quantity: 1, sold: 0,
    photo_path: null, product_id: null, by_voice: false, status: "cerrado", last_winner_name: null,
    last_winner_at: null, created_at: "2026-11-19T10:00:00Z", closed_at: null, ...p,
  };
}

describe("prendasLibres", () => {
  it("deja solo los cerrados con unidades, del más nuevo al más viejo", () => {
    const r = prendasLibres([
      codigo({ id: "viejo", created_at: "2026-11-19T10:00:00Z", quantity: 2, sold: 1 }),
      codigo({ id: "activo", status: "activo" }),
      codigo({ id: "anulado", status: "anulado" }),
      codigo({ id: "agotado", quantity: 1, sold: 1 }),
      codigo({ id: "nuevo", created_at: "2026-11-19T11:00:00Z" }),
    ]);
    expect(r.map((c) => c.id)).toEqual(["nuevo", "viejo"]);
  });
});
