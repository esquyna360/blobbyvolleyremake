shader_type spatial;
render_mode cull_back, depth_draw_always;

// Rio: duas ondas cruzadas viram normal, e é a normal que acende o reflexo do
// céu. Sem textura e sem reflexão em tempo real — roda em GPU integrada.
// A câmera olha a água quase de lado, então a ondulação some com a distância:
// de longe ela vira faixa espelhada em vez de listra serrilhada.

uniform vec3 shallow_color : source_color = vec3(0.16, 0.34, 0.30);
uniform vec3 deep_color : source_color = vec3(0.02, 0.08, 0.09);
uniform vec3 foam_color : source_color = vec3(0.82, 0.92, 0.90);
uniform float flow = 0.30;
uniform float wave = 0.22;
uniform float scale = 0.9;

varying vec3 wpos;

float ridge(vec2 p) {
	return sin(p.x) * 0.5 + sin(p.y * 1.31 + p.x * 0.4) * 0.32
		+ sin(p.x * 2.7 - p.y * 0.6) * 0.18;
}

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 p = wpos.xz * scale;
	p.y -= TIME * flow;
	float e = 0.15;
	float h = ridge(p);
	vec3 n = normalize(vec3((h - ridge(p + vec2(e, 0.0))) * wave * 26.0, 1.0,
		(h - ridge(p + vec2(0.0, e))) * wave * 26.0));

	// de longe a crista some: senão o rio vira serrilha de listras
	float d = length(wpos - (INV_VIEW_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
	n = normalize(mix(n, vec3(0.0, 1.0, 0.0), smoothstep(14.0, 60.0, d)));
	NORMAL = normalize((VIEW_MATRIX * vec4(n, 0.0)).xyz);

	// a margem fica rasa: clareia e ganha espuma
	float bank = 1.0 - smoothstep(0.0, 0.30, min(UV.y, 1.0 - UV.y));
	float foam = smoothstep(0.45, 0.88, bank + h * 0.30);
	ALBEDO = mix(deep_color, shallow_color, bank * 0.8);
	ALBEDO = mix(ALBEDO, foam_color, foam * 0.75);
	ROUGHNESS = mix(0.16, 0.6, foam);
	METALLIC = 0.0;
	SPECULAR = 0.55;
}
