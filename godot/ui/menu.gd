class_name Menu
extends Control

## Menu em cima da partida de demonstração: o cenário continua rodando atrás,
## que é o melhor cartão de visita que esse jogo tem. Layout de tela cheia:
## título e lista à esquerda, painel de conteúdo à direita quando a página
## precisa (cenários, torres, avatar).

signal play_bot(difficulty: String, scene: String)
signal play_local(scene: String)
signal play_arcade(tower: int)
signal host_room()
signal join_room(address: String)
signal quality_changed(q: int)
signal look_changed(look: Array)
signal quit_game()

const DIFFS := [["easy", "Fácil", "bola lenta, bot distraído"], ["normal", "Normal", "o bot joga direito"],
	["hard", "Difícil", "prevê a bola e usa especial"], ["insane", "Insano", "simula a física igual a você"]]
const QUALS := ["Baixo", "Médio", "Alto", "Máximo"]
const SCENES := [
	["selva", "Selva"], ["praia", "Praia ao pôr do sol"], ["galpao", "Galpão"],
	["acampamento", "Acampamento"], ["neve", "Pinhal nevado"], ["telhado", "Telhado"],
	["ruinas", "Ruínas"], ["caverna", "Caverna de lava"]]
const MUTED := Color(1, 1, 1, 0.55)

var settings: Settings

var _left: VBoxContainer
var _list: VBoxContainer
var _side: Control
var _side_box: VBoxContainer
var _eyebrow: Label
var _heading: Label
var _sub: Label
var _foot_l: Label
var _foot_r: Label
var _page := "main"
var _status: Label
var _ip_edit: LineEdit
var _pending: Callable
var _stage_cb: Callable
var _first: Control

func build(s: Settings) -> void:
	settings = s
	set_anchors_preset(Control.PRESET_FULL_RECT)

	var shade := TextureRect.new()
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.texture = _gradient([Color(0.01, 0.02, 0.02, 0.94), Color(0.01, 0.02, 0.02, 0.78),
		Color(0.01, 0.02, 0.02, 0.18)], [0.0, 0.42, 1.0], Vector2(0, 0), Vector2(1, 0))
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shade.stretch_mode = TextureRect.STRETCH_SCALE
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	var vig := TextureRect.new()
	vig.set_anchors_preset(Control.PRESET_FULL_RECT)
	vig.texture = _gradient([Color(0, 0, 0, 0.0), Color(0, 0, 0, 0.55)], [0.72, 1.0],
		Vector2(0, 0), Vector2(0, 1))
	vig.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	vig.stretch_mode = TextureRect.STRETCH_SCALE
	vig.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(vig)

	_left = VBoxContainer.new()
	_left.set_anchors_preset(Control.PRESET_LEFT_WIDE)
	_left.offset_left = 72
	_left.offset_top = 48
	_left.offset_right = 72 + 470
	_left.offset_bottom = -64
	_left.add_theme_constant_override("separation", 6)
	add_child(_left)

	_eyebrow = UiTheme.eyebrow("")
	_left.add_child(_eyebrow)
	_heading = UiTheme.heading("")
	_left.add_child(_heading)
	var rule := ColorRect.new()
	rule.color = UiTheme.GOLD
	rule.custom_minimum_size = Vector2(56, 3)
	rule.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_left.add_child(rule)
	_sub = UiTheme.label("", 15, MUTED)
	_sub.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_left.add_child(_sub)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 8)
	_left.add_child(gap)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", 2)
	_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_left.add_child(_list)

	_side = MarginContainer.new()
	_side.set_anchors_preset(Control.PRESET_RIGHT_WIDE)
	_side.offset_left = -790
	_side.offset_right = -56
	_side.offset_top = 48
	_side.offset_bottom = -64
	_side.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_side)
	_side_box = VBoxContainer.new()
	_side_box.alignment = BoxContainer.ALIGNMENT_CENTER
	_side_box.size_flags_horizontal = Control.SIZE_SHRINK_END
	_side_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_side.add_child(_side_box)

	_foot_l = UiTheme.eyebrow("", MUTED, 12)
	_foot_l.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_foot_l.offset_left = 72
	_foot_l.offset_top = -40
	_foot_l.offset_right = 700
	_foot_l.offset_bottom = -22
	add_child(_foot_l)
	_foot_r = UiTheme.eyebrow("Blobby Selva  ·  0.2", MUTED, 12)
	_foot_r.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_foot_r.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_foot_r.offset_left = -600
	_foot_r.offset_right = -56
	_foot_r.offset_top = -40
	_foot_r.offset_bottom = -22
	add_child(_foot_r)

	_status = UiTheme.label("", 15, MUTED)
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	show_page("main")

