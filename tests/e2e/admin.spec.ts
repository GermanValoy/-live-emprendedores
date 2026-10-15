import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { hacerAdmin } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

let admin: UsuarioPrueba;
let comun: UsuarioPrueba;

test.beforeAll(async () => {
  [admin, comun] = await Promise.all([crearUsuarioPrueba({ nombre: "Admin E2E" }), crearUsuarioPrueba({ nombre: "Comun E2E" })]);
  await hacerAdmin(admin.id);
});

test.afterAll(async () => {
  await Promise.all([admin, comun].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
});

test("sin sesión /admin no existe", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});

test("una persona que no es admin ve que no existe", async ({ page, context }) => {
  await context.addCookies(await cookiesDeSesion(comun.sesion));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Invitaciones" })).toHaveCount(0);
  await expect(page.getByText("No encontramos esta página")).toBeVisible();
});

test("la admin crea una invitación, la copia y la anula", async ({ page, context }) => {
  await context.addCookies(await cookiesDeSesion(admin.sesion));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/admin");
  await page.getByLabel("¿Para quién es? (opcional)").fill("Mica, ropa usada");
  await page.getByRole("button", { name: "Crear invitación" }).click();
  const link = page.getByTestId("link-invitacion");
  await expect(link).toContainText("/invitacion/");
  await page.getByRole("button", { name: "Copiar link" }).click();
  await expect(page.getByText("Link copiado")).toBeVisible();
  const fila = page.getByRole("listitem").filter({ hasText: "Mica, ropa usada" });
  await expect(fila.getByText("Pendiente")).toBeVisible();
  await fila.getByRole("button", { name: "Anular" }).click();
  await expect(fila.getByText("Anulada")).toBeVisible();
});
