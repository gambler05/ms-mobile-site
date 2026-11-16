import { describe, expect, it } from "vitest";
import { applyStyle } from "../../../server/src/services/styles";
import { titleFrom } from "../../../server/src/services/studio";
import { aspectInfo, checkFileBasics, extractPalette, rgbToHex, sniffMime } from "./image";

function pixels(colors: Array<[number, number, number, number]>, repeat: number[]): Uint8ClampedArray {
  const out: number[] = [];
  colors.forEach((c, i) => {
    for (let n = 0; n < repeat[i]; n++) out.push(...c);
  });
  return new Uint8ClampedArray(out);
}

describe("traitement d'image côté navigateur", () => {
  it("extrait la palette dominante, triée par importance, en ignorant la transparence", () => {
    const px = pixels(
      [
        [255, 0, 0, 255],
        [0, 0, 255, 255],
        [0, 255, 0, 0],
      ],
      [300, 100, 500],
    );
    expect(extractPalette(px, 4)).toEqual(["#ff0000", "#0000ff"]);
  });

  it("est déterministe", () => {
    const px = new Uint8ClampedArray(Array.from({ length: 4096 * 4 }, (_, i) => (i % 4 === 3 ? 255 : (i * 37) % 256)));
    expect(extractPalette(px)).toEqual(extractPalette(px));
  });

  it("convertit en hexadécimal et calcule le format", () => {
    expect(rgbToHex([255, 128.4, 0])).toBe("#ff8000");
    expect(aspectInfo(1080, 1920)).toEqual({ exact: "9:16", nearest: "9:16", orientation: "portrait" });
    expect(aspectInfo(3000, 2000).nearest).toBe("3:2");
  });

  it("vérifie extension, poids et signature des fichiers", () => {
    expect(() => checkFileBasics({ name: "photo.gif", size: 10 })).toThrow(/Formats acceptés/);
    expect(() => checkFileBasics({ name: "photo.png", size: 25 * 1024 * 1024 })).toThrow(/20 Mo/);
    expect(() => checkFileBasics({ name: "PHOTO.JPEG", size: 1000 })).not.toThrow();
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("hello world!"))).toBeNull();
  });
});

describe("composition des prompts", () => {
  it("ajoute le modificateur de style sans ponctuation en double", () => {
    expect(applyStyle("un renard. ", "aucun")).toBe("un renard");
    expect(applyStyle("un renard,", "anime")).toMatch(/^un renard, anime style/);
  });

  it("produit des titres courts", () => {
    expect(titleFrom("Un   renard")).toBe("Un renard");
    const long = titleFrom("Un renard roux au pelage détaillé se tient au milieu d'une forêt dense à l'aube avec des rayons de soleil");
    expect(long.length).toBeLessThanOrEqual(71);
    expect(long.endsWith("…")).toBe(true);
  });
});
