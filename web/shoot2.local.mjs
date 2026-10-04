import { chromium } from '@playwright/test'
const OUT = process.argv[2]
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', deviceScaleFactor: 2 })
const p = await ctx.newPage()
await p.goto(`http://localhost:5173/api/v1/dev/sign-in-as/lead?app=staff&return_path=${encodeURIComponent('/')}`)
await p.waitForLoadState('networkidle'); await p.waitForTimeout(2500)
if (await p.getByRole('button', { name: 'אישור והמשך' }).count()) {
  for (const box of await p.locator('input[type="checkbox"]').all()) await box.check()
  await p.getByRole('button', { name: 'אישור והמשך' }).click()
}
await p.waitForLoadState('networkidle'); await p.waitForTimeout(2500)
await p.screenshot({ path: `${OUT}/4-staff-today.png`, fullPage: true })
await p.getByRole('link', { name: 'תלמידים' }).or(p.getByRole('button', { name: 'תלמידים' })).first().click()
await p.waitForLoadState('networkidle'); await p.waitForTimeout(2500)
await p.screenshot({ path: `${OUT}/5-staff-students.png`, fullPage: true })
console.log('url', p.url())
const texts = await p.locator('a, button').allInnerTexts()
console.log(texts.filter(Boolean).slice(0, 40).join(' | '))
await browser.close()
