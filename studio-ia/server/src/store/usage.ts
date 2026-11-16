import path from "node:path";
import { AppError } from "../lib/errors.js";
import { JsonFile } from "./json-file.js";

interface UsageDoc {
  date: string;
  images: number;
  byEngine: Record<string, number>;
}

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Compteur quotidien d'images générées, avec plafond optionnel (MAX_IMAGES_PER_DAY)
 * pour éviter une facture surprise avec les moteurs payants.
 */
export class UsageStore {
  private readonly file: JsonFile<UsageDoc>;

  constructor(
    dataDir: string,
    readonly maxImagesPerDay: number,
  ) {
    this.file = new JsonFile(path.join(dataDir, "usage.json"), () => ({ date: today(), images: 0, byEngine: {} }));
  }

  async current(): Promise<UsageDoc> {
    const doc = await this.file.read();
    return doc.date === today() ? doc : { date: today(), images: 0, byEngine: {} };
  }

  /** Vérifie que `count` images peuvent encore être générées aujourd'hui. */
  async assertCanGenerate(count: number): Promise<void> {
    if (!this.maxImagesPerDay) return;
    const { images } = await this.current();
    if (images + count > this.maxImagesPerDay) {
      throw new AppError(
        429,
        "plafond_quotidien",
        `Plafond quotidien atteint : ${images} image(s) générée(s) sur ${this.maxImagesPerDay} autorisées aujourd'hui.`,
        "Ce plafond protège contre les dépenses imprévues. Modifiez MAX_IMAGES_PER_DAY dans le fichier .env.",
      );
    }
  }

  async record(engineId: string, count: number): Promise<void> {
    await this.file.update((doc) => {
      if (doc.date !== today()) {
        doc.date = today();
        doc.images = 0;
        doc.byEngine = {};
      }
      doc.images += count;
      doc.byEngine[engineId] = (doc.byEngine[engineId] ?? 0) + count;
    });
  }
}
