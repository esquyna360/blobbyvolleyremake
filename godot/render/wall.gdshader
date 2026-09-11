shader_type spatial;
render_mode blend_mix, unshaded, cull_disabled, depth_draw_never, fog_disabled;

uniform vec3 color : source_color = vec3(0.45, 0.85, 1.0);
uniform float height = 9.0;
uniform float hit_y = 0.0;
uniform float hit_t = 10.0;
uniform float t = 0.0;

varying vec3 lp;

void vertex() {
	lp = VERTEX;
}

float hexd(vec2 p) {
	p = abs(p);
	return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}

void fragment() {
	float hy = lp.y + height * 0.5;
	float fade = smoothstep(height, 0.0, hy);
	fade *= fade;
	vec2 g = vec2(lp.x, hy) * 1.5;
	vec2 r = vec2(1.0, 1.7320508);
	vec2 h = r * 0.5;
	vec2 a = mod(g, r) - h;
	vec2 b = mod(g - h, r) - h;
	vec2 gv = dot(a, a) < dot(b, b) ? a : b;
	float line = smoothstep(0.40, 0.47, hexd(gv));
	float base = 0.10 + line * 0.45;
	float edge = smoothstep(1.0, 0.0, hy) * 0.7;
	float scan = (0.5 + 0.5 * sin(hy * 2.2 - t * 2.4)) * 0.16;
	float ring = 0.0;
	if (hit_t < 1.4) {
		float d = length(vec2(lp.x, hy - hit_y));
		float w = hit_t * 7.0;
		ring = smoothstep(0.7, 0.0, abs(d - w)) * (1.0 - hit_t / 1.4) * 1.6;
		ring += (1.0 - hit_t / 1.4) * 0.25;
	}
	float al = (base + scan + ring) * fade + edge;
	ALBEDO = mix(color, vec3(1.0), clamp(line * 0.6 + ring, 0.0, 1.0));
	ALPHA = clamp(al * 0.85, 0.0, 0.9);
}
