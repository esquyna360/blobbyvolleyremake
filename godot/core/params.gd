class_name MatchParams
extends RefCounted

## Tudo que um nível pode mudar na partida. O padrão é o Blobby clássico.

var court_w := BV.RIGHT_PLANE
var walls := true
var per_side := [1, 1]
var blob_scale := [1.0, 1.0]
var blob_speed := [1.0, 1.0]
var blob_jump := [1.0, 1.0]
var ball_r := BV.BALL_RADIUS
var ball_g := 1.0
var ball_hit := 1.0
var ball_bounce := 1.0
var ball_kind := "normal"
var gravity := 1.0
var wind := 0.0
var ice := 0.0
var net_h := 1.0
var touches := 3
var stw := BV.DEFAULT_SCORE_TO_WIN
var two_ahead := true
var lead_by := 0
var dark := false
var fog := false
var tiny_serve := false

func net_x() -> float:
	return court_w * 0.5

func nb() -> int:
	return int(per_side[0]) + int(per_side[1])

func side_of(p: int) -> int:
	return BV.LEFT if p < int(per_side[0]) else BV.RIGHT

func lead(side: int) -> int:
	return 0 if side == BV.LEFT else int(per_side[0])

func rules() -> Dictionary:
	return {"id": "custom", "name": "Custom", "desc": "", "touches": touches,
		"stw": stw, "two_ahead": two_ahead, "lead_by": lead_by}

static func classic(rules: Variant = "default", score_to_win := -1, walls_on := true) -> MatchParams:
	var m := MatchParams.new()
	var r: Dictionary = GameLogic.get_rules(rules) if rules is String else rules
	m.touches = int(r.touches)
	m.stw = score_to_win if score_to_win > 0 else int(r.stw)
	m.two_ahead = bool(r.two_ahead)
	m.lead_by = int(r.get("lead_by", 0))
	m.walls = walls_on
	return m

func kind_desc() -> String:
	match ball_kind:
		"bowling": return "Bowling ball"
		"balloon": return "Balloon"
		"pea": return "Pea"
		"beach": return "Beach ball"
	return "Volleyball"
