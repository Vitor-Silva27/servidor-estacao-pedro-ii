import multer from "multer";
import { ValidationError } from "../errors/AppError";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionFor(mimeType: string): string | undefined {
  return EXTENSION_BY_MIME[mimeType];
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (extensionFor(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new ValidationError([{ path: "file", message: "Formato inválido. Use JPEG, PNG ou WebP" }]));
  },
});

/** Lê um único arquivo do campo multipart "file" e coloca em req.file (buffer em memória). */
export const uploadImage = upload.single("file");
