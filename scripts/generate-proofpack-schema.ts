import { writeFile } from "node:fs/promises";
import { zodToJsonSchema } from "zod-to-json-schema";
import { proofPackSchema } from "../packages/core/src/schema.ts";

const schema = zodToJsonSchema(proofPackSchema, {
  name: "ProjectMindProofPackV1",
  target: "jsonSchema7",
  $refStrategy: "root",
});
const document = {
  $id: "https://github.com/CayraAgent/ProjectMind/blob/main/schemas/proofpack-v1.schema.json",
  ...schema,
};
await writeFile(new URL("../schemas/proofpack-v1.schema.json", import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
