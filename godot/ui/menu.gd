class_name Menu
extends Control

## Menu em cima da partida de demonstração: o cenário continua rodando atrás,
## que é o melhor cartão de visita que esse jogo tem.

signal play_bot(difficulty: String)
signal play_local()
signal host_room()
signal join_room(address: String)
signal quality_changed(q: int)
signal look_changed(look: Array)
signal quit_game()

const DIFFS := [["easy", "Fácil"], ["normal", "Normal"], ["hard", "Difícil"], ["insane", "Insano"]]
const QUALS := ["Baixo", "Médio", "Alto", "Máximo"]
const SCENES := [["selva", "Selva"], ["praia", "Praia ao pôr do sol"], ["galpao", "Galpão"]]

var settings: Settings

var _root: VBoxContainer
var _page := "main"
var _status: Label
var _ip_edit: LineEdit
var _preview: SubViewport
var _preview_blob: BlobView

func build(s: Settings) -> void:
	settings = s
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var shade := ColorRect.new()
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.02, 0.05, 0.04, 0.45)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)

	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(center)

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", UiTheme.panel())
	panel.custom_minimum_size = Vector2(420, 0)
	center.add_child(panel)

	_root = VBoxContainer.new()
	_root.add_theme_constant_override("separation", 10)
	panel.add_child(_root)

	_status = UiTheme.label("", 15, Color(1, 1, 1, 0.6))
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	show_page("main")

func show_page(p: String) -> void:
	_page = p
	for c in _root.get_children():
		_root.remove_child(c)
		if c != _status:
			c.queue_free()
	match p:
		"main": _main()
		"bot": _bot()
		"net": _net()
		"look": _look()
		"options": _options()

func _title(text: String, sub := "") -> void:
	var t := UiTheme.label(text, 34, UiTheme.GOLD)
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_root.add_child(t)
	if sub != "":
		var u := UiTheme.label(sub, 14, Color(1, 1, 1, 0.55))
		u.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_root.add_child(u)
	_root.add_child(HSeparator.new())

func _btn(text: String, cb: Callable, col := UiTheme.GOLD) -> Button:
	var b := UiTheme.style(Button.new(), col)
	b.text = text
	b.pressed.connect(cb)
	_root.add_child(b)
	return b

func _main() -> void:
	_title("BLOBBY SELVA", "volei de praia no meio do mato")
	_btn("Jogar contra o bot", func(): show_page("bot"))
	_btn("Dois jogadores aqui", func(): play_local.emit(), UiTheme.LEAF)
	_btn("Jogar online", func(): show_page("net"), Color(0.36, 0.72, 1.0))
	_btn("Aparência", func(): show_page("look"), Color(0.9, 0.45, 0.8))
	_btn("Gráficos e som", func(): show_page("options"), Color(0.7, 0.75, 0.8))
	if OS.get_name() != "Web":
		_btn("Sair", func(): quit_game.emit(), Color(0.8, 0.35, 0.3))

func _bot() -> void:
	_title("Contra o bot", "o insano simula a bola igual a física de verdade")
	for d in DIFFS:
		_btn(d[1], func(): play_bot.emit(d[0]))
	_back()

func _net() -> void:
	_title("Online", "IP direto, sem conta e sem servidor no meio")
	_btn("Criar sala", func():
		host_room.emit()
		set_status("esperando o outro jogador entrar em %s:%d" % [_local_ip(), NetLink.PORT]))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	_ip_edit = LineEdit.new()
	_ip_edit.placeholder_text = "192.168.0.10"
	_ip_edit.text = settings.last_ip
	_ip_edit.custom_minimum_size = Vector2(230, 0)
	_ip_edit.add_theme_font_size_override("font_size", 18)
	row.add_child(_ip_edit)
	var go := UiTheme.style(Button.new(), Color(0.36, 0.72, 1.0), 18)
	go.text = "Entrar"
	go.pressed.connect(func():
		settings.last_ip = _ip_edit.text.strip_edges()
		settings.save()
		join_room.emit(settings.last_ip)
		set_status("conectando…"))
	row.add_child(go)
	_root.add_child(row)
	_root.add_child(_status)
	_back()

