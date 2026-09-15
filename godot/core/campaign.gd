class_name Campaign
extends RefCounted

## THE HUNDRED: campeonato mundial. Cada nível é um país; o 100 é o Brasil.
## Tudo é determinístico a partir do número do nível.

const LAST := 100

const NATIONS := [
	{"c": "NZ", "p": "NIKAU", "n": "New Zealand", "b": "#1F2A44", "h": "#FFFFFF", "hs": 6, "v": 1.05,
		"say": ["Kia ora! I'll go easy... probably.", "More sheep than people, more spin than you.", "Sweet as. Sweet as!"],
		"win": ["That was sweet as, bro.", "Even the kiwis laughed at that."],
		"lose": ["Nah yeah nah... fair play.", "I blame the jet lag. Everything is far from here."]},
	{"c": "CA", "p": "GOOSE", "n": "Canada", "b": "#E4212F", "h": "#FFFFFF", "hs": 13, "v": 0.95,
		"say": ["Sorry in advance, eh.", "It's cold. Let's warm up with a loss for you.", "Maple syrup powered."],
		"win": ["Sorry! Sorry. Not sorry.", "Tim Hortons is on me."],
		"lose": ["Sorry, that was bad. Sorry.", "Ok you won, but we're still nicer."]},
	{"c": "MX", "p": "CHAMOY", "n": "Mexico", "b": "#0A8A3B", "h": "#CE1126", "hs": 12, "v": 1.1,
		"say": ["Vamos! Prepare for spice.", "This ball is hotter than my salsa.", "Ándale, ándale!"],
		"win": ["Tacos for the winner!", "Cinco de smash."],
		"lose": ["Ay caramba.", "Fine. Tacos for you. ONE taco."]},
	{"c": "SE", "p": "LAGOM", "n": "Sweden", "b": "#006AA7", "h": "#FECC02", "hs": 9, "v": 1.0,
		"say": ["I built this court myself. Took 11 hours.", "Lagom. Not too hard, not too soft.", "Fika after?"],
		"win": ["Some assembly required... for your ego.", "Still no fika for you."],
		"lose": ["Hmm. Missing one screw.", "I'll blame IKEA instructions."]},
	{"c": "IE", "p": "FINN", "n": "Ireland", "b": "#169B62", "h": "#FF883E", "hs": 3, "v": 1.0,
		"say": ["Luck o' the Irish, lad.", "I've had three pints. I'm better now.", "Grand, grand, grand."],
		"win": ["That's grand, that is.", "Potato power!"],
		"lose": ["Ah sure, look it.", "The luck ran out. Where's the pub?"]},
	{"c": "NL", "p": "STROOP", "n": "Netherlands", "b": "#FF7A00", "h": "#21468B", "hs": 9, "v": 1.0,
		"say": ["I biked here. Uphill. There are no hills.", "Below sea level, above your level.", "Very tall. Very orange."],
		"win": ["Cheese for everyone!", "Total volleyball."],
		"lose": ["My tulips wilted.", "You win. I'll bike home. Slowly."]},
	{"c": "PT", "p": "NATA", "n": "Portugal", "b": "#046A38", "h": "#DA291C", "hs": 7, "v": 1.0,
		"say": ["We discovered this sport. Probably.", "Pastel de nata and pain.", "SIIIUUUU."],
		"win": ["Ronaldo would be proud.", "Discovered: your weakness."],
		"lose": ["Saudade... for my lead.", "Ok, Brazil is better. Wait, no."]},
	{"c": "GR", "p": "FETA", "n": "Greece", "b": "#0D5EAF", "h": "#FFFFFF", "hs": 15, "v": 0.95,
		"say": ["Opa! We invented sports.", "Philosophy says: you lose.", "Break plates, not my serve."],
		"win": ["Opa! Zeus approves.", "Democracy voted: I win."],
		"lose": ["This is a Greek tragedy.", "Opa... in a sad way."]},
	{"c": "TR", "p": "LOKUM", "n": "Turkey", "b": "#E30A17", "h": "#FFFFFF", "hs": 16, "v": 1.0,
		"say": ["Tea? Sixteen cups? Then we play.", "Kebab fuel activated.", "Istanbul, not Constantinople."],
		"win": ["Çok güzel!", "The tea helped."],
		"lose": ["Too much tea.", "Ice cream trick next time."]},
	{"c": "AU", "p": "WOMBAT", "n": "Australia", "b": "#00843D", "h": "#FFCD00", "hs": 11, "v": 1.05, "boss": true,
		"say": ["G'day. Everything here can kill you. Including me.", "Upside down and still better.", "Crikey, a beginner."],
		"win": ["No worries, mate.", "That's not a smash. THIS is a smash."],
		"lose": ["Fair dinkum. You got me.", "A spider bit me. That's my excuse."]},
	{"c": "KR", "p": "SORI", "n": "South Korea", "b": "#CD2E3A", "h": "#0047A0", "hs": 7, "v": 1.1,
		"say": ["Skincare routine: 12 steps. Serve: 1 step.", "I practiced 20 hours. Yesterday.", "K-pop, K-smash."],
		"win": ["Daebak!", "Kimchi is fermented, and so is your defeat."],
		"lose": ["Aigoo...", "My idol group will hear about this."]},
	{"c": "ES", "p": "PACO", "n": "Spain", "b": "#AA151B", "h": "#F1BF00", "hs": 4, "v": 1.05,
		"say": ["After the siesta, the fiesta.", "Tiki-taka volleyball.", "Tapas before, tears after."],
		"win": ["Olé!", "Nobody expects the Spanish smash."],
		"lose": ["Time for siesta.", "Mañana. I'll win mañana."]},
	{"c": "FR", "p": "BRIE", "n": "France", "b": "#0055A4", "h": "#EF4135", "hs": 5, "v": 0.9,
		"say": ["I am on strike. Against you.", "Baguette. Cheese. Victory.", "Ohh la la, a challenger."],
		"win": ["C'est la vie.", "Magnifique. Now, wine."],
		"lose": ["Sacré bleu!", "I surrender. Traditionally."]},
	{"c": "PL", "p": "PIEROG", "n": "Poland", "b": "#DC143C", "h": "#FFFFFF", "hs": 1, "v": 1.0,
		"say": ["Pierogi before pain.", "We are ACTUALLY good at volleyball.", "Cannot into space. Can into smash."],
		"win": ["Kurczę! Too easy.", "Pierogi party."],
		"lose": ["No pierogi for me.", "Poland can into losing. Sometimes."]},
	{"c": "NG", "p": "JOLLOF", "n": "Nigeria", "b": "#008751", "h": "#FFFFFF", "hs": 2, "v": 1.1,
		"say": ["Jollof rice is ours. So is this match.", "No wahala.", "Naija no dey carry last!"],
		"win": ["Jollof supremacy!", "Chop knuckle, I win."],
		"lose": ["Ghana must have poisoned my jollof.", "Wahala dey."]},
	{"c": "DE", "p": "BLITZ", "n": "Germany", "b": "#000000", "h": "#FFCC00", "hs": 14, "v": 0.85, "boss": true,
		"say": ["Efficiency. Precision. No jokes.", "I arrived 20 minutes early.", "This is not a joke. Germans do not joke."],
		"win": ["As calculated.", "Sehr gut. Next."],
		"lose": ["This is... unexpected. Recalculating.", "The train was late. That is why."]},
	{"c": "GB", "p": "PIP", "n": "United Kingdom", "b": "#C8102E", "h": "#012169", "hs": 13, "v": 0.9,
		"say": ["Tea first. Then I shall thrash you.", "It's raining. It's always raining.", "Terribly sorry, old chap."],
		"win": ["Jolly good.", "Mind the gap. In your defense."],
		"lose": ["Right. Bit of a shambles.", "Blame the weather."]},
	{"c": "EG", "p": "SCARAB", "n": "Egypt", "b": "#C09300", "h": "#CE1126", "hs": 15, "v": 0.9, "boss": true,
		"say": ["I have 5000 years of experience.", "The pyramids were a warmup.", "Walk like an Egyptian. Lose like a tourist."],
		"win": ["Mummified.", "Another one for the tomb."],
		"lose": ["Cursed. Definitely cursed.", "The camel did it."]},
	{"c": "RU", "p": "MISHKA", "n": "Russia", "b": "#D52B1E", "h": "#0039A6", "hs": 14, "v": 0.8,
		"say": ["In Russia, ball hits YOU.", "Minus 40. Still training.", "Bear is my coach."],
		"win": ["Cheeki breeki.", "Vodka celebration."],
		"lose": ["Blyat.", "Bear is disappointed."]},
	{"c": "JP", "p": "MOCHI", "n": "Japan", "b": "#FFFFFF", "h": "#BC002D", "hs": 8, "v": 1.15, "boss": true,
		"say": ["Ganbatte! You will need it.", "This is my final form. Third of six.", "Sumimasen. I must win."],
		"win": ["Yatta!", "Bow. Then sushi."],
		"lose": ["Nani?!", "I have brought shame. Time for training arc."]},
	{"c": "IN", "p": "LADDU", "n": "India", "b": "#FF9933", "h": "#138808", "hs": 10, "v": 1.05, "boss": true,
		"say": ["Cricket taught me this. Somehow.", "Spicier than your best shot.", "Namaste. Prepare for a Bollywood ending."],
		"win": ["Chak de!", "A dance number for the winner."],
		"lose": ["Arre yaar!", "I'll retake this in the sequel."]},
	{"c": "CN", "p": "BAO", "n": "China", "b": "#DE2910", "h": "#FFDE00", "hs": 8, "v": 1.0,
		"say": ["Made in China. Built to win.", "The Great Wall of blocks.", "Dumplings before, dumplings after."],
		"win": ["Hao!", "Another gold."],
		"lose": ["Aiya!", "Impossible. I will study more."]},
	{"c": "US", "p": "DUKE", "n": "USA", "b": "#3C3B6E", "h": "#B22234", "hs": 12, "v": 1.0, "boss": true,
		"say": ["FREEDOM! And a 64oz soda.", "We call it VOLLEYBALL. World champions of ourselves.", "Everything is bigger here. Including me."],
		"win": ["USA! USA! USA!", "That's a touchdown. Wait, wrong sport."],
		"lose": ["This is un-American.", "I demand a recount!"]},
	{"c": "IT", "p": "GNOCCHI", "n": "Italy", "b": "#009246", "h": "#CE2B37", "hs": 3, "v": 1.05, "boss": true,
		"say": ["Mamma mia! Two of us, one of you.", "Pineapple on pizza? Now I'm angry.", "Hands. Talking. Always."],
		"win": ["Bellissimo!", "Nonna is proud."],
		"lose": ["Madonna...", "Fine. But your pasta is still overcooked."]},
	{"c": "IS", "p": "GEYSIR", "n": "Iceland", "b": "#02529C", "h": "#DC1E35", "hs": 4, "v": 0.85, "boss": true,
		"say": ["Everyone here is related. Hi, cousin.", "Volcano warm-up. Glacier cool-down.", "Huh! Huh! Huh!"],
		"win": ["Skál!", "Iceland: colder than your chances."],
		"lose": ["Þetta reddast.", "The elves are angry now."]},
	{"c": "AR", "p": "TANGO", "n": "Argentina", "b": "#75AADB", "h": "#FFFFFF", "hs": 9, "v": 1.1, "boss": true,
		"say": ["Messi is my cousin. Not really. But feel the pressure.", "Mate, dulce de leche, victory.", "Hand of Blob."],
		"win": ["Vamooos!", "Argentina campeón!"],
		"lose": ["Boludo...", "The referee is Brazilian. Obviously."]},
	{"c": "BR", "p": "CAPIVARA", "n": "Brazil", "b": "#009C3B", "h": "#FFDF00", "hs": 10, "v": 1.0, "boss": true,
		"say": ["Finally. The real final. Bem-vindo ao Brasil!", "Volleyball is our second religion. First is beach.", "Samba, açaí, and pain. In that order."],
		"win": ["É TETRA! Wait, which number is this?", "Brasil, sil, sil!"],
		"lose": ["7-1 flashbacks...", "Fine. You are the champion. Now come to the beach."]},
	{"c": "CO", "p": "AREPA", "n": "Colombia", "b": "#FCD116", "h": "#003893", "hs": 3, "v": 1.05,
		"say": ["Coffee is strong. So am I.", "Shakira taught me hips don't lie.", "Vamos, parce!"],
		"win": ["Qué chimba!", "Coffee break."],
		"lose": ["Ay no...", "Too little coffee."]},
	{"c": "ZA", "p": "BRAAI", "n": "South Africa", "b": "#007A4D", "h": "#FFB612", "hs": 0, "v": 0.95,
		"say": ["Braai after, whether you like it or not.", "Vuvuzela mode: ON.", "Howzit, my bru."],
		"win": ["Lekker!", "Bokke power."],
		"lose": ["Eish.", "Load shedding hit my legs."]},
	{"c": "CH", "p": "FONDUE", "n": "Switzerland", "b": "#DA291C", "h": "#FFFFFF", "hs": 13, "v": 0.9,
		"say": ["I am neutral. Except against you.", "Precision like a watch.", "Chocolate. Cheese. Cash."],
		"win": ["Like clockwork.", "Neutral, but victorious."],
		"lose": ["My watch says: rematch.", "Holes in my defense. Like cheese."]},
	{"c": "SA", "p": "KAHWA", "n": "Saudi Arabia", "b": "#006C35", "h": "#FFFFFF", "hs": 16, "v": 0.9,
		"say": ["I bought the whole league.", "Sand is my home court.", "Oil-powered."],
		"win": ["Mashallah.", "New stadium for this."],
		"lose": ["I will buy you next.", "Too hot today."]},
	{"c": "TH", "p": "MANGO", "n": "Thailand", "b": "#A51931", "h": "#2D2A4A", "hs": 7, "v": 1.1,
		"say": ["Sawasdee! Spicy level: Thai spicy.", "Muay Thai knee to the ball.", "Elephant approves."],
		"win": ["Mai pen rai!", "Pad thai party."],
		"lose": ["Ohh... too spicy.", "Not Thai spicy enough."]},
	{"c": "PE", "p": "LLAMA", "n": "Peru", "b": "#D91023", "h": "#FFFFFF", "hs": 14, "v": 1.0,
		"say": ["Machu Picchu altitude training.", "Ceviche fuel.", "Llama is watching."],
		"win": ["Arriba Perú!", "Llama spits on your defense."],
		"lose": ["Altitude sickness.", "The llama is disappointed."]},
	{"c": "NO", "p": "FJORD", "n": "Norway", "b": "#BA0C2F", "h": "#00205B", "hs": 12, "v": 0.85,
		"say": ["Born with skis. Learned volleyball later.", "Oil fund pays my coach.", "Fjord-level depth."],
		"win": ["Uff da!", "Winter Olympics of volleyball."],
		"lose": ["Too warm today.", "No snow, no win."]},
	{"c": "CU", "p": "MOJITO", "n": "Cuba", "b": "#002A8F", "h": "#CF142B", "hs": 2, "v": 1.05,
		"say": ["Old cars, new tricks.", "Salsa on the court.", "Cigar break after."],
		"win": ["Azúcar!", "Vintage victory."],
		"lose": ["Ay dios...", "The car broke down."]},
	{"c": "PH", "p": "HALO", "n": "Philippines", "b": "#0038A8", "h": "#CE1126", "hs": 6, "v": 1.1,
		"say": ["Karaoke champion. Volley champion.", "Adobo powered.", "Jollibee is my sponsor."],
		"win": ["Mabuhay!", "Karaoke celebration!"],
		"lose": ["Naku...", "I'll sing about this loss."]},
	{"c": "VN", "p": "PHO", "n": "Vietnam", "b": "#DA251D", "h": "#FFFF00", "hs": 13, "v": 1.1,
		"say": ["Pho-nomenal defense.", "Motorbike reflexes.", "Bánh mì fuel."],
		"win": ["Pho real!", "Motorbike speed."],
		"lose": ["Trời ơi!", "Traffic jam in my legs."]},
	{"c": "KE", "p": "TWIGA", "n": "Kenya", "b": "#BB0000", "h": "#006600", "hs": 0, "v": 1.05,
		"say": ["I ran here. From Nairobi.", "Marathon stamina.", "Hakuna matata... for me."],
		"win": ["Harambee!", "Marathon of points."],
		"lose": ["Pole pole.", "Sprinting is not my thing."]},
	{"c": "UA", "p": "BORSCH", "n": "Ukraine", "b": "#0057B7", "h": "#FFD700", "hs": 2, "v": 1.0,
		"say": ["Borscht power. Real borscht.", "Sunflower energy.", "Slava volleyball!"],
		"win": ["Dobre!", "Borscht for the winner."],
		"lose": ["Oy...", "Needs more borscht."]},
]

