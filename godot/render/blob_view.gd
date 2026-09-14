class_name BlobView
extends Node3D

## Porte de updateBlob() do web/src/render/stage.ts. O que dá vida ao blobby não
## é a física, é isto: uma mola de achatamento, uma onda que corre pelo corpo e
## uma cara que reage a evento. Os números são os mesmos do original.

const HEAD_R := BV.BLOBBY_UPPER_RADIUS * Map.S
const HEAD_OFF := BV.BLOBBY_UPPER_SPHERE * Map.S

var side := BV.LEFT
var face := FaceRig.new()
var wobble := 0.0
var squash_spring := 0.0
var squash_vel := 0.0
var mouth := 0.0
var flash := 0.0
var dive := 0.0
var last_vy := 0.0
var was_grounded := true
var body_color := Color(0.95, 0.22, 0.28)
var spread := 1.0
var _eye := 1.0
var _air_t := 0.0
var _land_face := 0.0

var _mesh := MeshInstance3D.new()
var _mat := ShaderMaterial.new()
var _hair := Hair3D.new()
var _phase := 0.0
var _lean := 0.0
var _idle := 0.0

static var _shared_mesh: ArrayMesh

func _init(s: int, shadows := true) -> void:
	side = s
	if _shared_mesh == null:
		_shared_mesh = BlobMesh.build()
	_mat.shader = load("res://render/blob.gdshader")
	_mat.set_shader_parameter("facing", 1.0 if s == BV.LEFT else -1.0)
	_mat.set_shader_parameter("ru", BlobMesh.RU)
	_mat.set_shader_parameter("ou", BlobMesh.OU)
	_mat.set_shader_parameter("light_dir", Stage.key_dir())
	_mesh.mesh = _shared_mesh
	_mesh.material_override = _mat
	_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows \
		else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# o vértice desloca fora da caixa que o Godot calcula: sem isto o blob some
	# de lado na quadra aberta
	_mesh.custom_aabb = AABB(Vector3(-1.5, -1.5, -1.5), Vector3(3.0, 3.5, 3.0))
	add_child(_mesh)
	_hair.rotation.y = 0.0 if s == BV.LEFT else PI
	add_child(_hair)

func set_look(look: Array) -> void:
	body_color = Looks.body_color(look)
	var deep := Looks.shade(body_color, 0.55)
	deep.s = clampf(deep.s + 0.15, 0.0, 1.0)
	_mat.set_shader_parameter("body_color", body_color)
	_mat.set_shader_parameter("deep_color", deep)
	_hair.set_look(look)

## Retrato parado: respira, pisca e olha pra câmera, sem mundo por trás.
func pose(dt: float, time: float, tension := 0.0) -> void:
	var breath := sin(time * 2.0) * 0.03
	var sq := Vector3(1.0 - breath * 0.6, 1.0 + breath, 1.0 - breath * 0.6)
	_mat.set_shader_parameter("squash", sq)
	_mat.set_shader_parameter("wobble_amp", 0.0)
	_mat.set_shader_parameter("eye_aim", Vector3(0.0, 0.08, 1.0).normalized())
	_hair.position.y = HEAD_OFF * sq.y
	_hair.scale = Vector3(sq.x * HEAD_R, sq.y * HEAD_R, sq.z * HEAD_R)
	rotation.z = sin(time * 0.9) * 0.03
	face.update(dt, tension, false)
	_mat.set_shader_parameter("blink", 0.08 + face.blink * 0.92)
	_mat.set_shader_parameter("lid", face.lid)
	_mat.set_shader_parameter("curve", face.curve)
	_mat.set_shader_parameter("brow", face.brow)
	_mat.set_shader_parameter("tear", face.tear)
	_mat.set_shader_parameter("mouth", face.open)

func kick(w: float, sv: float) -> void:
	wobble = maxf(wobble, w)
	squash_vel -= sv * 1.5

## Pouso: achata forte e a mola devolve com sobra. A cara sente o baque.
func land(impact: float) -> void:
	squash_vel -= 5.2 + 6.5 * impact
	wobble = minf(1.1, wobble + impact * 0.8)
	_land_face = 0.35 + impact * 0.6
	if impact > 0.5:
		mouth = maxf(mouth, 0.4 + impact * 0.5)

## Impulso: estica pra cima antes de sair do chão.
func takeoff() -> void:
	squash_vel += 4.6
	_air_t = 0.0

