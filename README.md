# mf-manifest share scope repro

This repository exists only to document and reproduce a bug in [Module Federation](https://github.com/module-federation/core): **`mf-manifest.json` drops the share scopes of shared dependencies and reports the wrong `singleton` default.** It isn't a library or an example to copy.

Upstream issue: _link to be added_

## Summary

`mf-manifest.json` is supposed to describe what a remote shares, so tools can check host/remote compatibility without running the bundle. For shared dependencies, it currently can't say which share scope an entry belongs to, and in some cases it describes the entry itself wrongly. Comparing the built bundle with `mf-stats.json` and `mf-manifest.json` shows four bugs:

| # | Bug | Bundle registers | `mf-stats.json` | `mf-manifest.json` |
|---|---|---|---|---|
| 1 | `shareScope` never reaches the manifest | `react-dom` in `["default","other"]` | `["default","other"]` | no `shareScope` field |
| 2 | Plugin-level `shareScope` is ignored | `react` in `"custom"` | `"default"` | no `shareScope` field |
| 3 | A package shared in two scopes becomes one entry | `react@18.3.1` in `react18`, `react@19.1.1` in `react19` | one `react@18.3.1` entry | one `react@18.3.1` entry carrying both versions' chunks |
| 4 | `singleton` defaults to `true` instead of `false` | `react` with `singleton: false` | `singleton: true` | `singleton: true` |

So anything that reads the manifest, for example a check that a host and remote agree on their singletons, can't tell scopes apart, can attribute one scope's assets to another, and can misjudge whether a dependency is a singleton.

## Versions

| Package | Version |
|---|---|
| `@module-federation/rspack` | 2.9.2 (the bundled `@module-federation/manifest` is also 2.9.2) |
| `@rspack/core`, `@rspack/cli` | 2.2.9 |
| Node | 24.21.0 |

The same code paths are still present on `module-federation/core` `main` at commit `9135b236d`.

## Reproduce

```sh
npm install
npm run repro   # builds both configs, then prints bundle vs stats vs manifest
```

The two builds:

- [`rspack.config.js`](rspack.config.js) → `dist/` covers bugs 1, 2 and 4. It's one remote with a plugin-level `shareScope: 'custom'`, `react` with no `singleton` option, and `react-dom` with `shareScope: ['default', 'other']`.
- [`rspack.multi-scope.config.js`](rspack.multi-scope.config.js) → `dist-multi-scope/` covers bug 3. It's one remote that shares React 18 in scope `react18` and React 19 in scope `react19`, using the npm aliases `react18` and `react19`. This is the layout of the official multi-share-scope pattern, where one remote serves hosts on different React majors.

[`scripts/inspect.js`](scripts/inspect.js) reads the share data that the bundle registers at runtime (`initializeSharingData` and `consumesLoadingData` in `remoteEntry.js`), then prints it next to the `shared` sections of `mf-stats.json` and `mf-manifest.json`.

### Actual output

```text
=== rspack.config.js (bugs 1, 2, 4)

Bundle (remoteEntry.js) provides:
  react@18.3.1 in scope "custom"
  react-dom@18.3.1 in scope "default"
  react-dom@18.3.1 in scope "other"
Bundle (remoteEntry.js) consumes:
  react: shareScope "custom", singleton false
  react-dom: shareScope ["default","other"], singleton true

mf-stats.json shared:
  react@18.3.1: shareScope "default", singleton true
  react-dom@18.3.1: shareScope ["default","other"], singleton true

mf-manifest.json shared:
  react@18.3.1: shareScope (missing), singleton true, js ["237.js"]
  react-dom@18.3.1: shareScope (missing), singleton true, js ["98.js"]

=== rspack.multi-scope.config.js (bug 3)

Bundle (remoteEntry.js) provides:
  react@18.3.1 in scope "react18"
  react@19.1.1 in scope "react19"
Bundle (remoteEntry.js) consumes:
  react: shareScope "react18", singleton true
  react: shareScope "react19", singleton true

mf-stats.json shared:
  react@18.3.1: shareScope (missing), singleton (missing)

mf-manifest.json shared:
  react@18.3.1: shareScope (missing), singleton (missing), js ["182.js","435.js"]
```

Chunk ids and the order of lines can differ between runs, but the content shouldn't.

### Expected

- Each `shared` entry in `mf-manifest.json` records the scope or scopes it registers in: `"custom"`, `["default","other"]`, `"react18"` and `"react19"`.
- `singleton` matches what the runtime does: `false` for `react` in `rspack.config.js`.
- A package shared in two scopes appears twice, once per scope, and each entry lists only its own version and assets: `react@18.3.1` with `182.js` and `react@19.1.1` with `435.js`.

## Bugs in detail

Paths below are in [`module-federation/core`](https://github.com/module-federation/core).

### 1. `shareScope` never reaches the manifest

- `StatsShared` and `ManifestShared` in `packages/sdk` have no `shareScope` field.
- `ManifestManager` in `packages/manifest` builds each manifest `shared` entry from an explicit list of fields, and `shareScope` isn't on it.
- `shareScope` only reaches `mf-stats.json` because the shared config is spread into the stats entry without a type.

The result is that `mf-stats.json` sometimes has the scope, but `mf-manifest.json` never does.

### 2. The plugin-level `shareScope` is ignored

```js
new ModuleFederationPlugin({
  shareScope: 'custom',
  shared: { react: { requiredVersion: '^18.0.0' } },
});
```

The bundle provides and consumes `react` in `custom`, because the bundler's `ProvideSharedPlugin` and `ConsumeSharedPlugin` fall back to the plugin-level option. `SharedManager.transformSharedConfig` in `packages/managers` doesn't do the same fallback, so stats record `"default"`.

### 3. A package shared in two scopes becomes one entry

`ModuleHandler` in `packages/manifest` collects shared modules into a map keyed by package name only. When a remote shares `react` in both `react18` and `react19`, both versions land in the same `react` entry. The first one's version wins, and the entry's asset list holds the chunks of both versions. A host on React 19 that reads this manifest would see `react@18.3.1` and preload React 18's chunk.

The stats and manifest entries for this build also have no `singleton` or `shareScope`, even though both shared configs set them. The shared options are keyed by absolute path here (as the multi-scope pattern requires), but the stats code looks the options up by package name, so it doesn't find them.

### 4. `singleton` defaults to `true` instead of `false`

`defaultSharedConfig` in `packages/managers/src/SharedManager.ts` sets `singleton: true`. The runtime default is `false`: the bundle registers `react` with `singleton:!1`. A dependency without an explicit `singleton` option is reported as a singleton in stats and in the manifest, but it doesn't behave like one.

## Proposed fix

There are two pull requests to `module-federation/core`:

1. **`fix(managers)`:** default `singleton` to `false` in `defaultSharedConfig` so it matches the runtime (bug 4).
2. **`feat(manifest)`:** fixes bugs 1–3 with these changes:
   - Add an optional `shareScope?: string | string[]` to `StatsShared` and `ManifestShared`. Readers treat a missing value as `default`.
   - Fall back to the plugin-level `shareScope` in `SharedManager`.
   - Copy `shareScope` into each manifest entry.
   - Key shared entries by scope plus package name, taking the scope from each provide or consume module identifier.
   - Give an entry id an `@<scope>` suffix only when a package name appears in more than one scope, so existing manifests keep their ids.

With the `feat(manifest)` change, the builds here produce these manifest entries:

```text
rspack.config.js
  repro:react                      react@18.3.1  shareScope "custom"               js 237.js
  repro:react-dom                  react-dom@18.3.1  shareScope ["default","other"]  js 98.js
rspack.multi-scope.config.js
  repro_multi_scope:react@react18  react@18.3.1  shareScope "react18"  js 182.js
  repro_multi_scope:react@react19  react@19.1.1  shareScope "react19"  js 435.js
```

The `fix(managers)` change then reports `singleton: false` for `react` in `rspack.config.js`.

Neither change fixes the missing `singleton` on the multi-scope entries, which comes from looking options up by package name. Some other code also still finds shared entries by package name, so it gets the first entry when a package is in two scopes:

- `generateSnapshotFromManifest`
- `generate-preload-assets`
- the bundler runtime's `init`
- `SharedUsedExportsOptimizerPlugin`

These are left for follow-up.

The pull requests will be linked from the upstream issue.

## License

MIT
