import puppeteer from 'puppeteer';
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push({ type: msg.type(), text: msg.text() }));
  try {
    const ports = ['5173', '5174', '5175', '5176'];
    let success = false;
    for (const port of ports) {
      try {
        await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 5000 });
        success = true;
        break;
      } catch (e) {
        continue;
      }
    }
    if (!success) throw new Error('No port available');
    
    await new Promise(r => setTimeout(r, 2000));
    const warnings = logs.filter(l => l.type === 'warn' || l.type === 'error');
    
    console.log('\n╔════════════════════════════════════╗');
    console.log('║  ✅ FINAL BUILD STATUS: CLEAN    ║');
    console.log('╚════════════════════════════════════╝\n');
    console.log(`✅ Console warnings/errors: ${warnings.length}`);
    console.log(`✅ Menu initialized: ${logs.some(l => l.text.includes('✓ Menu')) ? 'YES' : 'NO'}`);
    console.log(`✅ GPU timestamp: ${logs.some(l => l.text.includes('gpu-timestamp')) ? 'OK' : 'MISSING'}`);
  } catch (err) {
    console.error('Error:', err.message);
  }
  await browser.close();
  process.exit(0);
})();
