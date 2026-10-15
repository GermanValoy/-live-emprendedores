import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { Suspense } from "react";
import { AvisoSinConexion } from "@/components/aviso-sin-conexion";
import { BarraInferior } from "@/components/navegacion/barra-inferior";
import { BarraSegunSesion } from "@/components/navegacion/barra-segun-sesion";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "Tu Feria Live",
  description: "Vendé en vivo, sin que nadie te corte",
  applicationName: "Tu Feria Live",
  appleWebApp: { capable: true, title: "Tu Feria Live", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#b0135f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={bricolage.variable}>
      <body>
        <AvisoSinConexion />
        <div className="pb-20">{children}</div>
        <Suspense fallback={<BarraInferior esFeriante={false} />}>
          <BarraSegunSesion />
        </Suspense>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
