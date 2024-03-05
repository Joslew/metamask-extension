import fs from 'fs';
import AssertionError from 'assert';
import path from 'path';
import yaml from 'js-yaml';
import uniq from 'lodash/uniq';
import uniqWith from 'lodash/uniqWith';
import { Infer, Struct } from 'superstruct';

import {
  object,
  string,
  record,
  optional,
  array,
  refine,
  any,
  boolean,
  coerce,
  union,
  unknown,
  validate,
  nullable,
  never,
  literal,
} from 'superstruct';

import { Unique, AssetStruct } from './build-config.type';
const BUILDS_YML_PATH = path.resolve('./builds.yml');

let cachedBuildTypes = null;

const unique: Unique<any> = (struct, eq) =>
  // Refined type using superstruct
  refine(struct, 'unique', (value) => {
    if (uniqWith(value, eq).length === value.length) {
      return true;
    }
    return 'Array contains duplicated values';
  });

const EnvDefinitionStruct = coerce(
  // Object type using Record and unknown
  object({ key: string(), value: unknown() }),
  // Refine function to further validate
  refine(record(string(), any()), 'Env variable declaration', (value) => {
    if (Object.keys(value).length !== 1) {
      return 'Declaration should have only one property, the name';
    }
    return true;
  }),
  // Coerce function to extract key and value
  (value) => ({ key: Object.keys(value)[0], value: Object.values(value)[0] }),
);

const EnvArrayStruct = unique(
  // Array type using union
  array(union([string(), EnvDefinitionStruct])),
  // Equality function for unique
  (a, b) => {
    const keyA = typeof a === 'string' ? a : a.key;
    const keyB = typeof b === 'string' ? b : b.key;
    return keyA === keyB;
  },
);

const BuildTypeStruct = object({
  features: optional(unique(array(string()))),
  env: optional(EnvArrayStruct),
  isPrerelease: optional(boolean()),
  manifestOverrides: union([string(), literal(false)]),
  buildNameOverride: union([string(), literal(false)]),
});

const ExclusiveIncludeAssetStruct = coerce(
  object({ exclusiveInclude: string() }),
  string(),
  (exclusiveInclude) => ({ exclusiveInclude }),
);

interface CopyAssetStruct {
  src: string;
  dest: string;
}

interface ExclusiveIncludeAssetStruct {
  exclusiveInclude: string;
}

type AssetStruct = CopyAssetStruct & ExclusiveIncludeAssetStruct;

const FeatureStruct = object({
  env: optional(EnvArrayStruct),
  // TODO(ritave): Check if the paths exist
  assets: optional(AssetStruct),
});

const FeaturesStruct = refine(
  record(
    string(),
    coerce(FeatureStruct, nullable(never()), () => ({})),
  ),
  'feature definitions',
  function* (value) {
    let isValid = true;

    const definitions = new Set();

    for (const feature of Object.values(value)) {
      for (const env of feature?.env ?? []) {
        if (typeof env !== 'string') {
          if (definitions.has(env.key)) {
            isValid = false;
            yield `Multiple defined features have a definition of "${env}" env variable, resulting in a conflict`;
          }
          definitions.add(env.key);
        }
      }
    }
    return isValid;
  },
);

const BuildTypesStruct = refine(
  object({
    default: string(),
    buildTypes: record(string(), BuildTypeStruct),
    features: FeaturesStruct,
    env: EnvArrayStruct,
  }),
  'BuildTypes',
  (value) => {
    if (!Object.keys(value.buildTypes).includes(value.default)) {
      return `Default build type "${value.default}" does not exist in builds declarations`;
    }
    return true;
  },
);

/**
 * Loads definitions of build type and what they are composed of.
 *
 * @returns {import('superstruct').Infer<typeof BuildTypesStruct>}
 */
function loadBuildTypesConfig() {
  if (cachedBuildTypes !== null) {
    return cachedBuildTypes;
  }
  const buildsData = yaml.load(fs.readFileSync(BUILDS_YML_PATH, 'utf8'), {
    json: true,
  });
  const [err, result] = validate(buildsData, BuildTypesStruct, {
    coerce: true,
  });
  if (err !== undefined) {
    throw new AssertionError({
      message: constructFailureMessage(err),
    });
  }
  cachedBuildTypes = result;
  return buildsData;
}

/**
 * Creates a user readable error message about parse failure.
 *
 * @param {import('superstruct').StructError} structError
 * @returns {string}
 */
function constructFailureMessage(structError) {
  return `Failed to parse builds.yml
  -> ${structError
    .failures()
    .map(
      (failure) =>
        `${failure.message} (${BUILDS_YML_PATH}:.${failure.path.join('/')})`,
    )
    .join('\n  -> ')}
`;
}

module.exports = { loadBuildTypesConfig };
