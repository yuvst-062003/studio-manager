import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The F2 guard. Ten dashboard controls rendered a `<Button>` with no `onClick`, no
 * `type="submit"`, no `href` and no enclosing form handler — including the freeze and
 * mark-lost buttons sitting beside a convert button whose own comment records the same
 * defect being fixed once already. A control that renders and does nothing teaches the
 * manager the product is broken; this fails the build on the next one.
 *
 * **An UNCONDITIONALLY disabled button is exempt, and only that.** `7b`'s preview of the
 * parent's screen draws the two RSVP buttons a parent will press: they are the shape of an
 * answer, not an answer, and they are `<Button disabled>` rather than divs so assistive
 * tech reports a control that exists and cannot be used. That is the opposite of the defect
 * — nothing here teaches anyone the product is broken, because the control says so itself.
 *
 * The exemption is deliberately narrow: `disabled` bare or `disabled={true}` only. A
 * `disabled={somethingComputed}` button with no handler is the real bug wearing the
 * exemption's clothes — it is enabled on some render, and on that render it does nothing.
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

/**
 * Blank out every comment and string literal, keeping length and newlines.
 *
 * **Why this exists.** `JoinWelcomeStep.tsx` explains its own design in a header comment
 * that says the old shape "read the full-document link as a bordered `<Button>`" — and the
 * scan below matched that prose. It reported `JoinWelcomeStep.tsx:48`, which is a comment
 * line, as a control that renders and does nothing. Nobody could fix it, because there was
 * nothing there; the only way to make this file green was to stop writing `<Button>` in a
 * sentence about buttons. A guard that punishes documentation is a guard people delete.
 *
 * Replacing rather than removing, so every line number this file reports still points at
 * the line the reader will open.
 */
function codeOnly(text: string): string {
  const out = text.split('')
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i += 1) if (out[i] !== '\n') out[i] = ' '
  }
  let i = 0
  while (i < text.length) {
    const two = text.slice(i, i + 2)
    if (two === '//') {
      const end = text.indexOf('\n', i)
      blank(i, end === -1 ? text.length : end)
      i = end === -1 ? text.length : end
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end === -1 ? text.length : end + 2
      blank(i, stop)
      i = stop
    } else if (text[i] === "'" || text[i] === '"' || text[i] === '`') {
      const quote = text[i]!
      let j = i + 1
      while (j < text.length && text[j] !== quote) j += text[j] === '\\' ? 2 : 1
      blank(i + 1, j)
      i = j + 1
    } else {
      i += 1
    }
  }
  return out.join('')
}

/**
 * Every `<Button …>` opening tag, brace-aware so a multi-line JSX prop cannot end it.
 *
 * **Found in the blanked text, sliced out of the real one.** `codeOnly` is for locating
 * tags, never for judging them: the checks below read prop VALUES — `type="submit"` — and
 * a tag sliced out of the blanked copy has had that value blanked to spaces, which turned
 * six honest submit buttons into offenders the first time this was written. Both indices
 * mean the same position in both strings, because `codeOnly` replaces and never removes.
 */
function buttonTags(source: string): { tag: string; line: number }[] {
  const text = codeOnly(source)
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
    tags.push({ tag: source.slice(start, end + 1), line: text.slice(0, start).split('\n').length })
  }
  return tags
}

describe('the scanner reads code and not prose', () => {
  // A guard on the guard. `codeOnly` is the difference between this file failing on a real
  // inert control and failing on a sentence, and both directions have to be pinned: an
  // over-eager version that blanked too much would make every assertion below vacuous.
  it('ignores a <Button> named in a comment or a string', () => {
    const source = [
      '// the old shape read it as a bordered `<Button>`',
      '/* <Button /> in a block comment */',
      "const help = 'press the <Button>'",
      'const jsx = <Button onClick={go}>go</Button>',
    ].join('\n')
    const tags = buttonTags(source)
    expect(tags).toHaveLength(1)
    expect(tags[0]!.line).toBe(4)
    expect(tags[0]!.tag).toContain('onClick=')
  })

  it('still sees a control on the line after a comment or a URL', () => {
    const source = ['// see https://example.invalid/buttons', '<Button>go</Button>'].join('\n')
    expect(buttonTags(source)).toHaveLength(1)
  })

  it('keeps a prop VALUE intact, because the value is what is judged', () => {
    // The bug this pins: judging the blanked copy reads `type="      "` and calls a submit
    // button inert. Six of them, in three apps, on the first draft of `codeOnly`.
    const [tag] = buttonTags('<Button type="submit">go</Button>')
    expect(tag!.tag).toBe('<Button type="submit">')
  })
})

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
        // Always disabled — never clickable on any render, so it cannot be a control that
        // silently does nothing. `disabled={expr}` is NOT this and still fails.
        const inertOnPurpose = /\bdisabled(?=[\s/>])/.test(tag) || /\bdisabled=\{true\}/.test(tag)
        if (!acts && !inertOnPurpose) offenders.push(`${path.slice(WEB.length + 1)}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
