extends SceneTree

const WATCH := {
	"especial": Ev.SPECIAL_FIRED, "acertou": Ev.SPECIAL_HIT, "parry": Ev.PARRY,
	"giro": Ev.SPIN, "giro_ok": Ev.SPIN_HIT, "tranco": Ev.STAGGER,
	"mergulho": Ev.DIVE_HIT, "smash": Ev.SMASH, "bloqueio": Ev.BLOCK,
	"cavada": Ev.DIG,
}

func _initialize() -> void:
	for d in ["easy", "normal", "hard", "insane"]:
		var m := BVMatch.new(MatchParams.classic("default", 7))
		var bl := Bot.new(BV.LEFT, d, 111)
		var br := Bot.new(BV.RIGHT, d, 222)
		var f := 0
		var tally := {}
		for k in WATCH:
			tally[k] = 0
		var rallies := 0
		var rsum := 0
		var prev_rally := 0
		var t0 := Time.get_ticks_usec()
		while m.logic.winner == BV.NO_PLAYER and f < 60 * 60 * 8:
			m.step([bl.think(m), br.think(m)])
			for k in m.events.n:
				for name in WATCH:
					if m.events.kind[k] == WATCH[name]:
						tally[name] += 1
			if m.logic.rally == 0 and prev_rally > 0:
				rallies += 1
				rsum += prev_rally
			prev_rally = m.logic.rally
			f += 1
		var ms := (Time.get_ticks_usec() - t0) / 1000.0
		var line := ""
		for k in WATCH:
			line += "%s=%d " % [k, tally[k]]
		print("%-7s %2d x %-2d frames=%d rally(med=%.1f max=%d) %.0fms" % [
			d, m.logic.scores[0], m.logic.scores[1], f,
			float(rsum) / maxf(1.0, rallies), m.logic.rally_best, ms])
		print("        ", line)
	quit()
