shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen : hint_screen_texture, filter_linear;
uniform float aberration = 0.0;
uniform float flash = 0.0;
uniform float vignette = 0.32;

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 d = uv - vec2(0.5);
	float r2 = dot(d, d);

	vec3 col;
	if (aberration > 0.001) {
		// separa os canais na direção do centro: quanto mais na borda, mais abre
		vec2 off = d * aberration * 0.004 * (0.35 + r2 * 2.0);
		col.r = texture(screen, uv + off).r;
		col.g = texture(screen, uv).g;
		col.b = texture(screen, uv - off).b;
	} else {
		col = texture(screen, uv).rgb;
	}

	col += vec3(flash);
	col *= 1.0 - vignette * smoothstep(0.12, 0.75, r2);
	COLOR = vec4(col, 1.0);
}
