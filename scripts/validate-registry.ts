import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function main(): void {
  const schemaPath = path.join(ROOT, "lib", "translator", "registry.schema.json");
  const dataPath = path.join(ROOT, "lib", "translator", "registry.json");

  if (!fs.existsSync(schemaPath)) {
    console.error("ERROR: Schema file not found:", schemaPath);
    process.exit(1);
  }
  if (!fs.existsSync(dataPath)) {
    console.error("ERROR: Registry file not found:", dataPath);
    process.exit(1);
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
  const registry = JSON.parse(fs.readFileSync(dataPath, "utf-8"));

  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(schema);

  let valid: boolean;

  if (Array.isArray(registry)) {
    valid = registry.every(function (entry: unknown, index: number): boolean {
      const ok = validate(entry);
      if (!ok) {
        console.error(`\nValidation error at index ${index}:`);
        for (const err of validate.errors ?? []) {
          console.error(`  - ${err.instancePath} ${err.message}`);
        }
      }
      return ok;
    });
  } else {
    valid = !!validate(registry);
    if (!valid) {
      console.error("\nValidation error:");
      for (const err of validate.errors ?? []) {
        console.error(`  - ${err.instancePath} ${err.message}`);
      }
    }
  }

  if (!valid) {
    console.error("\nRegistry validation FAILED.");
    process.exit(1);
  }

  console.log("Registry validation passed.");
}

main();