static func _gradient(cols: Array, offs: Array, from: Vector2, to: Vector2) -> GradientTexture2D:
	var gr := Gradient.new()
	gr.offsets = PackedFloat32Array(offs)
	gr.colors = PackedColorArray(cols)
	var g := GradientTexture2D.new()
	g.gradient = gr
	g.width = 256
	g.height = 256
	g.fill_from = from
	g.fill_to = to
	return g

func show_page(p: String) -> void:
	_page = p
	_first = null
	for c in _list.get_children():
		_list.remove_child(c)
		if c != _status:
			c.queue_free()
	for c in _side_box.get_children():
		_side_box.remove_child(c)
		c.queue_free()
	_sub.text = ""
	_side.offset_left = -790
	_foot_l.text = "Enter confirma   ·   Esc volta" if p != "main" else "Enter confirma"
	match p:
		"main": _main()
		"single": _single()
		"bot": _bot()
		"stage": _stage()
		"arcade": _arcade()
		"register": _register()
		"net": _net()
		"look": _look()
		"options": _options()
	_animate()
	if _first != null:
		_first.grab_focus()

func _animate() -> void:
	for n in [_left, _side]:
		n.modulate.a = 0.0
		var base: float = 72.0 if n == _left else size.x + _side.offset_left
		n.position.x = base + (-28.0 if n == _left else 28.0)
		var tw := create_tween().set_parallel(true).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
		tw.tween_property(n, "modulate:a", 1.0, 0.22)
		tw.tween_property(n, "position:x", base, 0.3)

func _title(text: String, eyebrow := "Blobby Selva", sub := "") -> void:
	_heading.text = text.to_upper()
	_eyebrow.text = eyebrow.to_upper()
	_sub.text = sub

func _btn(text: String, cb: Callable, sub := "", col := UiTheme.GOLD) -> Button:
	var b := UiTheme.item(Button.new(), col)
	b.text = text
	b.pressed.connect(cb)
	_list.add_child(b)
	if sub != "":
		var l := UiTheme.label(sub, 13, MUTED)
		l.add_theme_constant_override("outline_size", 3)
		var m := MarginContainer.new()
		m.add_theme_constant_override("margin_left", 26)
		m.add_theme_constant_override("margin_bottom", 4)
		m.add_theme_constant_override("margin_top", -8)
		m.add_child(l)
		_list.add_child(m)
	if _first == null:
		_first = b
	return b

func _spacer(h := 12) -> void:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	_list.add_child(c)

## Tudo que é partida passa por aqui: sem nome e cara registrados, primeiro
## o cadastro, depois o que a pessoa queria.
func _gate(then: Callable) -> void:
	if settings.player_name.strip_edges() == "":
		_pending = then
		show_page("register")
	else:
		then.call()

