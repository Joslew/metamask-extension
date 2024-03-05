import { Infer, Struct, object, string, coerce} from 'superstruct';

export type Unique<Element extends Struct<any>> = (
  struct: Struct<Infer<Element>[], Infer<Element>>,
  eq?: (a: Infer<Element>, b: Infer<Element>) => boolean,
) => Struct<Infer<Element>[], Infer<Element>>;

interface CopyAssetStruct {
  src: string;
  dest: string;
}

const ExclusiveIncludeAssetStruct = coerce(
  object({ exclusiveInclude: string() }),
  string(),
  (exclusiveInclude) => ({ exclusiveInclude }),
);
export type AssetStruct = CopyAssetStruct & ExclusiveIncludeAssetStruct;

