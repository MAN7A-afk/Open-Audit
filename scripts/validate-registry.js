#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const Ajv = require("ajv");

const ROOT = path.resolve(__dirname, "..");

const schemaPath = path.join(ROOT, "lib/translator/registry.schema.json");
const registryPath = path.join(ROOT, "lib/translator/registry.json");

let schema, registry;
try {
  schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
} catch (err) {
  console.error("Failed to parse schema file:", err.message);
  process.exit(1);
}

try {
  registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
} catch (err) {
  console.error("Failed to parse registry file:", err.message);
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);
const valid = validate(registry);

if (!valid) {
  console.error("Registry validation FAILED");
  for (const err of validate.errors) {
    console.error("  -", err.instancePath || "(root)", err.message);
  }
  process.exit(1);
}

console.log("Registry validated successfully against schema.");
