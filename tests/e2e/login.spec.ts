import { expect, test } from "@playwright/test";
import {
  borrarUsuarioPrueba,
  crearUsuarioPrueba,
  type UsuarioPrueba,
} from "../helpers/usuario-prueba";
import { cookiesDeSesion } from "./sesion";

test.describe("sin sesión", () => {
  test("el inicio ofrece entrar con Google", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Entrar con Google" })).toBeVisible();
  });

  test("el botón lleva al login de Google vía Supabase", async ({ page }) => {
    await page.goto("/");
    const pedido = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize?provider=google"));
    await page.getByRole("button", { name: "Entrar con Google" }).click();
    await pedido;
  });

  test("la pantalla de cuenta manda al inicio", async ({ page }) => {
    await page.goto("/cuenta");
    await expect(page).toHaveURL("/");
  });

  test("si el retorno de Google falla, muestra un mensaje amable", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied");
    await expect(page).toHaveURL("/?error=login");
    await expect(
      page.getByRole("alert").filter({ hasText: "No pudimos hacerte entrar. Probá de nuevo." }),
    ).toBeVisible();
  });

  test("una cookie de sesión corrupta se trata como sin sesión", async ({ page, context }) => {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
    await context.addCookies([
      { name: `sb-${ref}-auth-token`, value: "basura", domain: "localhost", path: "/", sameSite: "Lax" },
    ]);
    await page.goto("/cuenta");
    await expect(page).toHaveURL("/");
  });
});

test.describe("con sesión", () => {
  let usuaria: UsuarioPrueba;

  test.beforeAll(async () => {
    usuaria = await crearUsuarioPrueba({ nombre: "Sofía Prueba" });
  });

  test.afterAll(async () => {
    if (usuaria) await borrarUsuarioPrueba(usuaria.id);
  });

  test("ve su nombre, su inicial y puede salir", async ({ page, context }) => {
    await context.addCookies(await cookiesDeSesion(usuaria.sesion));
    await page.goto("/cuenta");
    await expect(page.getByRole("heading", { name: "Hola, Sofía Prueba" })).toBeVisible();
    await expect(page.getByText("S", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Salir" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/cuenta");
    await expect(page).toHaveURL("/");
  });
});
