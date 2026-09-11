type Props<K extends keyof HTMLElementTagNameMap> =
  Partial<Omit<HTMLElementTagNameMap[K], 'style' | 'className'>> & { class?: string; style?: string }

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Props<K> = {} as Props<K>,
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v as string
    else if (k === 'style') n.setAttribute('style', v as string)
    else if (k.startsWith('on') && typeof v === 'function') (n as unknown as Record<string, unknown>)[k] = v
    else (n as unknown as Record<string, unknown>)[k] = v
  }
  for (const c of children) if (c != null) n.append(c as Node | string)
  return n
}

export const clear = (n: HTMLElement) => { while (n.firstChild) n.removeChild(n.firstChild) }
