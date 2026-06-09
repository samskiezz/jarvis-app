# Asset Count Audit

```json
{
  "actual_image_files_in_zip": 1,
  "actual_glb_files_in_zip": 0,
  "required_gpt_image_2_assets": 64,
  "optional_gpt_image_2_assets": 16,
  "required_glb_pbr_assets": 78,
  "optional_glb_pbr_assets": 24,
  "animation_vfx_modules": 116,
  "sfx_cues": 50,
  "ui_features": 73,
  "api_endpoints": 82,
  "implementation_tickets": 70
}
```

The ZIP includes one reference image and no production GLB files. The CSV inventories are the source of truth for production generation.

Files:
- images/gpt_image_2_asset_inventory.csv
- glb_pbr/tripo3d_glb_pbr_asset_inventory.csv
- animation_vfx/animation_vfx_inventory.csv
- sfx/sfx_inventory.csv