func _main() -> void:
	_title("Blobby\nSelva", "vôlei de praia no meio do mato")
	_heading.add_theme_font_size_override("font_size", 58)
	if settings.player_name != "":
		_sub.text = "olá, %s" % settings.player_name
	_btn("Um jogador", func(): _gate(func(): show_page("single")), "arcade ou uma partida contra o bot")
	_btn("Dois jogadores", func(): _gate(func():
		_stage_cb = func(sc): play_local.emit(sc)
		show_page("stage")), "no mesmo teclado", UiTheme.LEAF)
	_btn("Online", func(): _gate(func(): show_page("net")), "IP direto, sem conta", Color(0.36, 0.72, 1.0))
	_spacer()
	_btn("Nome e aparência", func(): show_page("look"), "", Color(0.9, 0.45, 0.8))
	_btn("Gráficos e som", func(): show_page("options"), "", Color(0.7, 0.75, 0.8))
	if OS.get_name() != "Web":
		_btn("Sair", func(): quit_game.emit(), "", Color(0.8, 0.35, 0.3))
	_side_hero()

## Página inicial: o seu blob grande à direita, como capa.
func _side_hero() -> void:
	if settings.player_name == "":
		return
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_theme_constant_override("separation", 2)
	var pr := Portrait.new(settings.look, "smug", 300, BV.LEFT)
	v.add_child(pr)
	var n := UiTheme.eyebrow(settings.player_name, Looks.body_color(settings.look).lightened(0.35), 16)
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(n)
	var done := 0
	for t in Roster.TOWERS.size():
		if settings.towers[t] >= Roster.TOWERS[t].steps.size():
			done += 1
	var s := UiTheme.label("%d de %d torres" % [done, Roster.TOWERS.size()], 13, MUTED)
	s.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(s)
	_side_box.add_child(v)

func _single() -> void:
	_heading.add_theme_font_size_override("font_size", 52)
	_title("Um jogador")
	_btn("Arcade", func(): show_page("arcade"),
		"suba a torre: oito personagens, cada um no seu cenário", Color(1.0, 0.55, 0.25))
	_btn("Versus o bot", func(): show_page("bot"), "uma partida só, no cenário que você escolher")
	_spacer()
	_back()

func _bot() -> void:
	_heading.add_theme_font_size_override("font_size", 52)
	_title("Versus o bot", "um jogador")
	for d in DIFFS:
		_btn(d[1], func():
			_stage_cb = func(sc): play_bot.emit(d[0], sc)
			show_page("stage"), d[2])
	_spacer()
	_back("single")

func _stage() -> void:
	_heading.add_theme_font_size_override("font_size", 52)
	_title("Cenário", "escolha", "cada cenário é a casa de alguém")
	_btn("Aleatório", func():
		var sc: Array = SCENES[randi() % SCENES.size()]
		_pick_scene(sc[0]), "", Color(0.7, 0.75, 0.8))
	_spacer()
	_back("single")
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 10)
	for sc in SCENES:
		grid.add_child(_scene_card(sc))
	_side_box.add_child(grid)
	_first = grid.get_child(0)
	for k in SCENES.size():
		if SCENES[k][0] == settings.scene:
			_first = grid.get_child(k)

func _pick_scene(id: String) -> void:
	settings.scene = id
	settings.save()
	_stage_cb.call(id)

