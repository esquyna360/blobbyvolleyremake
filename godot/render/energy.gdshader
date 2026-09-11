shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, shadows_disabled;

uniform vec3 tint : source_color = vec3(1.0, 0.6, 0.2);
uniform float power = 1.0;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void fragment() {
	float fr = pow(1.0 - clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0), 2.2);
	vec2 uv = UV * vec2(6.0, 3.0) + vec2(TIME * 1.7, -TIME * 2.3);
	float n = noise(uv) * 0.6 + noise(uv * 2.3 + TIME) * 0.4;
	float plasma = smoothstep(0.35, 0.9, n);
	float core = 1.0 - fr;
	vec3 col = tint * (fr * 2.6 + plasma * 1.4) + vec3(1.0, 0.95, 0.8) * core * core * 0.5;
	ALBEDO = col * power;
	ALPHA = clamp((fr * 1.3 + plasma * 0.7) * power, 0.0, 1.0);
}
