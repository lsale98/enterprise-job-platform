import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = new URL("../src/styles/", import.meta.url);
const destination = new URL("../dist/styles/", import.meta.url);

mkdirSync(fileURLToPath(destination), { recursive: true });

cpSync(fileURLToPath(source), fileURLToPath(destination), {
  recursive: true,
  force: true,
});
