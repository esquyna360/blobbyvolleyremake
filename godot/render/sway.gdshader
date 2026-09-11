shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque, fog_disabled;

// Placa pintada que balança. A ponta (longe da raiz) anda, a raiz fica.
uniform sampler2D tex : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 tint : source_color = vec4(1.0);
uniform vec2 uv_scale = vec2(1.0);
uniform vec2 uv_offset = vec2(0.0);
uniform float amp = 0.02;
uniform float speed = 1.2;
uniform int anchor = 0; // 0 raiz em cima, 1 embaixo, 2 esquerda, 3 direita
uniform float phase = 0.0;

void vertex() {
	float w = anchor == 0 ? UV.y : anchor == 1 ? 1.0 - UV.y : anchor == 2 ? UV.x : 1.0 - UV.x;
	w = w * w;
	float t = TIME * speed + phase + UV.x * 5.0 + UV.y * 2.0;
	VERTEX.x += (sin(t) + 0.5 * sin(t * 2.3 + 1.0)) * amp * w;
	VERTEX.y += cos(t * 0.7) * amp * 0.35 * w;
}

void fragment() {
	vec4 c = texture(tex, UV * uv_scale + uv_offset) * tint;
	ALBEDO = c.rgb;
	ALPHA = c.a;
}
