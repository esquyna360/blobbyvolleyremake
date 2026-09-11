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

var _mesh := MeshInstance3D.new()
var _mat := ShaderMaterial.new()
var _hair := Hair3D.new()
var _phase := 0.0
var _lean := 0.0

static var _shared_mesh: ArrayMesh

func _init(s: int, shadows := true) -> void:
	side = s
	if _shared_mesh == null:
		_shared_mesh = BlobMesh.build()
	_mat.shader = load("res://render/blob.gdshader")
	_mat.set_shader_parameter("facing", 1.0 if s == BV.LEFT else -1.0)
	_mat.set_shader_parameter("ru", BlobMesh.RU)
	_mat.set_shader_parameter("ou", BlobMesh.OU)
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

func kick(w: float, sv: float) -> void:
	wobble = maxf(wobble, w)
	squash_vel -= sv

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

	squash_vel += -squash_spring * 46.0 * dt - squash_vel * 7.2 * dt
	squash_spring += squash_vel * dt
	squash_spring = clampf(squash_spring, -0.26, 0.26)

	var anim := sin((st / 5.0) * PI) * 0.16
	var air_stretch := clampf(-vy / 34.0, -0.16, 0.22)

	# mergulho é bote, não tombo: entra rápido, sai devagar
	var air := w.dive_frames[i] > 0
	var target := 1.0 if air else minf(1.0, w.dive_recover[i] / (BV.DIVE_RECOVER * 0.7))
	var rate := 15.0 if target > dive else 6.5
	dive += (target - dive) * (1.0 - exp(-dt * rate))
	if dive < 0.002:
		dive = 0.0

	var sy := 1.0 + squash_spring + air_stretch - anim * 0.5 - cr * 0.34 - dive * 0.32
	var sxz := 1.0 - (squash_spring + air_stretch) * 0.55 + anim * 0.45 + cr * 0.26
	var sq := Vector3(sxz + dive * 0.46, sy, sxz - dive * 0.1)
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
	rotation.z = _lean

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
	_mat.set_shader_parameter("blink", 0.08 + face.blink * 0.92)
	_mat.set_shader_parameter("lid", face.lid)
	_mat.set_shader_parameter("curve", face.curve)
	_mat.set_shader_parameter("brow", face.brow)
	_mat.set_shader_parameter("tear", face.tear)

	mouth = maxf(0.0, mouth - dt * 3.2)
	_mat.set_shader_parameter("mouth", maxf(mouth, face.open))

	flash = maxf(0.0, flash - dt * 3.5)
	_mat.set_shader_parameter("hit_flash", flash)
	_mat.set_shader_parameter("t", time)
