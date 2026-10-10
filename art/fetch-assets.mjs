// Downloads the CC0 sources for the dream house into art/cache/ (not in git):
//   Poly Haven glTF models (1k textures) + one sunset HDRI, ambientCG 1K-JPG materials.
// Usage: node art/fetch-assets.mjs     (skips files that already exist)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'cache');
const UA = { 'User-Agent': 'ayish-birthday-asset-fetch/1.0' };

export const MODELS = [
  'mid_century_lounge_chair', 'modern_arm_chair_01', 'modern_coffee_table_01', 'modern_coffee_table_02',
  'modern_wooden_cabinet', 'side_table_01', 'wooden_display_shelves_01',
  'potted_plant_01', 'potted_plant_02', 'potted_plant_04', 'calathea_orbifolia_01', 'pachira_aquatica_01', 'anthurium_botany_01',
  'ceramic_vase_01', 'ceramic_vase_03', 'book_encyclopedia_set_01', 'tea_set_01', 'wooden_bowl_01', 'wicker_basket_01',
  'rubber_duck_toy', 'modern_ceiling_lamp_01', 'desk_lamp_arm_01', 'stone_fire_pit', 'wooden_lantern_01', 'planter_box_01',
  'jacaranda_tree', 'island_tree_01', 'island_tree_02', 'tree_small_02', 'shrub_01', 'shrub_02', 'fern_02',
  'boulder_01', 'rock_moss_set_01', 'grass_medium_01', 'moss_01'
];
export const HDRI = 'kloppenheim_06_puresky';
export const MATERIALS = [
  'WoodFloor051', 'Plaster003', 'Wood092', 'Wood049', 'Wood051', 'Plaster001', 'Concrete044D', 'Concrete034', 'Fabric030', 'Fabric061',
  'Leather037', 'Marble012', 'Travertine009', 'Tiles107', 'Gravel023', 'Gravel043', 'PavingStones146', 'Grass004',
  'Ground037', 'Rock064', 'Terrazzo013'
];

async function get(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}
async function save(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const r = await get(url);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return true;
}

async function model(id) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const g = files.gltf?.['1k']?.gltf;
  if (!g) return console.warn('no gltf for', id);
  const dir = path.join(ROOT, 'models', id);
  await save(g.url, path.join(dir, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include)) await save(f.url, path.join(dir, rel));
  console.log('model', id);
}

async function hdri(id) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  await save(files.hdri['2k'].hdr.url, path.join(ROOT, 'hdri', `${id}_2k.hdr`));
  console.log('hdri', id);
}

async function material(id) {
  const dir = path.join(ROOT, 'materials', id);
  if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.jpg'))) return;
  const zip = path.join(ROOT, 'materials', `${id}.zip`);
  await save(`https://ambientcg.com/get?file=${id}_1K-JPG.zip`, zip);
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  fs.rmSync(zip);
  console.log('material', id);
}

for (const id of MODELS) await model(id);
await hdri(HDRI);
for (const id of MATERIALS) await material(id);
console.log('done');
