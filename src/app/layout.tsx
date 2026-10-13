import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { AvisoSinConexion } from "@/components/aviso-sin-conexion";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Tu Feria Live",
  description: "Vendé en vivo, sin que nadie te corte",
  applicationName: "Tu Feria Live",
  appleWebApp: { capable: true, title: "Tu Feria Live", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#d1106d",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={outfit.variable}>
      <body>
        <AvisoSinConexion />
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
