const LINEA_1 = "¡Pronto";
const LINEA_2 = "arrancamos!";

// Posición de cada lamparita sobre la guirnalda (izquierda en %, altura en px).
const LAMPARAS = [
  { izquierda: "8%", arriba: 12 },
  { izquierda: "26%", arriba: 22 },
  { izquierda: "44%", arriba: 14 },
  { izquierda: "62%", arriba: 8 },
  { izquierda: "80%", arriba: 12 },
] as const;

function Letras({ texto, desde }: { texto: string; desde: number }) {
  return (
    <>
      {Array.from(texto).map((letra, i) => (
        <span
          key={i}
          className="espera-letra"
          style={{ animationDelay: `${(desde + i * 0.05).toFixed(2)}s` }}
        >
          {letra}
        </span>
      ))}
    </>
  );
}

/** Espera del vivo: el puesto de feria con toldo, guirnalda y mostrador. Solo CSS. */
export function EsperaFeria({ nombre }: { nombre: string }) {
  return (
    <div className="espera-escena">
      <div className="espera-toldo" data-testid="toldo" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} />
        ))}
      </div>

      <div className="espera-guirnalda" aria-hidden="true">
        <svg viewBox="0 0 220 40" preserveAspectRatio="none">
          <path d="M0 4 Q55 34 110 10 T220 4" stroke="#7a5a68" strokeWidth="1.5" fill="none" />
        </svg>
        {LAMPARAS.map((lampara, i) => (
          <span
            key={i}
            className="espera-lampara"
            style={{ left: lampara.izquierda, top: lampara.arriba, animationDelay: `${(i * 0.3).toFixed(1)}s` }}
          />
        ))}
      </div>

      <div className="espera-mostrador" aria-hidden="true" />

      <div className="espera-centro">
        <h2 className="espera-titulo">
          <span className="sr-only">¡Pronto arrancamos!</span>
          <span aria-hidden="true" className="block">
            <Letras texto={LINEA_1} desde={0} />
          </span>
          <span aria-hidden="true" className="block text-[1.25rem]">
            <Letras texto={LINEA_2} desde={0.4} />
          </span>
        </h2>
        <p className="espera-cartel">Abrimos el puesto en un ratito</p>
      </div>

      <p className="espera-pie">Quedate acá: cuando {nombre} salga en vivo, se abre sola.</p>
    </div>
  );
}
