import fs from "node:fs/promises";
import path from "node:path";

/**
 * Document JSON persistant sur disque.
 * - écritures sérialisées (une à la fois) et atomiques (fichier temporaire + renommage) ;
 * - copie de la version précédente dans <fichier>.bak ;
 * - un fichier corrompu est mis de côté (<fichier>.corrompu-<date>) au lieu d'être écrasé.
 */
export class JsonFile<T> {
  private cache: T | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly filePath: string,
    private readonly defaults: () => T,
    private readonly normalize: (raw: unknown) => T = (raw) => raw as T,
    private readonly mode = 0o644,
  ) {}

  async read(): Promise<T> {
    if (this.cache) return this.cache;
    this.cache = await this.load();
    return this.cache;
  }

  /** Applique une modification et l'enregistre ; retourne la valeur renvoyée par `fn`. */
  update<R>(fn: (doc: T) => R | Promise<R>): Promise<R> {
    const run = async () => {
      const doc = await this.read();
      const result = await fn(doc);
      await this.persist(doc);
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Remplace entièrement le document (utilisé par la restauration). */
  replace(doc: T): Promise<void> {
    return this.update((current) => {
      for (const key of Object.keys(current as object)) delete (current as Record<string, unknown>)[key];
      Object.assign(current as object, doc);
    });
  }

  /** Oublie le cache mémoire : la prochaine lecture relira le disque. */
  invalidate(): void {
    this.cache = null;
  }

  private async load(): Promise<T> {
    let text: string;
    try {
      text = await fs.readFile(this.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return this.defaults();
      throw err;
    }
    try {
      return this.normalize(JSON.parse(text));
    } catch {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await fs.rename(this.filePath, `${this.filePath}.corrompu-${stamp}`).catch(() => undefined);
      try {
        const bak = await fs.readFile(`${this.filePath}.bak`, "utf8");
        return this.normalize(JSON.parse(bak));
      } catch {
        return this.defaults();
      }
    }
  }

  private async persist(doc: T): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(doc, null, 2), { encoding: "utf8", mode: this.mode });
    await fs.copyFile(this.filePath, `${this.filePath}.bak`).catch(() => undefined);
    await fs.rename(tmp, this.filePath);
  }
}
