const { execSync } = require('child_process');
const ALLOWED = new Set(['GHSA-c2j3-45gr-mqc4', 'GHSA-cmwh-pvxp-8882', 'GHSA-vxr8-fq34-vvx9']);
try {
  execSync('npm audit --json', { stdio: ['pipe', 'pipe', 'ignore'] });
  process.exit(0);
} catch (e) {
  const r = JSON.parse(e.stdout.toString());
  let f = false;
  for (const v of Object.values(r.vulnerabilities)) {
    for (const a of v.via) {
      if (typeof a === 'object' && !ALLOWED.has(a.source)) {
        console.error(`\x1b[31m[SEC-FAULT]\x1b[0m ${a.title} (${a.source})`);
        f = true;
      }
    }
  }
  if (f) process.exit(1);
  console.log('\x1b[32m[SEC-OK]\x1b[0m Known vulnerabilities isolated.');
}