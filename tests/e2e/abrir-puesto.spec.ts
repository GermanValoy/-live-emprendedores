import { expect, type Page, test } from "@playwright/test";
import { borrarUsuarioPrueba, clienteAdmin, crearUsuarioPrueba, type UsuarioPrueba } from "../helpers/usuario-prueba";
import { borrarFotosDeTienda, crearInvitacionPrueba, handleAleatorio, hacerAdmin } from "../helpers/tiendas-prueba";
import { elegirFoto } from "./fotos";
import { cookiesDeSesion } from "./sesion";

let admin: UsuarioPrueba;
const creadas: UsuarioPrueba[] = [];

test.beforeAll(async () => {
  admin = await crearUsuarioPrueba({ nombre: "Admin Abrir" });
  await hacerAdmin(admin.id);
});

test.afterAll(async () => {
  for (const u of creadas) {
    const { data } = await clienteAdmin().from("stores").select("id").eq("owner_id", u.id).maybeSingle();
    if (data) await borrarFotosDeTienda(data.id as string);
    await borrarUsuarioPrueba(u.id);
  }
  if (admin) await borrarUsuarioPrueba(admin.id);
});

async function nuevaFeriante(nombre: string) {
  const u = await crearUsuarioPrueba({ nombre });
  creadas.push(u);
  return u;
}

async function completarPaso1(page: Page, handle: string) {
  await page.getByLabel("Nombre del puesto").fill("La Ropería de Mica");
  await page.getByLabel("@usuario").fill(handle);
  await page.getByLabel("¿Qué vendés?").fill("Ropa usada");
  await page.getByLabel("Zona o barrio").fill("Yerba Buena");
  await page.getByRole("button", { name: "Seguir" }).click();
}

const alerta = (page: Page, texto: string) => page.getByRole("alert").filter({ hasText: texto });

test("sin sesión invita a entrar y vuelve al mismo link", async ({ page }) => {
  const token = await crearInvitacionPrueba(admin.id);
  await page.goto(`/invitacion/${token}`);
  await expect(page.getByText("Te invitaron a abrir tu puesto en Tu Feria Live")).toBeVisible();
  const pedido = page.waitForRequest((r) => r.url().includes("/auth/v1/authorize?provider=google"));
  await page.getByRole("button", { name: "Entrar con Google" }).click();
  expect(decodeURIComponent(decodeURIComponent((await pedido).url()))).toContain(`next=/invitacion/${token}`);
});

test("recorrido completo: 4 pasos y la tienda queda lista y pública", async ({ page, context }) => {
  const mica = await nuevaFeriante("Mica Abre");
  const token = await crearInvitacionPrueba(admin.id);
  await context.addCookies(await cookiesDeSesion(mica.sesion));
  await page.goto(`/invitacion/${token}`);
  const handle = handleAleatorio("mica");

  await expect(page.getByText("Paso 1 de 4")).toBeVisible();
  await elegirFoto(page, "Foto del puesto", "tests/e2e/fixtures/foto-de-costado.jpg");
  await completarPaso1(page, handle);

  await expect(page.getByText("Paso 2 de 4")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Alias").fill("mica.ropa.yb");
  await page.getByLabel("Titular").fill("Micaela Díaz");
  await page.getByRole("button", { name: "Seguir" }).click();

  await expect(page.getByText("Paso 3 de 4")).toBeVisible();
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(alerta(page, "Elegí al menos una forma de entrega.")).toBeVisible();
  await page.getByLabel("Retiro en mi domicilio").check();
  await page.getByLabel("Dirección").fill("Av. Aconquija 1234");
  await page.getByRole("button", { name: "Seguir" }).click();

  await expect(page.getByText("Paso 4 de 4")).toBeVisible();
  await page.getByLabel("Nombre").fill("Vestido azul");
  await page.getByLabel("Precio").fill("8.000");
  await page.getByLabel("Cantidad").fill("1");
  await page.getByRole("button", { name: "Guardar y terminar" }).click();

  await expect(page).toHaveURL("/mi-puesto?listo=1", { timeout: 30_000 });
  await expect(page.getByText("¡Tu puesto está listo!")).toBeVisible();

  await page.goto(`/invitacion/${token}`);
  await expect(page.getByText("Ya tenés tu puesto.")).toBeVisible();
});

test("si cierra en el paso 3, al volver retoma ahí", async ({ page, context }) => {
  const ana = await nuevaFeriante("Ana Retoma");
  const token = await crearInvitacionPrueba(admin.id);
  await context.addCookies(await cookiesDeSesion(ana.sesion));
  await page.goto(`/invitacion/${token}`);
  await completarPaso1(page, handleAleatorio("ana"));
  await expect(page.getByText("Paso 2 de 4")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Alias").fill("ana.dulces");
  await page.getByLabel("Titular").fill("Ana Pérez");
  await page.getByRole("button", { name: "Seguir" }).click();
  await expect(page.getByText("Paso 3 de 4")).toBeVisible();

  await page.goto("/mi-puesto");
  await page.getByRole("link", { name: "Seguir armando" }).click();
  await expect(page.getByText("Paso 3 de 4")).toBeVisible();
  await expect(page.getByRole("button", { name: "Lo cargo después" })).toHaveCount(0);
});

test("mensajes de invitación vencida, usada, inválida y @usuario tomado", async ({ page, context }) => {
  const beto = await nuevaFeriante("Beto Mensajes");
  await context.addCookies(await cookiesDeSesion(beto.sesion));
  await page.goto(`/invitacion/${await crearInvitacionPrueba(admin.id, { venceEnDias: -1 })}`);
  await expect(page.getByText("Esta invitación venció. Pedile una nueva a Tu Feria Live.")).toBeVisible();
  await page.goto("/invitacion/no-existe-este-link-de-invitacion-xx");
  await expect(page.getByText("Esta invitación no es válida.")).toBeVisible();

  const tomado = handleAleatorio("tomado");
  const otra = await nuevaFeriante("Otra Tomado");
  const tokenOtra = await crearInvitacionPrueba(admin.id);
  await otra.cliente.rpc("canjear_invitacion", { p_token: tokenOtra, p_handle: tomado, p_name: "Otra", p_category: "Ropa", p_zone: "Centro" });

  const token = await crearInvitacionPrueba(admin.id);
  await page.goto(`/invitacion/${token}`);
  await completarPaso1(page, tomado);
  await expect(alerta(page, `@${tomado} ya está en uso. Probá con otro.`)).toBeVisible();

  await page.goto(`/invitacion/${tokenOtra}`);
  await expect(page.getByText("Esta invitación ya se usó.")).toBeVisible();
});
