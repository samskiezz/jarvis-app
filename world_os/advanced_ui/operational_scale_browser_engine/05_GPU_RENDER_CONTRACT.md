# GPU Render Contract

Rendering requirements:
- Use instanced rendering for nodes, icons, edge segments and glyph markers.
- Upload geometry once and stream transform/attribute buffers only.
- Use level-of-detail for high-density graph regions.
- Use viewport culling before draw calls.
- Use GPU color picking in offscreen framebuffer for hit detection.
- Use quaternions for camera rotation and Slerp for transitions.
- Never render random decorative lines as data relationships.
