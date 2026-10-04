import { chromium } from '@playwright/test'
const OUT = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }).catch(() => chromium.launch())
async function open(app, port, persona, path, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: 'he-IL' })
  const p = await ctx.newPage()
  await p.goto(`http://localhost:${port}/api/v1/dev/sign-in-as/${persona}?app=${app}&return_path=${encodeURIComponent(path)}`)
  await p.waitForLoadState('networkidle')
  await p.waitForTimeout(2000)
  return p
}
const d = await open('dashboard', 5175, 'manager', '/#/students')
await d.screenshot({ path: `${OUT}/1-dashboard-students.png` })
await d.locator('select').filter({ has: d.locator('option[value="no_contact"]') }).selectOption('no_contact')
await d.waitForTimeout(2000)
await d.screenshot({ path: `${OUT}/2-dashboard-no-contact-filter.png` })
await d.locator('[data-testid="students-table"] tbody button').first().click()
await d.waitForTimeout(2000)
await d.screenshot({ path: `${OUT}/3-dashboard-student-card.png` })
await browser.close()
