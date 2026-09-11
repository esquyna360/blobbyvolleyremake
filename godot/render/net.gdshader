shader_type spatial;
render_mode cull_disabled, diffuse_lambert;

uniform vec3 impacts[4];
uniform float impact_t[4];
uniform vec3 cord_color : source_color = vec3(0.06, 0.07, 0.09);
uniform vec3 sun_color : source_color = vec3(1.0, 0.93, 0.8);
uniform float cell = 17.0;
uniform float net_top = 4.32;

varying float v_ripple;

void vertex() {
	vec3 p = VERTEX;
	float r = 0.0;
	for (int i = 0; i < 4; i++) {
		float age = impact_t[i];
		if (age <= 0.0 || age > 1.4) { continue; }
		float d = distance(p.yz, impacts[i].yz);
		r += exp(-d * 1.6) * exp(-age * 3.2) * sin(d * 9.0 - age * 22.0) * 0.30;
	}
	float sway = sin(p.y * 2.2 + TIME * 1.4) * 0.012 * (1.0 - p.y / net_top);
	v_ripple = r;
	VERTEX.x = p.x + r + sway;
}

void fragment() {
	vec2 g = fract(UV * cell);
	float lw = 0.30;
	float cord = max(
		1.0 - smoothstep(lw * 0.5, lw, abs(g.x - 0.5)),
		1.0 - smoothstep(lw * 0.5, lw, abs(g.y - 0.5)));
	float band = 1.0 - smoothstep(0.955, 0.985, UV.y);
	float a = max(cord, 1.0 - band);
	if (a < 0.35) { discard; }

	vec3 col = cord_color;
	if (UV.y > 0.955) { col = vec3(0.92, 0.92, 0.95); }
	col *= 0.75 + 0.45 * abs(v_ripple) * 6.0;
	col += sun_color * 0.08;
	ALBEDO = col;
	ROUGHNESS = 0.7;
	SPECULAR = 0.3;
}
