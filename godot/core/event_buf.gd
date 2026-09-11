class_name EventBuf
extends RefCounted

## Buffer reaproveitado: o rollback resimula vários frames por quadro e alocar
## um objeto por evento aparece no perfil de celular fraco.
var kind := PackedInt32Array()
var side := PackedInt32Array()
var intensity := PackedFloat32Array()
var n := 0

func clear() -> void:
	n = 0

func push(k: int, s: int, i: float) -> void:
	if n < kind.size():
		kind[n] = k
		side[n] = s
		intensity[n] = i
	else:
		kind.append(k)
		side.append(s)
		intensity.append(i)
	n += 1
