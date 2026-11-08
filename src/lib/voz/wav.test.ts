import { describe, expect, it } from "vitest";
import { aWav } from "./wav";

describe("aWav", () => {
  it("arma un WAV de 16 kHz mono de 16 bits con el largo correcto para 1 s a 48 kHz", async () => {
    const wav = aWav(new Float32Array(48_000).fill(0.5), 48_000);
    const v = new DataView(await wav.arrayBuffer());
    const txt = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect(wav.type).toBe("audio/wav");
    expect(txt(0)).toBe("RIFF");
    expect(txt(8)).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(32_000);
    expect(v.byteLength).toBe(44 + 32_000);
    expect(v.getInt16(44, true)).toBeGreaterThan(16_000);
  });
});
