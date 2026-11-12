import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

type SpecName = 'public' | 'device';

interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
  components: Record<string, unknown>;
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);

export function loadSpec(name: SpecName): OpenApiDocument {
  const path = join(__dirname, '../../packages/contracts/openapi', `${name}.yaml`);
  return parse(readFileSync(path, 'utf8')) as OpenApiDocument;
}

for (const name of ['public', 'device'] as const) {
  ajv.addSchema({ $id: name, components: loadSpec(name).components });
}

const cache = new Map<string, ValidateFunction>();

export function assertMatchesSchema(spec: SpecName, schema: string, value: unknown): void {
  const key = `${spec}#/components/schemas/${schema}`;
  let validate = cache.get(key);
  if (!validate) {
    validate = ajv.compile({ $ref: key });
    cache.set(key, validate);
  }
  if (!validate(value)) {
    throw new Error(`${spec} ${schema} mismatch: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(value, null, 2)}`);
  }
}
