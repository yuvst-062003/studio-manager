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
  await p.waitForTimeout(2000)
}
await p.goto('http://localhost:5173/#/attendance/ed34279c-8e35-4b60-9f8c-896b7c5384ee'); await p.waitForTimeout(3000)
await p.screenshot({ path: `${OUT}/6-staff-roster.png` })
await p.goto('http://localhost:5173/#/students/dbebbb31-c68c-48a6-9bac-11dc04753504'); await p.waitForTimeout(3000)
await p.screenshot({ path: `${OUT}/7-staff-student-card.png`, fullPage: true })
await browser.close()
