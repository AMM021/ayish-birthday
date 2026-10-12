# Third-party asset credits

The owner downloaded these tracks on 2026-10-11 into `public/media/music/` (`hub.mp3`, `challenge.mp3`, `letter.mp3`), re-encoded to 128 kbps MP3 for loading speed.

| Asset / filename | Creator | Source URL | License / terms | Attribution required (exact text) | Download date | Notes |
|---|---|---|---|---|---|---|
| `hub.mp3` — Japanese Aikoto Instrumental 9 | KOTO-JAPAN-SOUNDTRACK | https://pixabay.com/music/ambient-japanese-aikoto-instrumental-9-470508/ | Pixabay Content License; verify current terms on download | Courtesy credit: Music by KOTO-JAPAN-SOUNDTRACK from Pixabay | 2026-10-11 | Page describes this series as 100% instrumental / no vocals; preview before use. |
| `challenge.mp3` — Softer Version — Healing Anime 10 | KOTO-JAPAN-SOUNDTRACK | https://pixabay.com/music/ambient-softer-version-healing-anime-10-470676/ | Pixabay Content License; verify current terms on download | Courtesy credit: Music by KOTO-JAPAN-SOUNDTRACK from Pixabay | 2026-10-11 | Hopeful, slightly more forward instrumental; preview before use. |
| `letter.mp3` — Peaceful Ambient Background | samsabt | https://pixabay.com/music/ambient-peaceful-ambient-background-478782/ | Pixabay Content License; verify current terms on download | Courtesy credit: Music by samsabt from Pixabay | 2026-10-11 | Page describes deep ambient instrumental music with no vocals. |

The owner's personal photos are in `src/assets/pics/` (WebP, max 800 px, metadata stripped); no external photo credits are needed for photos they own or have permission to use.

## 3D models

| Asset | Creator | Source URL | License / terms | Attribution required | Download date | Notes |
|---|---|---|---|---|---|---|
| Furniture Kit 2.0 (`public/models/kenney/*.glb`) | Kenney | https://kenney.nl/assets/furniture-kit | CC0 1.0 (licence copied to `public/models/kenney/LICENSE-kenney-furniture-kit.txt`) | Not required (courtesy: "Furniture by Kenney, www.kenney.nl") | 2026-10-11 | Materials are remapped to PALETTE at load time (`house/models.js`). |
| Poly Haven models inside `public/models/house/house.glb`: mid_century_lounge_chair, modern_arm_chair_01, modern_wooden_cabinet, side_table_01, wooden_bowl_01, rubber_duck_toy, potted_plant_01/02/04, calathea_orbifolia_01, pachira_aquatica_01, anthurium_botany_01, planter_box_01, stone_fire_pit, fern_02, boulder_01, rock_moss_set_01, tree_small_02, island_tree_02, jacaranda_tree | Poly Haven contributors | https://polyhaven.com/models | CC0 1.0 | Not required (courtesy: "Models from Poly Haven") | 2026-10-11 | Fetched by `art/fetch-assets.mjs`; trees and rocks slimmed for the browser by `art/blender/lite.py` (the jacaranda's leaves recoloured to blossom). |
| Poly Haven models inside `public/models/rooms/{threshold,gaming}.glb` (the entry hall and the gaming room): mid_century_lounge_chair, modern_coffee_table_01, wooden_display_shelves_01, wicker_basket_01, desk_lamp_arm_01, book_encyclopedia_set_01, ceramic_vase_01/03, wooden_bowl_01, potted_plant_02/04, calathea_orbifolia_01, pachira_aquatica_01, anthurium_botany_01, jacaranda_tree, island_tree_01/02 | Poly Haven contributors | https://polyhaven.com/models | CC0 1.0 | Not required (courtesy: "Models from Poly Haven") | 2026-10-12 | Built by `art/blender/rooms.py` with the house's ambientCG materials (above); heavy meshes decimated, small textures at 512 px. |
| Sky light: kloppenheim_06_puresky (HDRI) | Poly Haven | https://polyhaven.com/a/kloppenheim_06_puresky | CC0 1.0 | Not required | 2026-10-11 | Used only to light the Blender bake. |
| Materials in the house: WoodFloor051, Wood049/051/092, Plaster001/003, Concrete034, Fabric030/061, Leather037, Marble012, Travertine009, Tiles107, Terrazzo013, Gravel023/043, PavingStones146, Grass004, Ground037, Rock064 | ambientCG (Lennart Demes) | https://ambientcg.com | CC0 1.0 | Not required (courtesy: "Materials from ambientCG.com") | 2026-10-11 | 1K sets, tinted and baked into the game textures by `art/blender/export_house.py`. |

## Avatars

Built in Blender with the MPFB 2 add-on (MakeHuman; the tool itself is not distributed) from MakeHuman community assets. Clothes, embroidery and textures for the outfits are made in `art/blender/garments.py` / `outfits.py`.

| Asset | Creator | Source | License | Attribution | Download date |
|---|---|---|---|---|---|
| MakeHuman base mesh, rig, skins, eyes, brows, lashes, teeth, shoes05 | MakeHuman team | https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/ | CC0 1.0 | Not required | 2026-10-11 |
| Hair `culturalibre_hair_14` (him) | culturalibre (original model by madsoul666) | MakeHuman community asset pack hair03 | CC BY | "Hair by culturalibre / madsoul666 (MakeHuman community), CC BY" | 2026-10-11 |
| Glasses `TBM Glasses Frames 01` (Ayish, recoloured purple) | spamrakuen | MakeHuman community asset pack glasses01 | CC0 | Not required | 2026-10-11 |
| Sunglasses `glasses modern form` (him) | punkduck | MakeHuman community asset pack glasses02 | CC BY 3.0 | "Sunglasses by punkduck (MakeHuman community), CC BY 3.0" | 2026-10-11 |
