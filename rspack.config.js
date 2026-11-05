// Bugs 1, 2 and 4: one remote, three shared-config shapes.
const path = require('path');
const { ModuleFederationPlugin } = require('@module-federation/rspack');

module.exports = {
  context: __dirname,
  entry: './src/index.js',
  mode: 'production',
  output: { path: path.resolve(__dirname, 'dist'), publicPath: 'auto', clean: true },
  plugins: [
    new ModuleFederationPlugin({
      name: 'repro',
      filename: 'remoteEntry.js',
      // Bug 2: the bundle registers `react` in "custom"; stats report "default".
      shareScope: 'custom',
      exposes: { './App': './src/App.js' },
      shared: {
        // Bug 4: no `singleton` option. The runtime treats it as false; stats/manifest say true.
        react: { requiredVersion: '^18.0.0' },
        // Bug 1: an explicit per-entry scope array never reaches mf-manifest.json.
        'react-dom': { singleton: true, requiredVersion: '^18.0.0', shareScope: ['default', 'other'] },
      },
    }),
  ],
};
