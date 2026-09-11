shader_type spatial;
render_mode cull_disabled, blend_mix, depth_draw_opaque, shadows_disabled;

// Folha de primeiro plano: silhueta escura que emoldura a tela e balança. É o
// que dá a sensação de estar dentro da mata em vez de olhar um papel de parede.

uniform vec3 tint : source_color = vec3(0.03, 0.07, 0.04);
uniform float sway = 0.05;
uniform float opacity = 0.92;

void vertex() {
	float ph = INSTANCE_CUSTOM.x * 6.2831;
	float s = sin(TIME * 0.9 + ph) * 0.6 + sin(TIME * 2.1 + ph * 1.4) * 0.4;
	VERTEX.x += s * sway * max(VERTEX.y, 0.0);
	VERTEX.z += cos(TIME * 0.7 + ph) * sway * 0.4 * max(VERTEX.y, 0.0);
}

void fragment() {
	ALBEDO = tint;
	ALPHA = opacity;
	ROUGHNESS = 1.0;
	SPECULAR = 0.0;
}
