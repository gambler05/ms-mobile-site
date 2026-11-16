import { describe, expect, it } from "vitest";
import { makePng } from "../../e2e/stubs/png.js";
import { AppError } from "../src/lib/errors.js";
import { decodeAndValidateImage, describeAspectRatio, sniffImageMime, validateImageBuffer } from "../src/lib/images.js";
import { dataUrl } from "./helpers.js";

describe("validation des images importées", () => {
  it("reconnaît PNG, JPEG et WEBP par leur contenu réel", () => {
    expect(sniffImageMime(makePng(20, 20))).toBe("image/png");
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]);
    expect(sniffImageMime(webp)).toBe("image/webp");
    expect(sniffImageMime(Buffer.from("GIF89a......"))).toBeNull();
    expect(sniffImageMime(Buffer.from("<svg></svg>"))).toBeNull();
  });

  it("décode une data URL et mesure les dimensions", () => {
    const img = decodeAndValidateImage(dataUrl(makePng(320, 180)));
    expect(img).toMatchObject({ mime: "image/png", width: 320, height: 180 });
  });

  it("refuse un faux fichier image avec un message clair en français", () => {
    const fake = dataUrl(Buffer.from("ceci n'est pas une image du tout"));
    expect(() => decodeAndValidateImage(fake)).toThrowError(/n'est pas au format PNG, JPG\/JPEG ou WEBP/);
  });

  it("refuse un type déclaré qui ne correspond pas au contenu", () => {
    const err = (() => {
      try {
        decodeAndValidateImage(dataUrl(makePng(30, 30), "image/jpeg"));
      } catch (e) {
        return e as AppError;
      }
    })();
    expect(err).toBeInstanceOf(AppError);
    expect(err?.status).toBe(400);
    expect(err?.message).toContain("déclarée comme image/jpeg");
  });

  it("refuse les images trop petites, vides ou trop lourdes", () => {
    expect(() => validateImageBuffer(makePng(8, 8))).toThrowError(/trop petite/);
    expect(() => validateImageBuffer(Buffer.alloc(0))).toThrowError(/vide/);
    const huge = Buffer.concat([makePng(20, 20), Buffer.alloc(21 * 1024 * 1024)]);
    expect(() => validateImageBuffer(huge)).toThrowError(/limite est de 20 Mo/);
  });

  it("refuse un PNG tronqué (corrompu)", () => {
    const png = makePng(40, 40);
    expect(() => validateImageBuffer(png.subarray(0, 12))).toThrowError(/corrompue|incomplète/);
  });

  it("calcule le rapport largeur/hauteur exact et le format standard le plus proche", () => {
    expect(describeAspectRatio(1920, 1080)).toEqual({ exact: "16:9", nearest: "16:9", orientation: "paysage" });
    expect(describeAspectRatio(1080, 1350)).toEqual({ exact: "4:5", nearest: "4:5", orientation: "portrait" });
    expect(describeAspectRatio(1000, 1000).orientation).toBe("carré");
    expect(describeAspectRatio(1366, 768).nearest).toBe("16:9");
  });
});
