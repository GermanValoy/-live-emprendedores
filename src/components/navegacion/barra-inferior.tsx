"use client";

import { Heart, Home, ShoppingBag, Store, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BarraInferior({ esFeriante }: { esFeriante: boolean }) {
  const ruta = usePathname();
  const items = [
    { href: "/", texto: "Inicio", Icono: Home },
    esFeriante
      ? { href: "/mi-puesto", texto: "Mi puesto", Icono: Store }
      : { href: "/seguidos", texto: "Seguidos", Icono: Heart },
    { href: "/mis-compras", texto: "Mis compras", Icono: ShoppingBag },
    { href: "/cuenta", texto: "Cuenta", Icono: User },
  ];
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map(({ href, texto, Icono }) => {
          const activo = href === "/" ? ruta === "/" : ruta.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={activo ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
                  activo ? "font-bold text-primary" : "text-muted-foreground"
                }`}
              >
                <Icono aria-hidden="true" className="size-5" />
                {texto}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