## `bx`/`by` são a bola já em coordenadas de mundo: o olho segue ela.
func update(w: PhysicWorld, gxp: float, gyp: float, st: float, bx: float, by: float,
		time: float, dt: float, tension: float) -> void:
	var i := side
	var cr := w.crouch[i]
	var wx := Map.gx(gxp)
	var wy := Map.gy(gyp)
	var vy := w.blob_vy[i]
	var vx := w.blob_vx[i]
	var grounded := w.blob_y[i] >= BV.GROUND_PLANE_HEIGHT - 0.001

	was_grounded = grounded
	last_vy = vy

	squash_vel += -squash_spring * 120.0 * dt - squash_vel * 9.0 * dt
	squash_spring += squash_vel * dt
	squash_spring = clampf(squash_spring, -0.48, 0.42)

	var anim := sin((st / 5.0) * PI) * 0.16
	var still := grounded and absf(vx) < 0.05 and cr < 0.05 and w.dive_frames[i] == 0
	_idle += ((1.0 if still else 0.0) - _idle) * (1.0 - exp(-dt * (2.0 if still else 12.0)))
	var ph := time * 2.1 + i * 1.9
	var breath := (sin(ph) * 0.028 + sin(ph * 0.53 + 1.0) * 0.012) * _idle
	anim -= breath * 2.0
	_air_t = 0.0 if grounded else _air_t + dt
	var air_stretch := clampf(-vy / 20.0, -0.30, 0.34) * minf(1.0, _air_t * 9.0 + 0.3)
	if not grounded and vy > 0.0:
		air_stretch = clampf(-vy / 20.0, -0.30, 0.0) * 1.15

	# mergulho é bote, não tombo: entra rápido, sai devagar
	var air := w.dive_frames[i] > 0
	var target := 1.0 if air else minf(1.0, w.dive_recover[i] / (BV.DIVE_RECOVER * 0.7))
	var rate := 15.0 if target > dive else 6.5
	dive += (target - dive) * (1.0 - exp(-dt * rate))
	if dive < 0.002:
		dive = 0.0

	var deform := squash_spring + air_stretch
	var sy := 1.0 + deform - anim * 0.5 - cr * 0.34 - dive * 0.32 + breath
	var sxz := 1.0 / sqrt(maxf(0.45, 1.0 + deform)) + anim * 0.45 + cr * 0.26 - breath * 0.6
	var sq := Vector3(sxz + dive * 0.46, sy, sxz - dive * 0.1)
	spread = sxz
	_mat.set_shader_parameter("squash", sq)

	_hair.position.y = HEAD_OFF * sy
	_hair.scale = Vector3(sq.x * HEAD_R, sq.y * HEAD_R, sq.z * HEAD_R)

	# o achatamento encolhe em volta da origem: sem baixar, o blob agachado
	# descola do chão em vez de afundar nele
	position = Vector3(
		wx + w.dive_dir[i] * dive * 0.16,
		wy - cr * BV.CROUCH_DUCK * Map.S * (1.05 if grounded else 0.4) - dive * 0.22,
		0.0)

	wobble = maxf(0.0, wobble - dt * 2.4)
	_phase += dt * 26.0

	var lean := -w.dive_dir[i] * 0.44 * dive if dive > 0.01 \
		else -vx * 0.028 + (0.0 if grounded else vy * 0.004)
	_lean = lerpf(_lean, lean, 1.0 - exp(-dt * (17.0 if air else 9.0)))
	rotation.z = _lean + sin(time * 0.9 + i * 2.4) * 0.035 * _idle
	rotation.y = sin(time * 0.6 + i * 1.3) * 0.12 * _idle

	if w.stun[i] > 0:
		rotation.z += sin(time * 9.5) * 0.24
		wobble = maxf(wobble, 0.5 + sin(time * 17.0) * 0.22)

	_mat.set_shader_parameter("wobble_amp", wobble)
	_mat.set_shader_parameter("wobble_phase", _phase)

	var upper_y := wy + 0.38
	var aim := Vector3(bx - wx, by - upper_y, 5.5).normalized()
	_mat.set_shader_parameter("eye_aim", aim)

	var ball_near := Vector2(bx - wx, by - wy).length() < 1.6
	face.update(dt, tension, ball_near)
	_land_face = maxf(0.0, _land_face - dt * 2.6)
	var eye_want := 1.0 + (0.0 if grounded else 0.32 + clampf(-vy / 30.0, 0.0, 0.18)) \
		+ face.wide * 0.3 - _land_face * 0.25
	_eye += (eye_want - _eye) * (1.0 - exp(-dt * 14.0))
	_mat.set_shader_parameter("eye_scale", _eye)
	_mat.set_shader_parameter("blink", 0.08 + face.blink * 0.92)
	_mat.set_shader_parameter("lid", face.lid * (1.0 - _land_face * 0.55))
	_mat.set_shader_parameter("curve", face.curve)
	_mat.set_shader_parameter("brow", face.brow)
	_mat.set_shader_parameter("tear", face.tear)

	mouth = maxf(0.0, mouth - dt * 3.2)
	_mat.set_shader_parameter("mouth", maxf(maxf(mouth, face.open), _land_face * 0.7))

	flash = maxf(0.0, flash - dt * 3.5)
	_mat.set_shader_parameter("hit_flash", flash)
	_mat.set_shader_parameter("t", time)
