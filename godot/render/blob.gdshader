shader_type spatial;
render_mode cull_back, unshaded, fog_disabled;

// A pança balança no vértice e a cara é pintada no pixel — as duas contas são
// as mesmas do shader do web, só que sem raymarch: o celular fraco desenha um
// mesh comum e o contorno continua o mesmo.

uniform vec3 body_color : source_color = vec3(0.95, 0.22, 0.28);
uniform vec3 deep_color : source_color = vec3(0.62, 0.05, 0.14);
uniform vec3 squash = vec3(1.0);
uniform float wobble_amp = 0.0;
uniform float wobble_phase = 0.0;
uniform float facing = 1.0;
uniform vec3 eye_aim = vec3(0.0, 0.0, 1.0);
uniform float blink = 1.0;
uniform float mouth = 0.0;
uniform float curve = 0.2;
uniform float brow = 0.0;
uniform float lid = 1.0;
uniform float eye_scale = 1.0;
uniform float tear = 0.0;
uniform float hit_flash = 0.0;
uniform float ru = 0.5;
uniform float ou = 0.38;
uniform float t = 0.0;
uniform vec3 light_dir = vec3(-0.35, 0.80, 0.48);
uniform vec3 rim_color : source_color = vec3(1.0, 0.85, 0.63);
uniform float toon = 1.0;
uniform float dizzy = 0.0;
uniform float parry_glow = 0.0;

varying vec3 base_pos;

float ell(vec2 p, vec2 r) { return length(p / r) - 1.0; }
float ink(float d, float soft) { return 1.0 - smoothstep(-soft, soft, d); }

void vertex() {
	vec3 p = VERTEX;
	// mesmas senóides do web, nas mesmas unidades: duas cristas ao longo do
	// corpo e quase duas na largura, que é o que lê como pança batendo
	float w = 1.0 + wobble_amp * sin(p.y * 7.0 + wobble_phase) * 0.14
	              + wobble_amp * sin(p.x * 9.0 - wobble_phase * 1.3) * 0.09;
	base_pos = p;
	VERTEX = p * w * squash;
	NORMAL = normalize(NORMAL / squash);
}

