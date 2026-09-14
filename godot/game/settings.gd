class_name Settings
extends RefCounted

const PATH := "user://settings.cfg"

var quality := -1
var look: Array = [0, 1, 0]
var last_ip := ""
var rules := "default"
var score_to_win := 15
var walls := true
var difficulty := "normal"
var scene := "anoitecer"
var player_name := ""
var campaign_level := 1
var campaign_best := 0
var touch := -1

func load_all() -> void:
	var c := ConfigFile.new()
	if c.load(PATH) == OK:
		quality = c.get_value("v", "quality", -1)
		look = c.get_value("v", "look", look)
		last_ip = c.get_value("v", "ip", "")
		rules = c.get_value("v", "rules", "default")
		score_to_win = c.get_value("v", "stw", 15)
		walls = c.get_value("v", "walls", true)
		difficulty = c.get_value("v", "diff", "normal")
		scene = c.get_value("v", "scene", "anoitecer")
		player_name = c.get_value("v", "name", "")
		campaign_level = c.get_value("v", "clevel", 1)
		campaign_best = c.get_value("v", "cbest", 0)
		touch = c.get_value("v", "touch", -1)
	if quality < 0:
		quality = detect_quality()

func save() -> void:
	var c := ConfigFile.new()
	c.set_value("v", "quality", quality)
	c.set_value("v", "look", look)
	c.set_value("v", "ip", last_ip)
	c.set_value("v", "rules", rules)
	c.set_value("v", "stw", score_to_win)
	c.set_value("v", "walls", walls)
	c.set_value("v", "diff", difficulty)
	c.set_value("v", "scene", scene)
	c.set_value("v", "name", player_name)
	c.set_value("v", "clevel", campaign_level)
	c.set_value("v", "cbest", campaign_best)
	c.set_value("v", "touch", touch)
	c.save(PATH)

## Primeiro palpite de preset. Celular entra no baixo e sobe se o jogador
## quiser: é mais honesto travar num quadro estável do que abrir bonito e
## engasgar no primeiro rally.
static func detect_quality() -> int:
	var os_name := OS.get_name()
	if os_name in ["Android", "iOS"]:
		return 1
	if os_name == "Web":
		return 0 if DisplayServer.is_touchscreen_available() else 1
	var vram := RenderingServer.get_video_adapter_name().to_lower()
	if "intel" in vram and not "arc" in vram:
		return 1
	return 2