func _look() -> void:
	_title("Aparência", "corpo, cabelo e cor do cabelo")
	var look: Array = settings.look.duplicate()
	var names := ["Corpo", "Penteado", "Cor do cabelo"]
	var sizes := [Looks.BODY_COLORS.size(), Looks.HAIR_STYLES.size(), Looks.HAIR_COLORS.size()]
	for i in 3:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		var name_l := UiTheme.label(names[i], 17)
		name_l.custom_minimum_size = Vector2(150, 0)
		row.add_child(name_l)
		var value := UiTheme.label(_look_name(i, look[i]), 17, UiTheme.GOLD)
		value.custom_minimum_size = Vector2(130, 0)
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		for d in [-1, 1]:
			var b := UiTheme.style(Button.new(), Color(0.6, 0.7, 0.65), 17)
			b.text = "<" if d < 0 else ">"
			b.pressed.connect(func():
				look[i] = Looks.widx(look[i] + d, sizes[i])
				value.text = _look_name(i, look[i])
				settings.look = look.duplicate()
				settings.save()
				look_changed.emit(look))
			if d < 0:
				row.add_child(b)
				row.add_child(value)
			else:
				row.add_child(b)
		_root.add_child(row)
	_btn("Sortear", func():
		settings.look = Looks.roll_look(-1)
		settings.save()
		look_changed.emit(settings.look)
		show_page("look"), Color(0.9, 0.45, 0.8))
	_back()

func _look_name(kind: int, v: int) -> String:
	match kind:
		1: return Looks.HAIR_STYLES[Looks.widx(v, Looks.HAIR_STYLES.size())].name
		2: return Looks.HAIR_COLORS[Looks.widx(v, Looks.HAIR_COLORS.size())].name
		_: return Looks.BODY_COLORS[Looks.widx(v, Looks.BODY_COLORS.size())].name

func _options() -> void:
	_title("Gráficos e som", "o preset baixo roda em celular fraco sem perder o cenário")
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	for q in 4:
		var b := UiTheme.style(Button.new(),
			UiTheme.GOLD if q == settings.quality else Color(0.55, 0.62, 0.58), 17)
		b.text = QUALS[q]
		b.pressed.connect(func():
			settings.quality = q
			settings.save()
			quality_changed.emit(q)
			show_page("options"))
		row.add_child(b)
	_root.add_child(row)
	_root.add_child(UiTheme.label(
		"Trocar de preset reconstrói o cenário — leva um segundo.", 13,
		Color(1, 1, 1, 0.5)))
	_root.add_child(HSeparator.new())
	_root.add_child(UiTheme.label("Cenário", 22, UiTheme.GOLD))
	var srow := HBoxContainer.new()
	srow.add_theme_constant_override("separation", 8)
	for sc in SCENES:
		var sb := UiTheme.style(Button.new(),
			UiTheme.GOLD if sc[0] == settings.scene else Color(0.55, 0.62, 0.58), 17)
		sb.text = sc[1]
		sb.pressed.connect(func():
			settings.scene = sc[0]
			settings.save()
			quality_changed.emit(settings.quality)
			show_page("options"))
		srow.add_child(sb)
	_root.add_child(srow)
	_root.add_child(HSeparator.new())
	_root.add_child(UiTheme.label("Som", 22, UiTheme.GOLD))
	_slider("Música", Aud.music_vol, func(v): Aud.set_volume("music", v))
	_slider("Efeitos", Aud.sfx_vol, func(v): Aud.set_volume("sfx", v))
	_back()


func _slider(name: String, value: float, cb: Callable) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	var l := UiTheme.label(name, 16, Color(0.82, 0.88, 0.84))
	l.custom_minimum_size = Vector2(86, 0)
	row.add_child(l)
	var sl := HSlider.new()
	sl.min_value = 0.0
	sl.max_value = 1.0
	sl.step = 0.05
	sl.value = value
	sl.custom_minimum_size = Vector2(220, 28)
	sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sl.value_changed.connect(cb)
	row.add_child(sl)
	_root.add_child(row)

func _back() -> void:
	_root.add_child(HSeparator.new())
	_btn("Voltar", func(): show_page("main"), Color(0.6, 0.65, 0.62))

func set_status(t: String) -> void:
	_status.text = t
	if _status.get_parent() == null:
		_root.add_child(_status)

static func _local_ip() -> String:
	for a in IP.get_local_addresses():
		if a.begins_with("192.168.") or a.begins_with("10.") or a.begins_with("172."):
			return a
	return "127.0.0.1"
