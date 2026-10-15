import { expect, test } from "@playwright/test";
import { borrarUsuarioPrueba, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { crearTiendaPrueba } from "../helpers/tiendas-prueba";
import { cookiesDeSesion } from "./sesion";

test("una compradora ve Inicio, Seguidos, Mis compras y Cuenta", async ({ page }) => {
  await page.goto("/mis-compras");
  const barra = page.getByRole("navigation", { name: "Navegación principal" });
  for (const texto of ["Inicio", "Seguidos", "Mis compras", "Cuenta"]) {
    await expect(barra.getByRole("link", { name: texto })).toBeVisible();
  }
  await expect(barra.getByRole("link", { name: "Mis compras" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Cuando ganes un código, lo vas a ver acá.")).toBeVisible();
});

test("Seguidos sin sesión invita a entrar y vuelve a Seguidos", async ({ page }) => {
  await page.goto("/seguidos");
  const pedido = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize?provider=google"));
  await page.getByRole("button", { name: "Entrar con Google" }).click();
  // El destino va codificado dentro de redirect_to, que a su vez va codificado: se decodifica dos veces.
  const url = decodeURIComponent(decodeURIComponent((await pedido).url()));
  expect(url).toContain("next=/seguidos");
});

test("Mi puesto sin sesión manda al inicio", async ({ page }) => {
  await page.goto("/mi-puesto");
  await expect(page).toHaveURL("/");
});

test.describe("con sesión", () => {
  let compradora: UsuarioPrueba;
  let feriante: UsuarioPrueba;

  test.beforeAll(async () => {
    [compradora, feriante] = await Promise.all([crearUsuarioPrueba({ nombre: "Compra Nav" }), crearUsuarioPrueba({ nombre: "Feria Nav" })]);
    await crearTiendaPrueba(feriante);
  });

  test.afterAll(async () => {
    await Promise.all([compradora, feriante].filter(Boolean).map((u) => borrarUsuarioPrueba(u.id)));
  });

  test("la feriante ve Mi puesto en lugar de Seguidos", async ({ page, context }) => {
    await context.addCookies(await cookiesDeSesion(feriante.sesion));
    await page.goto("/");
    const barra = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(barra.getByRole("link", { name: "Mi puesto" })).toBeVisible();
    await expect(barra.getByRole("link", { name: "Seguidos" })).toHaveCount(0);
    await barra.getByRole("link", { name: "Mi puesto" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Puesto de Prueba" })).toBeVisible();
  });

  test("una compradora sin tienda que entra a Mi puesto ve cómo pedir una invitación", async ({ page, context }) => {
    await context.addCookies(await cookiesDeSesion(compradora.sesion));
    await page.goto("/mi-puesto");
    await expect(page.getByText("Todavía no tenés un puesto.")).toBeVisible();
  });
});
