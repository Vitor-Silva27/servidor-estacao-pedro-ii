export type Storage = {
  /** Grava o arquivo em <dir>/<uuid>.<ext> e devolve a URL relativa, ex.: /uploads/attractions/abc/def.jpg */
  save(dir: string, ext: string, data: Buffer): Promise<string>;
  /** Apaga o arquivo apontado por uma URL devolvida por save. Ignora se não existir. */
  remove(url: string): Promise<void>;
  /** Apaga um diretório inteiro. Ignora se não existir. */
  removeDir(dir: string): Promise<void>;
};
