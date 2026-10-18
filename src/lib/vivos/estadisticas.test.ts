import { describe, expect, it } from "vitest";
import { leerMuestra } from "./estadisticas";

const PAR = { type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 0.08 };

describe("leerMuestra", () => {
  it("mirar", () => {
    const reporte = [
      { type: "inbound-rtp", kind: "audio", jitterBufferDelay: 99, jitterBufferEmittedCount: 1 },
      { type: "inbound-rtp", kind: "video", frameWidth: 1280, frameHeight: 720, framesPerSecond: 30, framesDecoded: 900, jitterBufferDelay: 6, jitterBufferEmittedCount: 60 },
      { type: "candidate-pair", state: "failed", nominated: false, currentRoundTripTime: 5 },
      PAR,
    ];
    expect(leerMuestra(reporte, "mirar")).toEqual({ atrasoMs: 140, ancho: 1280, alto: 720, fps: 30, cuadros: 900 });
  });

  it("transmitir", () => {
    const reporte = [
      { type: "outbound-rtp", kind: "video", frameWidth: 640, frameHeight: 480, framesPerSecond: 24, framesEncoded: 500 },
      PAR,
    ];
    expect(leerMuestra(reporte, "transmitir")).toEqual({ atrasoMs: 40, ancho: 640, alto: 480, fps: 24, cuadros: 500 });
  });

  it("sin datos", () => {
    expect(leerMuestra([], "mirar")).toEqual({ atrasoMs: null, ancho: null, alto: null, fps: null, cuadros: null });
  });
});
