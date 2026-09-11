class_name Map
extends RefCounted

## Mesma escala do renderizador web: 1 unidade de jogo = 0.02 de mundo. Manter
## o número faz o cenário, a câmera e o blob caberem um no outro sem ajuste.
const S := 0.02
const COURT_DEPTH := 8.0

static func gx(x: float) -> float:
	return (x - BV.NET_POSITION_X) * S

static func gy(y: float) -> float:
	return (500.0 - y) * S

static func gr(r: float) -> float:
	return r * S

static func court_half_w() -> float:
	return (BV.RIGHT_PLANE / 2.0) * S
