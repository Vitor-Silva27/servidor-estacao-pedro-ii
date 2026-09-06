import path from "node:path";
import { env } from "./env";

export const UPLOADS_DIR = path.resolve(process.cwd(), env.UPLOADS_DIR);