## Cartão de cenário: faixa na cor do dono, retrato e nome.
func _scene_card(sc: Array) -> Button:
	var ch := Roster.scene_char(sc[0])
	var col := Looks.body_color(ch.look) if not ch.is_empty() else UiTheme.GOLD
	var b := Button.new()
	b.custom_minimum_size = Vector2(172, 210)
	b.focus_mode = Control.FOCUS_ALL
	for k in 3:
		var s := StyleBoxFlat.new()
		s.bg_color = Color(0.03, 0.05, 0.05, [0.78, 0.9, 0.95][k])
		s.border_color = col if k > 0 else Color(1, 1, 1, 0.10)
		s.set_border_width_all(2 if k > 0 else 1)
		s.set_corner_radius_all(6)
		s.set_content_margin_all(0)
		b.add_theme_stylebox_override(["normal", "hover", "pressed"][k], s)
		if k == 1:
			b.add_theme_stylebox_override("focus", s)
	b.pressed.connect(func(): _pick_scene(sc[0]))
	var v := VBoxContainer.new()
	v.set_anchors_preset(Control.PRESET_FULL_RECT)
	v.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_theme_constant_override("separation", 0)
	var band := ColorRect.new()
	band.color = col
	band.custom_minimum_size = Vector2(0, 6)
	band.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(band)
	if not ch.is_empty():
		var pr := Portrait.new(ch.look, ch.mood, 124, BV.LEFT)
		pr.mouse_filter = Control.MOUSE_FILTER_IGNORE
		pr.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		v.add_child(pr)
	var n := UiTheme.label(sc[1], 16, Color(1, 1, 1, 0.95))
	n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	n.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	n.add_theme_font_override("font", UiTheme.font(0.6, 0))
	n.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(n)
	var o := UiTheme.eyebrow("casa de " + ch.name if not ch.is_empty() else "", col.lightened(0.35), 11)
	o.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	o.mouse_filter = Control.MOUSE_FILTER_IGNORE
	v.add_child(o)
	var pad := Control.new()
	pad.custom_minimum_size = Vector2(0, 8)
	v.add_child(pad)
	b.add_child(v)
	return b

## Torres do arcade: a coluna sobe do primeiro adversário ao chefe. Quanto
## mais alta a torre, mais gente e mais forte no fim.
func _arcade() -> void:
	_heading.add_theme_font_size_override("font_size", 46)
	_title("Choose your\ndestiny", "arcade", "vença cada adversário na casa dele até o topo")
	_side.offset_left = -840
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_END
	row.add_theme_constant_override("separation", 18)
	for t in Roster.TOWERS.size():
		var tw: Dictionary = Roster.TOWERS[t]
		var tcol: Color = [UiTheme.LEAF, UiTheme.GOLD, Color(1.0, 0.45, 0.3)][t]
		var col := VBoxContainer.new()
		col.alignment = BoxContainer.ALIGNMENT_END
		col.add_theme_constant_override("separation", 3)
		col.size_flags_vertical = Control.SIZE_SHRINK_END
		var steps: Array = tw.steps
		var done: int = settings.towers[t]
		for k in range(steps.size() - 1, -1, -1):
			var ch: Dictionary = Roster.CHARS[steps[k]]
			var ccol := Looks.body_color(ch.look)
			var cell := PanelContainer.new()
			var beaten := k < done
			var sb := StyleBoxFlat.new()
			sb.bg_color = Color(0.03, 0.05, 0.05, 0.82) if not beaten else Color(0.12, 0.22, 0.12, 0.85)
			sb.border_color = ccol if k == done else Color(1, 1, 1, 0.10)
			sb.set_border_width_all(2 if k == done else 1)
			sb.set_corner_radius_all(4)
			sb.content_margin_left = 4
			sb.content_margin_right = 10
			sb.content_margin_top = 2
			sb.content_margin_bottom = 2
			cell.add_theme_stylebox_override("panel", sb)
			cell.custom_minimum_size = Vector2(190, 0)
			var hb := HBoxContainer.new()
			hb.add_theme_constant_override("separation", 8)
			var pr := Portrait.new(ch.look, ch.mood, 44, BV.RIGHT)
			hb.add_child(pr)
			var nv := VBoxContainer.new()
			nv.add_theme_constant_override("separation", -2)
			nv.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var nl := UiTheme.label(ch.name, 15, ccol.lightened(0.35))
			nl.add_theme_font_override("font", UiTheme.font(0.6, 1))
			nv.add_child(nl)
			var sl := UiTheme.label(("✓ vencido" if beaten else ("próximo" if k == done else str(k + 1) + "º")), 11, MUTED)
			nv.add_child(sl)
			hb.add_child(nv)
			cell.add_child(hb)
			col.add_child(cell)
		var b := UiTheme.solid(Button.new(), tcol, 16)
		b.text = tw.name.to_upper() + ("  ✓" if done >= steps.size() else "")
		b.pressed.connect(func(): play_arcade.emit(t))
		col.add_child(b)
		row.add_child(col)
		if t == 0:
			_first = b
	_side_box.add_child(row)
	_spacer()
	_back("single")