// devolve albedo da cara e, em .a, o quanto ela cobre o corpo
vec4 face_layer(vec3 p, out float face_zone) {
	face_zone = 0.0;
	vec3 q = p - vec3(0.0, ou, 0.0);
	vec2 uv = q.xy / ru;
	float depth = q.z / ru;
	float front = smoothstep(0.12, 0.42, depth);
	face_zone = smoothstep(-0.10, 0.28, depth)
		* smoothstep(1.55, 0.45, length((uv - vec2(facing * 0.09, -0.06)) / vec2(1.05, 1.15)));
	if (front <= 0.002) return vec4(0.0);

	float soft = 0.022;
	float li = clamp(blink * lid, 0.05, 1.6);
	vec2 aim = normalize(eye_aim.xy + vec2(0.0, 0.0001)) * min(1.0, length(eye_aim.xy) * 1.6);

	vec3 col = vec3(0.0);
	float a = 0.0;
	vec3 line = vec3(0.09, 0.07, 0.10);

	for (int i = 0; i < 2; i++) {
		float side = i == 0 ? -1.0 : 1.0;
		vec2 ec = vec2(facing * 0.09 + side * (0.36 + 0.04 * eye_scale), 0.24 + 0.03 * (eye_scale - 1.0));
		float es = eye_scale;

		float de = ell(uv - ec, vec2(0.25 * es, 0.25 * li * es));
		float rim = ink(de - 0.18 / es, soft);
		float me = ink(de, soft);
		vec3 eye_col = mix(vec3(0.06, 0.06, 0.08), vec3(0.97, 0.97, 1.0), smoothstep(0.30, 0.58, li));
		vec2 pc = ec + aim * 0.095 * es;
		float pr = 0.115 * mix(1.0, 0.72, clamp(es - 1.0, 0.0, 1.0) * 1.6);
		float mp = ink(ell(uv - pc, vec2(pr, pr * min(1.0, li))), soft) * step(0.42, li);
		float mg = ink(ell(uv - pc - vec2(0.045, 0.05) * es, vec2(0.038, 0.042)), soft) * step(0.50, li);

		vec2 bp = uv - vec2(ec.x, ec.y + 0.37 + brow * 0.05);
		float ang = -side * brow * 0.52;
		float cs = cos(ang);
		float sn = sin(ang);
		bp = mat2(vec2(cs, sn), vec2(-sn, cs)) * bp;
		float mb = ink(ell(bp, vec2(0.26, 0.062)), soft);

		col = mix(col, line, rim);      a = max(a, rim);
		col = mix(col, eye_col, me);    a = max(a, me);
		if (dizzy > 0.01) {
			vec2 sp = (uv - ec) / (0.22 * es);
			float sr = length(sp);
			float sa = atan(sp.y, sp.x) + t * 9.0 * side;
			float spiral = 1.0 - smoothstep(0.10, 0.20, abs(fract(sr * 2.2 - sa / 6.2831) - 0.5));
			float ms = spiral * step(sr, 1.0) * me;
			col = mix(col, vec3(0.03, 0.03, 0.05), ms * dizzy);
			col = mix(col, vec3(0.03, 0.03, 0.05), mp * (1.0 - dizzy));
			col = mix(col, vec3(1.0), mg * (1.0 - dizzy));
		} else {
			col = mix(col, vec3(0.03, 0.03, 0.05), mp);
			col = mix(col, vec3(1.0), mg);
		}
		col = mix(col, line, mb);       a = max(a, mb);

		if (tear > 0.03) {
			float ph = fract(t * 0.55 + float(i) * 0.41);
			vec2 tp = uv - vec2(ec.x + side * 0.19, ec.y - 0.28 - ph * 0.55);
			float mt = ink(ell(tp, vec2(0.075, 0.115) * tear * (1.0 - ph * 0.4)), soft);
			col = mix(col, vec3(0.55, 0.85, 1.0), mt);
			a = max(a, mt);
		}
	}

	vec2 mo = uv - vec2(facing * 0.09, -0.34);
	float open = 0.040 + mouth * 0.26;
	float wid = 0.28 + mouth * 0.06;
	float tx = mo.x / wid;
	mo.y -= curve * 0.30 * (tx * tx - 0.34);
	float dm = ell(mo, vec2(wid, open));
	float mlip = ink(dm - 0.16, soft);
	float mm = ink(dm, soft);
	float mtg = ink(ell(mo - vec2(0.0, -open * 0.40), vec2(wid * 0.55, open * 0.36)), soft)
		* smoothstep(0.40, 0.75, mouth);

	col = mix(col, line, mlip);                  a = max(a, mlip);
	col = mix(col, vec3(0.22, 0.03, 0.07), mm);  a = max(a, mm);
	col = mix(col, vec3(0.78, 0.26, 0.33), mtg);

	return vec4(col, a * front);
}

void fragment() {
	float face_zone;
	vec4 face = face_layer(base_pos, face_zone);
	float gloss = 1.0 - face_zone * 0.82;

	vec3 n = normalize(mat3(INV_VIEW_MATRIX) * NORMAL);
	vec3 l = normalize(light_dir);
	float ndl = dot(n, l);
	float lit = smoothstep(-0.02, 0.06, ndl);
	float depth_k = clamp(0.35 - base_pos.y * 0.45, 0.0, 0.5) * 0.35;
	vec3 body = mix(body_color, deep_color, depth_k);
	vec3 base = mix(body, face.rgb, face.a);
	vec3 col = base * mix(0.80, 1.0, lit);

	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 2.6);
	float top = smoothstep(-0.1, 0.55, ndl);
	float rim = smoothstep(0.22, 0.55, fres) * top * gloss * (1.0 - face.a * 0.8);
	col = mix(col, rim_color, rim * 0.95);

	vec3 h = normalize(l + normalize(mat3(INV_VIEW_MATRIX) * VIEW));
	float spot = step(0.93, pow(max(dot(n, h), 0.0), 1.0)) * gloss * (1.0 - face.a * 0.8);
	col += vec3(1.0, 0.96, 0.9) * spot * 0.35;
	col += body_color * hit_flash * 1.6;
	// parry do SF3: o corpo inteiro acende azul, mais forte na borda
	col = mix(col, vec3(0.30, 0.72, 1.35), parry_glow * (0.30 + fres * 0.70));
	col += vec3(0.16, 0.48, 1.10) * parry_glow * (0.35 + rim * 1.4);
	ALBEDO = col;
}
