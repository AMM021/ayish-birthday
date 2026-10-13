import { launch, BASE, sleep, waitFor } from './lib.mjs';
const { browser, page, logs } = await launch();
await page.goto(BASE + '?dev=true', { waitUntil: 'load' });
await waitFor(page, () => !!window.__game?.machine?.currentName, 20000);
const names = ['bedDouble','loungeSofa','loungeSofaLong','loungeDesignSofa','loungeSofaCorner','loungeChair','tableCross','table','tableRound','chair','chairCushion','chairModernCushion','kitchenCabinet','kitchenCabinetUpper','kitchenFridgeLarge','kitchenStove','kitchenSink','kitchenBar','stoolBar','hoodModern','bathtub','toilet','bathroomSink','bathroomMirror','shower','bookcaseOpen','bookcaseClosedWide','cabinetBedDrawerTable','lampRoundFloor','lampRoundTable','lampSquareCeiling','pottedPlant','plantSmall1','rugRectangle','rugRound','tableCoffee','televisionModern','cabinetTelevision','desk','chairDesk','laptop','computerScreen','bench','coatRackStanding','sideTable','doorway','books','pillow','pillowLong','kitchenCoffeeMachine','kitchenMicrowave','toaster','washer','bathroomCabinet','speaker','radio','bear','ceilingFan'];
const r = await page.evaluate(async (names) => {
  const M = await import('/src/house/models.js');
  await M.preload(names);
  return names.map((n) => n + ' ' + M.size(n).toArray().map((v) => v.toFixed(2)).join('x'));
}, names);
console.log(r.join('\n'));
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 5).join('\n'));
await browser.close();