func _register() -> void:
	_heading.add_theme_font_size_override("font_size", 52)
	_title("Quem é você?", "cadastro", "nome e cara aparecem na torre e no placar")
	_look_editor()
	_btn("Pronto", func():
		if settings.player_name.strip_edges() == "":
			settings.player_name = "Blob"
		settings.save()
		if _pending.is_valid():
			var p := _pending
			_pending = Callable()
			p.call()
		else:
			show_page("main"), "", UiTheme.LEAF)
	_back()

func _look() -> void:
	_heading.add_theme_font_size_override("font_size", 52)
	_title("Nome e\naparência", "perfil", "corpo, penteado e cor do cabelo")
	_look_editor()
	_spacer()
	_back()

func _look_editor() -> void:
	var ne := UiTheme.line_edit(LineEdit.new(), 22)
	ne.placeholder_text = "seu nome"
	ne.max_length = 12
	ne.text = settings.player_name
	ne.custom_minimum_size = Vector2(300, 0)
	ne.text_changed.connect(func(t): settings.player_name = t.strip_edges())
	var nm := MarginContainer.new()
	nm.add_theme_constant_override("margin_left", 22)
	nm.add_theme_constant_override("margin_bottom", 10)
	nm.add_child(ne)
	_list.add_child(nm)
	_first = ne
	var pr := Portrait.new(settings.look, "smug", 320, BV.LEFT)
	var look: Array = settings.look.duplicate()
	var names := ["Corpo", "Penteado", "Cor"]
	var sizes := [Looks.BODY_COLORS.size(), Looks.HAIR_STYLES.size(), Looks.HAIR_COLORS.size()]
	for i in 3:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		var m := MarginContainer.new()
		m.add_theme_constant_override("margin_left", 22)
		var name_l := UiTheme.eyebrow(names[i], MUTED, 12)
		name_l.custom_minimum_size = Vector2(96, 0)
		name_l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(name_l)
		var value := UiTheme.label(_look_name(i, look[i]), 17, Color(1, 1, 1, 0.95))
		value.add_theme_font_override("font", UiTheme.font(0.5, 0))
		value.custom_minimum_size = Vector2(150, 0)
		value.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		value.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		for d in [-1, 1]:
			var b := UiTheme.chip(Button.new(), false, 15)
			b.text = "‹" if d < 0 else "›"
			b.pressed.connect(func():
				look[i] = Looks.widx(look[i] + d, sizes[i])
				value.text = _look_name(i, look[i])
				settings.look = look.duplicate()
				settings.save()
				pr.set_look(look)
				look_changed.emit(look))
			if d < 0:
				row.add_child(b)
				row.add_child(value)
			else:
				row.add_child(b)
		m.add_child(row)
		_list.add_child(m)
	var roll := UiTheme.item(Button.new(), Color(0.9, 0.45, 0.8), 18)
	roll.text = "Sortear"
	roll.pressed.connect(func():
		settings.look = Looks.roll_look(-1)
		settings.save()
		look_changed.emit(settings.look)
		show_page(_page))
	_list.add_child(roll)
	_spacer(6)
	var v := VBoxContainer.new()
	v.alignment = BoxContainer.ALIGNMENT_CENTER
	v.add_child(pr)
	_side_box.add_child(v)

func _look_name(kind: int, v: int) -> String:
	match kind:
		1: return Looks.HAIR_STYLES[Looks.widx(v, Looks.HAIR_STYLES.size())].name
		2: return Looks.HAIR_COLORS[Looks.widx(v, Looks.HAIR_COLORS.size())].name
		_: return Looks.BODY_COLORS[Looks.widx(v, Looks.BODY_COLORS.size())].name

