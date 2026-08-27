import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The F2 guard. Ten dashboard controls rendered a `<Button>` with no `onClick`, no
 * `type="submit"`, no `href` and no enclosing form handler — including the freeze and
 * mark-lost buttons sitting beside a convert button whose own comment records the same
 * defect being fixed once already. A control that renders and does nothing teaches the
 * manager the product is broken; this fails the build on the next one.
 */

const WEB = resolve(new URL('../..', import.meta.url).pathname)
const APPS = ['dashboard', 'parent', 'staff'] as const

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(path)
  }
  return out
}

/** Every `<Button …>` opening tag, brace-aware so a multi-line JSX prop cannot end it. */
function buttonTags(text: string): { tag: string; line: number }[] {
  const tags: { tag: string; line: number }[] = []
  for (const match of text.matchAll(/<Button[\s/>]/g)) {
    const start = match.index
    let depth = 0
    let end = start
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i]
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      else if (ch === '>' && depth === 0) {
        end = i
        break
      }
    }
    tags.push({ tag: text.slice(start, end + 1), line: text.slice(0, start).split('\n').length })
  }
  return tags
}

describe.each(APPS)('no inert Button in apps/%s', (app) => {
  it('every <Button> has a handler, a submit type, or spread props', () => {
    const offenders: string[] = []
    for (const path of sourceFiles(join(WEB, 'apps', app, 'src'))) {
      const text = readFileSync(path, 'utf8')
      for (const { tag, line } of buttonTags(text)) {
        const acts =
          /\bonClick=/.test(tag) ||
          /\bhref=/.test(tag) ||
          /type=(["']|\{["'])submit/.test(tag) ||
          // Spread props may carry the handler; the call site cannot be judged here.
          /\{\s*\.\.\./.test(tag)
        if (!acts) offenders.push(`${path.slice(WEB.length + 1)}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
