shader_type spatial;
render_mode cull_back, diffuse_burley, specular_schlick_ggx;

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
uniform float tear = 0.0;
uniform float hit_flash = 0.0;
uniform float ru = 0.5;
uniform float ou = 0.38;
uniform float t = 0.0;

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
		vec2 ec = vec2(facing * 0.09 + side * 0.38, 0.24);

		float de = ell(uv - ec, vec2(0.25, 0.25 * li));
		float rim = ink(de - 0.18, soft);
		float me = ink(de, soft);
		vec3 eye_col = mix(vec3(0.06, 0.06, 0.08), vec3(0.97, 0.97, 1.0), smoothstep(0.30, 0.58, li));
		vec2 pc = ec + aim * 0.095;
		float mp = ink(ell(uv - pc, vec2(0.115, 0.115 * min(1.0, li))), soft) * step(0.42, li);
		float mg = ink(ell(uv - pc - vec2(0.045, 0.05), vec2(0.038, 0.042)), soft) * step(0.50, li);

		vec2 bp = uv - vec2(ec.x, ec.y + 0.37 + brow * 0.05);
		float ang = -side * brow * 0.52;
		float cs = cos(ang);
		float sn = sin(ang);
		bp = mat2(vec2(cs, sn), vec2(-sn, cs)) * bp;
		float mb = ink(ell(bp, vec2(0.26, 0.062)), soft);

		col = mix(col, line, rim);      a = max(a, rim);
		col = mix(col, eye_col, me);    a = max(a, me);
		col = mix(col, vec3(0.03, 0.03, 0.05), mp);
		col = mix(col, vec3(1.0), mg);
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

	// mais escuro embaixo, como geleia com fundo: dá volume e brilho de bala
	float depth_k = clamp(0.35 - base_pos.y * 0.45, 0.0, 0.5);
	vec3 body = mix(body_color, deep_color, depth_k);
	ALBEDO = mix(body, face.rgb, face.a) + body_color * hit_flash * 1.6;
	ROUGHNESS = mix(0.12, 0.5, face.a);
	SPECULAR = 0.85 * gloss;
	METALLIC = 0.0;
	CLEARCOAT = 1.0 * gloss;
	CLEARCOAT_ROUGHNESS = 0.08;
	// a luz que atravessa a geleia: o que dá a leitura de corpo mole
	BACKLIGHT = deep_color * (1.0 - face.a) * 0.6;
	RIM = 0.7 * gloss * (1.0 - face.a * 0.7);
	RIM_TINT = 0.35;
	// reflexo pintado: o ponto de luz branco no alto e a janela do céu no ombro
	vec3 l1 = normalize(vec3(-0.45, 0.75, 0.55));
	vec3 h1 = normalize(l1 + VIEW);
	float spot = pow(max(dot(NORMAL, h1), 0.0), 90.0);
	float win = pow(max(dot(NORMAL, normalize(vec3(-0.3, 0.55, 0.8))), 0.0), 14.0) * 0.35;
	float sky = smoothstep(-0.2, 0.9, NORMAL.y) * 0.10;
	EMISSION = vec3(1.0, 0.98, 0.95) * (spot * 1.1 + win + sky) * gloss * (1.0 - face.a * 0.8);
}
