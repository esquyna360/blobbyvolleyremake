shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec3 tint : source_color = vec3(1.0);
uniform float alpha = 1.0;
uniform float fade = 1.0;

void vertex() {
	// billboard: o anel sempre de frente pra câmera
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(
		INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX[0] *= length(MODEL_MATRIX[0]);
	MODELVIEW_MATRIX[1] *= length(MODEL_MATRIX[1]);
	MODELVIEW_MATRIX[2] *= length(MODEL_MATRIX[2]);
}

void fragment() {
	float d = length(UV - vec2(0.5)) * 2.0;
	float ring = smoothstep(0.72, 0.95, d) * (1.0 - smoothstep(0.97, 1.02, d));
	ALBEDO = tint * ring * fade * alpha;
	ALPHA = ring * fade * alpha;
}
