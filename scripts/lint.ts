import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["apps", "packages", "integrations", "scripts", "tests"];
const failures: string[] = [];

async function walk(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if ([".ts", ".js", ".mjs"].includes(extname(entry.name))) out.push(full);
  }
  return out;
}

for (const root of roots) {
  for (const file of await walk(root)) {
    const source = await readFile(file, "utf8");
    if (source.includes("\t")) failures.push(`${file}: contains tab indentation`);
    if (/[ \t]+$/m.test(source)) failures.push(`${file}: contains trailing whitespace`);
    if (!source.endsWith("\n")) failures.push(`${file}: missing final newline`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("lint: ok");
