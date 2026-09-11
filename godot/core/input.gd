class_name PlayerInput
extends RefCounted

var left := false
var right := false
var up := false
var special := false
var down := false

static func make(l := false, r := false, u := false, sp := false, d := false) -> PlayerInput:
	var i := PlayerInput.new()
	i.left = l
	i.right = r
	i.up = u
	i.special = sp
	i.down = d
	return i

func copy_from(o: PlayerInput) -> void:
	left = o.left
	right = o.right
	up = o.up
	special = o.special
	down = o.down

func pack() -> int:
	return (1 if left else 0) | (2 if right else 0) | (4 if up else 0) \
		| (8 if special else 0) | (16 if down else 0)

func unpack(b: int) -> void:
	left = (b & 1) != 0
	right = (b & 2) != 0
	up = (b & 4) != 0
	special = (b & 8) != 0
	down = (b & 16) != 0

static func from_bits(b: int) -> PlayerInput:
	var i := PlayerInput.new()
	i.unpack(b)
	return i

func clear() -> void:
	left = false
	right = false
	up = false
	special = false
	down = false
