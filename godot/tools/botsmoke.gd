extends SceneTree

func _initialize() -> void:
	for d in ["easy", "normal", "hard", "insane"]:
		var m := BVMatch.new("default", 7, BV.LEFT, true)
		var bl := Bot.new(BV.LEFT, d, 111)
		var br := Bot.new(BV.RIGHT, d, 222)
		var f := 0
		var t0 := Time.get_ticks_usec()
		while m.logic.winner == BV.NO_PLAYER and f < 60 * 60 * 8:
			m.step(bl.think(m), br.think(m))
			f += 1
		var ms := (Time.get_ticks_usec() - t0) / 1000.0
		print("%-7s %2d x %-2d  frames=%d  rallyBest=%d  %.0fms (%.3fms/frame)" % [
			d, m.logic.scores[0], m.logic.scores[1], f, m.logic.rally_best, ms, ms / maxf(1.0, f)])
	quit()
