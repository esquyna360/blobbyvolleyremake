shader_type spatial;
render_mode cull_disabled, diffuse_lambert;

// Vegetação em MultiMesh: uma chamada de desenho por espécie e o vento no
// vértice. Quanto mais alto o ponto na planta, mais ele anda — que é o que
// separa "mato balançando" de "mato deslizando".

uniform sampler2D albedo_tex : source_color, filter_linear_mipmap;
uniform vec3 tint : source_color = vec3(1.0);
uniform float sway = 0.05;
uniform float rigid_below = 0.0;
uniform float gust = 1.0;
uniform float backlight = 0.0;

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float h = max(VERTEX.y - rigid_below, 0.0);
	float ph = INSTANCE_CUSTOM.x * 6.2831 + wp.x * 0.31 + wp.z * 0.19;
	float s = sin(TIME * 1.7 + ph) * 0.62 + sin(TIME * 3.3 + ph * 1.7) * 0.38;
	float g = 0.75 + 0.25 * sin(TIME * 0.37 + wp.x * 0.05);
	VERTEX.x += s * sway * h * gust * g;
	VERTEX.z += cos(TIME * 1.31 + ph) * sway * 0.45 * h * gust * g;
}

void fragment() {
	vec4 c = texture(albedo_tex, UV);
	ALBEDO = c.rgb * tint;
	// folha fina acende quando o sol vem por trás: sem isso a copa em contraluz
	// vira recorte preto contra a neblina
	BACKLIGHT = c.rgb * tint * backlight;
	ROUGHNESS = 0.88;
	SPECULAR = 0.12;
	METALLIC = 0.0;
}
