import { expect, type Page } from "@playwright/test";

/** Elige una foto como lo haría una persona: recién cuando el selector está habilitado (página activa). */
export async function elegirFoto(page: Page, etiqueta: string, archivo: string) {
  const input = page.getByLabel(etiqueta);
  await expect(input).toBeEnabled({ timeout: 30_000 });
  await input.setInputFiles(archivo);
}
