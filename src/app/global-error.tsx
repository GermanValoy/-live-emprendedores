"use client"; // Reemplaza a toda la página (incluido el layout), por eso trae su propio <html> y estilos mínimos

export default function ErrorGeneral({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="es-AR">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, color: "#20131c", background: "#ffffff" }}>
        <title>Tu Feria Live</title>
        <main style={{ maxWidth: 420, margin: "0 auto", padding: 24, minHeight: "60dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, margin: 0 }}>Algo no salió bien</h1>
          <p style={{ margin: 0, color: "#6b5560" }}>Puede ser la conexión. Revisá tu internet y probá de nuevo.</p>
          <button
            onClick={() => retry()}
            style={{ minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#b0135f", color: "#ffffff", fontSize: 16, fontWeight: 700 }}
          >
            Probar de nuevo
          </button>
        </main>
      </body>
    </html>
  );
}
