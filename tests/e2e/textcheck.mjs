import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199/?dev=true', { waitUntil: 'load' });
const t = await page.evaluate(async () => { const { TEXT } = await import('/src/ui/text.js'); return { torii: TEXT.torii.success, compile: TEXT.compile.questions.map((q) => q.ok), stars: TEXT.stars.lit, petals: [TEXT.petals.intro, TEXT.petals.out, TEXT.petals.progress], him: TEXT.afterEndHim, n: TEXT.compliments.length, first: TEXT.compliments[0], last: TEXT.compliments[39] }; });
console.log(JSON.stringify(t, null, 1));
console.log('errors', errs);
await browser.close();
