// Bug 3: one remote shares `react` twice, React 18 in scope "react18" and React 19 in "react19".
//
// `react18` and `react19` are npm aliases of react@18.3.1 and react@19.1.1. The shared keys are
// absolute paths, so each one matches only the imports that resolve to that install, and both use
// `shareKey: 'react'` so hosts see them as the same package in different scopes.
const path = require('path');
const { ModuleFederationPlugin } = require('@module-federation/rspack');

const pkgDir = (alias) => path.resolve(__dirname, 'node_modules', alias);
const sharedReact = (major) => ({
  [path.join(pkgDir(`react${major}`), 'index.js')]: {
    shareKey: 'react',
    import: pkgDir(`react${major}`),
    version: require(path.join(pkgDir(`react${major}`), 'package.json')).version,
    requiredVersion: `^${major}.0.0`,
    singleton: true,
    shareScope: `react${major}`,
  },
});

module.exports = {
  context: __dirname,
  entry: './src/index.js',
  mode: 'production',
  output: { path: path.resolve(__dirname, 'dist-multi-scope'), publicPath: 'auto', clean: true },
  plugins: [
    new ModuleFederationPlugin({
      name: 'repro_multi_scope',
      filename: 'remoteEntry.js',
      shareScope: ['react18', 'react19'],
      exposes: {
        './Widget18': './src/expose-react18.js',
        './Widget19': './src/expose-react19.js',
      },
      shared: { ...sharedReact(18), ...sharedReact(19) },
    }),
  ],
};
