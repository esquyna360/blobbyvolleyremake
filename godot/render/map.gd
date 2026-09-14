class_name Map
extends RefCounted

## Mesma escala do renderizador web: 1 unidade de jogo = 0.02 de mundo. A
## quadra pode mudar de largura por nível, então a rede e a metade vêm daqui.
const S := 0.02
const COURT_DEPTH := 8.0

static var net_x := BV.NET_POSITION_X
static var court_w := BV.RIGHT_PLANE
static var net_top := BV.NET_SPHERE_POSITION

static func configure(w: PhysicWorld) -> void:
	net_x = w.net_x
	court_w = w.right_plane
	net_top = w.net_top

static func net_top_w() -> float:
	return (500.0 - net_top) * S

static func gx(x: float) -> float:
	return (x - net_x) * S

static func gy(y: float) -> float:
	return (500.0 - y) * S

static func gr(r: float) -> float:
	return r * S

static func court_half_w() -> float:
	return (court_w / 2.0) * S
