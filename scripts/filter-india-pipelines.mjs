// One-time filter: extract India-only pipeline routes from the GEM Global Gas
// Infrastructure Tracker geojson.
//
// Source file (ggit_map_latest.geojson, ~68 MB) is kept locally / gitignored.
// Output (public/india_pipelines.geojson) is committed and fetched at runtime.
//
// Usage: node scripts/filter-india-pipelines.mjs [path-to-source]

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve(process.argv[2] ?? 'src/Assets/ggit_map_latest.geojson');
const out = resolve('public/india_pipelines.geojson');

const fc = JSON.parse(readFileSync(src, 'utf8'));

// "India-exclusive": CountriesOrAreas is exactly India (drops IPI, TAPI and the
// other multi-country routes).
const features = fc.features.filter(
  (f) => (f.properties?.CountriesOrAreas ?? '').trim() === 'India',
);

const result = {
  type: 'FeatureCollection',
  name: 'india_pipelines',
  crs: fc.crs,
  features,
};

writeFileSync(out, JSON.stringify(result));
console.log(`${features.length} features -> ${out}`);