const STYLE_HAIR := ["careca", "espeto", "moicano", "cachos", "black", "cuia", "rabo", "franja",
	"coque", "longo", "antenas", "chama", "bone", "chapeu", "gorro", "coroa", "bandana"]

## Ordem determinística: chefes a cada 10, resto embaralhado por nível.
static func nation_index(level: int) -> int:
	var bosses := {10: "AU", 20: "DE", 30: "JP", 40: "IT", 50: "US", 60: "EG", 70: "IS", 80: "IN", 90: "AR", 100: "BR"}
	if bosses.has(level):
		return _find(bosses[level])
	var pool: Array = []
	for i in NATIONS.size():
		if not NATIONS[i].get("boss", false):
			pool.append(i)
	var r := RandomNumberGenerator.new()
	r.seed = 9127
	for i in range(pool.size() - 1, 0, -1):
		var j := r.randi_range(0, i)
		var t = pool[i]
		pool[i] = pool[j]
		pool[j] = t
	var slot := level - 1 - int((level - 1) / 10)
	return pool[slot % pool.size()]


static func _find(code: String) -> int:
	for i in NATIONS.size():
		if NATIONS[i].c == code:
			return i
	return 0


static func nation(level: int) -> Dictionary:
	return NATIONS[nation_index(level)]


