// Prints, for each build, what the bundle registers next to what mf-stats.json and
// mf-manifest.json report for each shared entry.
//
// The bundle side is read from remoteEntry.js with regexes over the minified runtime data
// (`initializeSharingData` and `consumesLoadingData`). They're tailored to these two builds
// (production mode, @module-federation/rspack 2.9.2), not a general-purpose parser.
const fs = require('fs');
const path = require('path');

const BUILDS = [
  { dir: 'dist', title: 'rspack.config.js (bugs 1, 2, 4)' },
  { dir: 'dist-multi-scope', title: 'rspack.multi-scope.config.js (bug 3)' },
];

const show = (v) => (v === undefined ? '(missing)' : JSON.stringify(v));

function bundleEntries(source) {
  // Provides: `<scope>:[{name:"react",version:"18.3.1",...}]`
  const provides = [...source.matchAll(/([\w$]+):\[\{name:"([^"]+)",version:"([^"]+)"/g)].map((m) => ({
    scope: m[1],
    name: m[2],
    version: m[3],
  }));
  // Consumes: `{shareScope:"custom",shareKey:"react",...,singleton:!1,...}`
  const consumes = [
    ...source.matchAll(/shareScope:("[^"]*"|\[[^\]]*\]),shareKey:"([^"]+)",[^}]*?singleton:(!0|!1)/g),
  ].map((m) => ({ scope: JSON.parse(m[1]), name: m[2], singleton: m[3] === '!0' }));
  return { provides, consumes };
}

for (const { dir, title } of BUILDS) {
  const abs = path.join(__dirname, '..', dir);
  if (!fs.existsSync(path.join(abs, 'mf-manifest.json'))) {
    console.error(`${dir}/ not found. Run "npm run build" first.`);
    process.exit(1);
  }
  const read = (f) => JSON.parse(fs.readFileSync(path.join(abs, f), 'utf8'));
  const stats = read('mf-stats.json').shared;
  const manifest = read('mf-manifest.json').shared;
  const { provides, consumes } = bundleEntries(fs.readFileSync(path.join(abs, 'remoteEntry.js'), 'utf8'));

  console.log(`\n=== ${title}\n`);
  console.log('Bundle (remoteEntry.js) provides:');
  for (const p of provides) console.log(`  ${p.name}@${p.version} in scope ${show(p.scope)}`);
  console.log('Bundle (remoteEntry.js) consumes:');
  for (const c of consumes) console.log(`  ${c.name}: shareScope ${show(c.scope)}, singleton ${c.singleton}`);

  console.log('\nmf-stats.json shared:');
  for (const s of stats) {
    console.log(`  ${s.name}@${s.version}: shareScope ${show(s.shareScope)}, singleton ${show(s.singleton)}`);
  }
  console.log('\nmf-manifest.json shared:');
  for (const m of manifest) {
    const js = [...m.assets.js.sync, ...m.assets.js.async];
    console.log(
      `  ${m.name}@${m.version}: shareScope ${show(m.shareScope)}, singleton ${show(m.singleton)}, js ${show(js)}`,
    );
  }
}
