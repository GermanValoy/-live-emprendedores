import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

export const metadata: Metadata = {
  title: "Tu Feria Live",
  description: "Vendé en vivo, sin que nadie te corte",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={outfit.variable}>
      <body>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