static func look_of(nat: Dictionary) -> Array:
	return [Color(nat.b), int(nat.hs), Color(nat.h)]


static func is_boss(level: int) -> bool:
	return level % 10 == 0


## Habilidade contínua 0..3.6: nível 1 é abaixo do easy, 100 acima do insane.
static func skill(level: int) -> float:
	var t := float(level - 1) / float(LAST - 1)
	var k := 3.6 * pow(t, 1.35)
	if is_boss(level):
		k += 0.25
	return clampf(k, 0.0, 3.6)


const MODS := {
	"giant": {"min": 8, "name": "Giant foe", "icon": "🦖"},
	"low_net": {"min": 10, "name": "Low net", "icon": "🪢"},
	"wide": {"min": 12, "name": "Wide court", "icon": "↔️"},
	"moon": {"min": 15, "name": "Moon gravity", "icon": "🌙"},
	"balloon": {"min": 18, "name": "Balloon ball", "icon": "🎈"},
	"tiny": {"min": 20, "name": "Tiny you", "icon": "🐜"},
	"wind": {"min": 22, "name": "Wind", "icon": "💨"},
	"bowling": {"min": 25, "name": "Bowling ball", "icon": "🎳"},
	"high_net": {"min": 28, "name": "High net", "icon": "🧱"},
	"narrow": {"min": 30, "name": "Narrow court", "icon": "↕️"},
	"speedy": {"min": 33, "name": "Speedy foe", "icon": "⚡"},
	"pea": {"min": 35, "name": "Pea ball", "icon": "🫛"},
	"no_walls": {"min": 38, "name": "No walls", "icon": "🚪"},
	"doubles": {"min": 40, "name": "Doubles", "icon": "👥"},
	"ice": {"min": 45, "name": "Ice floor", "icon": "🧊"},
	"one_touch": {"min": 48, "name": "One touch", "icon": "☝️"},
	"heavy": {"min": 50, "name": "Heavy gravity", "icon": "🪨"},
	"slow": {"min": 55, "name": "Slow you", "icon": "🐌"},
	"dark": {"min": 60, "name": "Lights out", "icon": "🌑"},
	"triples": {"min": 75, "name": "Triples", "icon": "👨‍👩‍👧"},
}

