import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Storage } from "./storage";

export const UPLOADS_URL_PREFIX = "/uploads";

function toRelativePath(url: string) {
  return url.startsWith(`${UPLOADS_URL_PREFIX}/`) ? url.slice(UPLOADS_URL_PREFIX.length + 1) : url;
}

export function createLocalStorage(rootDir: string): Storage {
  return {
    async save(dir, ext, data) {
      const fileName = `${randomUUID()}.${ext}`;
      const target = path.join(rootDir, dir);
      await mkdir(target, { recursive: true });
      await writeFile(path.join(target, fileName), data);
      return `${UPLOADS_URL_PREFIX}/${dir}/${fileName}`;
    },

    async remove(url) {
      await rm(path.join(rootDir, toRelativePath(url)), { force: true });
    },

    async removeDir(dir) {
      await rm(path.join(rootDir, dir), { recursive: true, force: true });
    },
  };
}
