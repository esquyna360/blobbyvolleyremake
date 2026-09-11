import sharp from 'sharp'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const RES = 'android/app/src/main/res'
const DENS = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]
const fg = readFileSync('tools/icons/foreground.svg')
const mono = readFileSync('tools/icons/mono.svg')

const BG = '#0b1220'
const bgSvg = (s) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}">
  <defs><radialGradient id="g" cx="0.5" cy="0.38" r="0.75">
    <stop offset="0" stop-color="#1b2f52"/><stop offset="0.6" stop-color="#0f1a2e"/><stop offset="1" stop-color="${BG}"/>
  </radialGradient></defs><rect width="${s}" height="${s}" fill="url(#g)"/></svg>`)

const png = (buf, size) => sharp(buf, { density: 1200 }).resize(size, size).png({ compressionLevel: 9 })

for (const [dir, k] of DENS) {
  const out = join(RES, `mipmap-${dir}`)
  const a = Math.round(108 * k)
  await png(fg, a).toFile(join(out, 'ic_launcher_foreground.png'))
  await png(mono, a).toFile(join(out, 'ic_launcher_monochrome.png'))
  await png(bgSvg(a), a).toFile(join(out, 'ic_launcher_background.png'))

  // legado: o ícone quadrado não tem safe zone, então a arte entra recortada
  const l = Math.round(48 * k)
  const inner = Math.round(l * 1.5)
  const art = await png(fg, inner).toBuffer()
  const base = await png(bgSvg(l), l).toBuffer()
  const off = Math.round((inner - l) / 2)
  const cropped = await sharp(art).extract({ left: off, top: off, width: l, height: l }).png().toBuffer()
  const flat = await sharp(base).composite([{ input: cropped }]).png().toBuffer()
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${l}"><rect width="${l}" height="${l}" rx="${Math.round(l * 0.22)}" fill="#fff"/></svg>`)
  await sharp(flat).composite([{ input: mask, blend: 'dest-in' }]).png().toFile(join(out, 'ic_launcher.png'))
  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${l}"><circle cx="${l / 2}" cy="${l / 2}" r="${l / 2}" fill="#fff"/></svg>`)
  await sharp(flat).composite([{ input: circle, blend: 'dest-in' }]).png().toFile(join(out, 'ic_launcher_round.png'))
}

const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
`
writeFileSync(join(RES, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive)
writeFileSync(join(RES, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive)

for (const dead of ['drawable/ic_launcher_background.xml', 'drawable-v24/ic_launcher_foreground.xml']) {
  const p = join(RES, dead)
  if (existsSync(p)) rmSync(p)
}
// splash vira tema, não bitmap esticado
for (const d of ['', ...['land', 'port'].flatMap(o => DENS.map(([n]) => `-${o}-${n}`))]) {
  const p = join(RES, `drawable${d}`, 'splash.png')
  if (existsSync(p)) rmSync(p)
}

// ícone do web/desktop
await png(readFileSync('tools/icons/foreground.svg'), 512)
  .toFile('tools/icons/icon-512.png')
console.log('icons ok')
