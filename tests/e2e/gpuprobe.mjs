import puppeteer from 'puppeteer-core';
const sets = {
  vulkan: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE'],
  gl: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl'],
  glegl: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl-egl'],
};
for (const [k, args] of Object.entries(sets)) {
  try {
    const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: 'new', args: [...args, '--no-sandbox'] });
    const p = await b.newPage();
    await p.goto('about:blank');
    const r = await p.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); if (!c) return 'no webgl2'; const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER); });
    console.log(k, '→', r);
    await b.close();
  } catch (e) { console.log(k, 'fail', e.message.slice(0, 100)); }
}
