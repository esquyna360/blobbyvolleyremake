class_name BlobMesh
extends RefCounted

## O corpo do blobby é a união suave de duas esferas — a mesma conta que o
## shader do web resolve por raymarch. Aqui ela vira malha uma vez só: o
## contorno é idêntico e o celular fraco desenha um mesh comum em vez de marchar
## raio por pixel.

const RU := BV.BLOBBY_UPPER_RADIUS * Map.S
const RL := BV.BLOBBY_LOWER_RADIUS * Map.S
const OU := BV.BLOBBY_UPPER_SPHERE * Map.S
const OL := BV.BLOBBY_LOWER_SPHERE * Map.S
const K := 0.40

static func _smin(a: float, b: float, k: float) -> float:
	var h := clampf(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
	return lerpf(b, a, h) - k * h * (1.0 - h)

static func sdf(p: Vector3) -> float:
	var up := (p - Vector3(0.0, OU, 0.0)).length() - RU
	var lo := (p - Vector3(0.0, -OL, 0.0)).length() - RL
	return _smin(up, lo, K)

static func _normal(p: Vector3) -> Vector3:
	var e := 0.0008
	return Vector3(
		sdf(p + Vector3(e, 0, 0)) - sdf(p - Vector3(e, 0, 0)),
		sdf(p + Vector3(0, e, 0)) - sdf(p - Vector3(0, e, 0)),
		sdf(p + Vector3(0, 0, e)) - sdf(p - Vector3(0, 0, e))).normalized()

## A forma é estrelada em volta da origem, então basta caminhar num raio por
## direção até a superfície — sem marching cubes e sem costura torta.
static func _surface(dir: Vector3) -> Vector3:
	var lo := 0.0
	var hi := 2.0
	for i in 40:
		var mid := (lo + hi) * 0.5
		if sdf(dir * mid) < 0.0:
			lo = mid
		else:
			hi = mid
	return dir * ((lo + hi) * 0.5)

static func build(lon := 56, lat := 36) -> ArrayMesh:
	var verts := PackedVector3Array()
	var norms := PackedVector3Array()
	var uvs := PackedVector2Array()
	var idx := PackedInt32Array()

	for j in lat + 1:
		var v := float(j) / lat
		var theta := v * PI
		var st := sin(theta)
		var ct := cos(theta)
		for i in lon + 1:
			var u := float(i) / lon
			var phi := u * TAU
			var dir := Vector3(st * sin(phi), ct, st * cos(phi))
			var p := _surface(dir)
			verts.append(p)
			norms.append(_normal(p))
			uvs.append(Vector2(u, v))

	var row := lon + 1
	for j in lat:
		for i in lon:
			var a := j * row + i
			var b := a + 1
			var c := a + row
			var d := c + 1
			idx.append_array([a, b, c, b, d, c])

	var arr := []
	arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts
	arr[Mesh.ARRAY_NORMAL] = norms
	arr[Mesh.ARRAY_TEX_UV] = uvs
	arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return mesh
