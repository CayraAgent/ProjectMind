import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const paths = process.argv.slice(2).map((path) => resolve(path));
if (paths.length !== 2) throw new Error("Usage: node scripts/compare-packages.mjs <first.tgz> <second.tgz>");
const archives = await Promise.all(paths.map((path) => readFile(path)));
const hashes = archives.map((value) => createHash("sha256").update(value).digest("hex"));
if (hashes[0] !== hashes[1]) throw new Error(`Package archives are not reproducible: ${hashes[0]} != ${hashes[1]}`);
console.log(`Reproducible package SHA-256: ${hashes[0]}`);
