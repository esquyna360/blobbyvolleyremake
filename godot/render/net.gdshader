shader_type spatial;
render_mode cull_disabled, diffuse_lambert;

uniform vec3 impacts[4];
uniform float impact_t[4];
uniform vec3 cord_color : source_color = vec3(0.10, 0.11, 0.13);
uniform vec3 sun_color : source_color = vec3(1.0, 0.93, 0.8);
uniform float cell = 12.0;
uniform float net_top = 4.32;
uniform float bulge = 0.30;
uniform float flat_shade = 0.0;
uniform vec2 cell_mul = vec2(2.2, 1.0);
uniform float lw = 0.34;

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
	// a malha nunca fica esticada como vidro: barriga no meio, presa nos
	// postes e no cabo, mais solta embaixo
	float slack = sin(UV.x * PI) * pow(1.0 - UV.y, 0.55);
	float sway = (sin(p.y * 2.2 + TIME * 1.4) + 0.4 * sin(p.z * 1.7 + TIME * 0.9)) * 0.03 * slack;
	v_ripple = r;
	VERTEX.x = p.x + r + sway + bulge * slack;
}

void fragment() {
	vec2 g = fract(UV * cell * cell_mul);
	float cx = 1.0 - smoothstep(lw * 0.45, lw, abs(g.x - 0.5));
	float cy = 1.0 - smoothstep(lw * 0.45, lw, abs(g.y - 0.5));
	float cord = max(cx, cy);
	float band = 1.0 - smoothstep(0.90, 0.915, UV.y);
	float a = max(cord, 1.0 - band);
	if (a < 0.35) { discard; }

	vec3 col = cord_color;
	// o nó onde as cordas cruzam é mais grosso e mais claro
	float knot = cx * cy;
	col = mix(col, col * 1.6 + 0.08, knot);
	if (UV.y > 0.90) { col = vec3(0.97, 0.96, 0.94); }
	col *= 0.85 + 0.45 * abs(v_ripple) * 6.0;
	col += sun_color * 0.06;
	ALBEDO = col * (1.0 - flat_shade);
	EMISSION = col * flat_shade;
	ROUGHNESS = 0.75;
	SPECULAR = 0.25;
}
