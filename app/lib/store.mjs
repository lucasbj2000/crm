import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { createInitialData, normalizeData } from "./domain.mjs";

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = createInitialData();
    this.writeQueue = Promise.resolve();
    this.revision = 0;
    this.lastSavedAt = 0;
    this.lastSnapshot = "";
  }

  async load() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.data = normalizeData(JSON.parse(await readFile(this.filePath, "utf8")));
      this.lastSnapshot = JSON.stringify(this.data);
      this.revision = 1;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        await rename(this.filePath, backup).catch(() => {});
      }
      this.data = createInitialData();
      await this.save();
      if (!this.revision) this.revision = 1;
    }
    return this.data;
  }

  async save() {
    // Persistencia compacta + deduplicación: evita reescribir toda la base si nada cambió.
    const snapshot = JSON.stringify(this.data);
    if (snapshot === this.lastSnapshot) return this.writeQueue;
    this.lastSnapshot = snapshot;
    this.revision += 1;
    this.lastSavedAt = Date.now();
    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => {
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, snapshot, { encoding: "utf8", mode: 0o600 });
      await rename(tempPath, this.filePath);
    });
    return this.writeQueue;
  }
}
