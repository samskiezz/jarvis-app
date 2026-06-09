from pathlib import Path
import csv, json
BASE = Path(__file__).resolve().parents[1]
def count_csv(rel):
    with open(BASE/rel, newline='', encoding='utf-8') as f:
        return sum(1 for _ in csv.DictReader(f))
counts = {
    'image_assets': count_csv('04_assets/images/gpt_image_2_asset_inventory.csv'),
    'glb_assets': count_csv('04_assets/glb_pbr/tripo3d_glb_pbr_asset_inventory.csv'),
    'animation_vfx_modules': count_csv('04_assets/animation_vfx/animation_vfx_inventory.csv'),
    'sfx_cues': count_csv('04_assets/sfx/sfx_inventory.csv'),
    'ui_features': count_csv('03_ui_panels/feature_matrix.csv'),
    'api_endpoints': count_csv('06_api/api_endpoint_inventory.csv'),
    'implementation_tickets': count_csv('14_implementation/implementation_backlog.csv'),
}
print(json.dumps(counts, indent=2))
assert counts['image_assets'] == 80
assert counts['glb_assets'] == 102
assert counts['animation_vfx_modules'] == 116
assert counts['sfx_cues'] == 50
assert counts['ui_features'] == 73
assert counts['implementation_tickets'] == 70