func _net() -> void:
	_heading.add_theme_font_size_override("font_size", 52)
	_title("Online", "rede local", "IP direto, sem conta e sem servidor no meio")
	_btn("Criar sala", func():
		host_room.emit()
		set_status("esperando o outro jogador entrar em %s:%d" % [_local_ip(), NetLink.PORT]),
		"o outro entra pelo seu IP", Color(0.36, 0.72, 1.0))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", 22)
	m.add_theme_constant_override("margin_top", 6)
	_ip_edit = UiTheme.line_edit(LineEdit.new(), 18)
	_ip_edit.placeholder_text = "192.168.0.10"
	_ip_edit.text = settings.last_ip
	_ip_edit.custom_minimum_size = Vector2(240, 0)
	row.add_child(_ip_edit)
	var go := UiTheme.solid(Button.new(), Color(0.36, 0.72, 1.0), 15)
	go.text = "ENTRAR"
	go.pressed.connect(func():
		settings.last_ip = _ip_edit.text.strip_edges()
		settings.save()
		join_room.emit(settings.last_ip)
		set_status("conectando…"))
	row.add_child(go)
	m.add_child(row)
	_list.add_child(m)
	var sm := MarginContainer.new()
	sm.add_theme_constant_override("margin_left", 22)
	sm.add_theme_constant_override("margin_top", 8)
	sm.add_child(_status)
	_list.add_child(sm)
	_spacer()
	_back()

func _options() -> void:
	_heading.add_theme_font_size_override("font_size", 52)
	_title("Gráficos\ne som", "opções")
	var m := MarginContainer.new()
	m.add_theme_constant_override("margin_left", 22)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	v.add_child(UiTheme.eyebrow("Qualidade", MUTED, 12))
	v.add_child(quality_row(settings, func(q):
		quality_changed.emit(q)
		show_page("options")))
	v.add_child(UiTheme.label("o preset baixo roda em celular fraco sem perder o cenário", 13, MUTED))
	var g := Control.new()
	g.custom_minimum_size = Vector2(0, 10)
	v.add_child(g)
	v.add_child(UiTheme.eyebrow("Som", MUTED, 12))
	v.add_child(slider("Música", Aud.music_vol, func(x): Aud.set_volume("music", x)))
	v.add_child(slider("Efeitos", Aud.sfx_vol, func(x): Aud.set_volume("sfx", x)))
	m.add_child(v)
	_list.add_child(m)
	_spacer()
	_back()

static func quality_row(s: Settings, cb: Callable) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	for q in 4:
		var b := UiTheme.chip(Button.new(), q == s.quality)
		b.text = QUALS[q]
		b.pressed.connect(func():
			s.quality = q
			s.save()
			cb.call(q))
		row.add_child(b)
	return row

static func slider(name: String, value: float, cb: Callable) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	var l := UiTheme.label(name, 15, Color(1, 1, 1, 0.85))
	l.custom_minimum_size = Vector2(78, 0)
	l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(l)
	var sl := HSlider.new()
	sl.min_value = 0.0
	sl.max_value = 1.0
	sl.step = 0.05
	sl.value = value
	sl.custom_minimum_size = Vector2(230, 24)
	sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	UiTheme.slider_style(sl)
	sl.value_changed.connect(cb)
	row.add_child(sl)
	return row

func _back(to := "main") -> void:
	_btn("Voltar", func(): show_page(to), "", Color(0.6, 0.65, 0.62))

func set_status(t: String) -> void:
	_status.text = t

static func _local_ip() -> String:
	for a in IP.get_local_addresses():
		if a.begins_with("192.168.") or a.begins_with("10.") or a.begins_with("172."):
			return a
	return "127.0.0.1"