const BOSS_MODS := {
	10: ["giant"], 20: ["low_net", "speedy"], 30: ["speedy", "wind"], 40: ["doubles"],
	50: ["giant", "bowling"], 60: ["dark", "pea"], 70: ["ice", "moon"], 80: ["doubles", "wide", "balloon"],
	90: ["speedy", "narrow", "no_walls"], 100: ["triples", "giant", "tiny", "dark", "wind", "bowling"],
}

const CONFLICTS := [["giant", "tiny"], ["low_net", "high_net"], ["wide", "narrow"], ["moon", "heavy"],
	["balloon", "bowling"], ["balloon", "pea"], ["bowling", "pea"], ["doubles", "triples"]]


static func mods_of(level: int) -> Array:
	if BOSS_MODS.has(level):
		return BOSS_MODS[level]
	var r := RandomNumberGenerator.new()
	r.seed = 4400 + level * 31
	var count := 0
	if level >= 8:
		count = 1
	if level >= 30:
		count = 1 + int(r.randf() < 0.6)
	if level >= 55:
		count = 2 + int(r.randf() < 0.5)
	if level >= 85:
		count = 3
	if level < 8 or (level < 30 and r.randf() < 0.35):
		return []
	var avail: Array = []
	for k in MODS:
		if level >= int(MODS[k].min):
			avail.append(k)
	var out: Array = []
	var guard := 0
	while out.size() < count and guard < 40:
		guard += 1
		var m: String = avail[r.randi_range(0, avail.size() - 1)]
		if m in out:
			continue
		var ok := true
		for c in CONFLICTS:
			if m in c and (c[0] in out or c[1] in out):
				ok = false
		if ok:
			out.append(m)
	return out


