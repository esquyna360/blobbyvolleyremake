"""Rasteriza os emojis do jogo em PNG.

Roda só no Mac, na mão, quando a lista muda: o Android não tem a fonte de
emoji colorido da Apple, então o glifo tem que viajar junto como imagem.
"""
import AppKit, Quartz, os, sys

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "emoji")
SIZE = 256
EMOJI = {"laugh": "\U0001F923", "cry": "\U0001F62D", "rage": "\U0001F92C",
         "finger": "\U0001F595", "taunt": "\U0001F61C"}

os.makedirs(OUT, exist_ok=True)
font = AppKit.NSFont.fontWithName_size_("Apple Color Emoji", SIZE * 0.78)
if font is None:
    sys.exit("Apple Color Emoji não encontrada")

for key, glyph in EMOJI.items():
    img = AppKit.NSImage.alloc().initWithSize_(AppKit.NSMakeSize(SIZE, SIZE))
    img.lockFocus()
    AppKit.NSColor.clearColor().set()
    AppKit.NSRectFill(AppKit.NSMakeRect(0, 0, SIZE, SIZE))
    s = AppKit.NSString.stringWithString_(glyph)
    attrs = {AppKit.NSFontAttributeName: font}
    sz = s.sizeWithAttributes_(attrs)
    s.drawAtPoint_withAttributes_(
        AppKit.NSMakePoint((SIZE - sz.width) / 2, (SIZE - sz.height) / 2), attrs)
    img.unlockFocus()
    tiff = img.TIFFRepresentation()
    rep = AppKit.NSBitmapImageRep.imageRepWithData_(tiff)
    png = rep.representationUsingType_properties_(AppKit.NSBitmapImageFileTypePNG, {})
    path = os.path.join(OUT, key + ".png")
    png.writeToFile_atomically_(path, True)
    print(path)
