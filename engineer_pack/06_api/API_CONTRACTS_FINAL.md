# API Contracts Final

The canonical API inventory is api_endpoint_inventory.csv. Every endpoint must return typed JSON and audit write operations.

## Shared response shape

```ts
type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
  audit_id?: string;
  server_time: string;
};
```

## Pipeline action request

```ts
type PipelineActionRequest = {
  reason?: string;
  requested_by: string;
  dry_run?: boolean;
  force?: boolean;
};
```

## Asset generation request

```ts
type AssetGenerationRequest = {
  mode: 'text_to_image' | 'image_edit' | 'text_to_glb' | 'image_to_glb' | 'optimize_glb';
  prompt: string;
  source_asset_id?: string;
  target_panel?: string;
  quality: 'draft' | 'production';
  require_approval: boolean;
};
```