static func rule_of(level: int) -> Dictionary:
	var r := RandomNumberGenerator.new()
	r.seed = 777 + level * 13
	var out := {"stw": 5, "two_ahead": false, "lead_by": 0, "name": "First to 5"}
	if level <= 3:
		out = {"stw": 3, "two_ahead": false, "lead_by": 0, "name": "First to 3"}
	elif level < 15:
		out = {"stw": 5, "two_ahead": false, "lead_by": 0, "name": "First to 5"}
	else:
		var roll := r.randf()
		if roll < 0.45:
			var n := 5 + int(r.randf() * 3.0)
			out = {"stw": n, "two_ahead": false, "lead_by": 0, "name": "First to %d" % n}
		elif roll < 0.75:
			var n2 := 5 + int(r.randf() * 3.0)
			out = {"stw": n2, "two_ahead": true, "lead_by": 0, "name": "First to %d, win by 2" % n2}
		else:
			var lb := 3 + int(r.randf() * 2.0)
			out = {"stw": 99, "two_ahead": false, "lead_by": lb, "name": "Lead by %d" % lb}
	if is_boss(level):
		out = {"stw": 7, "two_ahead": true, "lead_by": 0, "name": "First to 7, win by 2"}
	if level == LAST:
		out = {"stw": 10, "two_ahead": true, "lead_by": 0, "name": "First to 10, win by 2"}
	return out


