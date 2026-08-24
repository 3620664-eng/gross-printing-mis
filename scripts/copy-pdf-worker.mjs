import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(scriptsDir);
const source = join(projectRoot, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const target = join(projectRoot, "public", "pdf.worker.min.mjs");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log("Prepared local PDF preview worker: public/pdf.worker.min.mjs");