## Monta os parâmetros da partida do nível. Lado 0 é o jogador.
static func params(level: int) -> MatchParams:
	var p := MatchParams.new()
	var mods := mods_of(level)
	var rule := rule_of(level)
	p.stw = int(rule.stw)
	p.two_ahead = bool(rule.two_ahead)
	p.lead_by = int(rule.lead_by)
	for m in mods:
		match m:
			"giant":
				p.blob_scale[1] = 1.5
			"tiny":
				p.blob_scale[0] = 0.7
			"low_net":
				p.net_h = 0.75
			"high_net":
				p.net_h = 1.3
			"wide":
				p.court_w = BV.RIGHT_PLANE * 1.3
			"narrow":
				p.court_w = BV.RIGHT_PLANE * 0.75
			"moon":
				p.gravity = 0.55
			"heavy":
				p.gravity = 1.45
			"balloon":
				p.ball_kind = "balloon"
				p.ball_r = BV.BALL_RADIUS * 1.6
				p.ball_g = 0.4
				p.ball_bounce = 0.7
			"bowling":
				p.ball_kind = "bowling"
				p.ball_r = BV.BALL_RADIUS * 1.15
				p.ball_g = 1.8
				p.ball_hit = 0.85
			"pea":
				p.ball_kind = "pea"
				p.ball_r = BV.BALL_RADIUS * 0.55
				p.ball_hit = 1.15
			"wind":
				p.wind = 0.05 if level % 2 == 0 else -0.05
			"speedy":
				p.blob_speed[1] = 1.3
				p.blob_jump[1] = 1.12
			"slow":
				p.blob_speed[0] = 0.75
			"no_walls":
				p.walls = false
			"doubles":
				p.per_side[1] = 2
			"triples":
				p.per_side[1] = 3
			"ice":
				p.ice = 1.0
			"one_touch":
				p.touches = 1
			"dark":
				p.dark = true
	return p


static func level_info(level: int) -> Dictionary:
	var nat := nation(level)
	var mods := mods_of(level)
	var names: Array = []
	for m in mods:
		names.append(MODS[m].name)
	return {"level": level, "nation": nat, "mods": mods, "mod_names": names,
		"rule": rule_of(level).name, "boss": is_boss(level), "skill": skill(level)}


static func line(nat: Dictionary, kind: String, seed: int) -> String:
	var arr: Array = nat.get(kind, ["..."])
	return arr[absi(seed) % arr.size()]
