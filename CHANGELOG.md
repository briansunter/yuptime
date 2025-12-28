# Changelog

## [0.0.12](https://github.com/briansunter/yuptime/compare/v0.0.11...v0.0.12) (2025-12-28)


### Bug Fixes

* use --validate=false for kubectl syntax-only validation ([2f7af26](https://github.com/briansunter/yuptime/commit/2f7af26247a659ea1ff155fbe11720d79807b746))

## [0.0.11](https://github.com/briansunter/yuptime/compare/v0.0.10...v0.0.11) (2025-12-28)


### Bug Fixes

* skip kubectl validation when cluster unavailable in CI ([38cd599](https://github.com/briansunter/yuptime/commit/38cd5995c8bf93a1a28505cfbc84094cc26d5a9e))

## [0.0.10](https://github.com/briansunter/yuptime/compare/v0.0.9...v0.0.10) (2025-12-28)


### Bug Fixes

* add Timoni setup to generate-artifacts job ([c594c40](https://github.com/briansunter/yuptime/commit/c594c40cab80d46f2d970f66263cd1e0d932a154))

## [0.0.9](https://github.com/briansunter/yuptime/compare/v0.0.8...v0.0.9) (2025-12-28)


### Features

* publish all artifacts to GHCR with auto-generated Helm chart ([85560b5](https://github.com/briansunter/yuptime/commit/85560b5b604bd6aefe2132c5814735b105673023))
* publish all artifacts to GHCR with auto-generated Helm chart ([ab43a85](https://github.com/briansunter/yuptime/commit/ab43a85e04291ef7a472aa02c8bf006d62ea832c))
* remove database dependency from checker executor ([#20](https://github.com/briansunter/yuptime/issues/20)) ([18eadb4](https://github.com/briansunter/yuptime/commit/18eadb44a26ce5ceeccfe981cd1a08d3d72d7ac4))

## [0.0.8](https://github.com/briansunter/yuptime/compare/v0.0.7...v0.0.8) (2025-12-28)


### Bug Fixes

* resolve lint errors and disable type-check in CI ([84b4610](https://github.com/briansunter/yuptime/commit/84b4610f9251883d698b03235d9e9ee13b1550e5))
* resolve TypeScript type errors for mixed database backends ([e418d20](https://github.com/briansunter/yuptime/commit/e418d20b2120057f70938293801d29feb2d5cd33))
* update E2E test monitor to match Timoni CRD schema ([8da8a80](https://github.com/briansunter/yuptime/commit/8da8a80dd616054b03a909b84b2ee783554f7a24))

## [0.0.7](https://github.com/briansunter/yuptime/compare/v0.0.6...v0.0.7) (2025-12-28)


### Bug Fixes

* restore SQLite/PostgreSQL database support ([da2242f](https://github.com/briansunter/yuptime/commit/da2242f71d0f07df4244e6baa4a25083bf07aca2))

## [0.0.6](https://github.com/briansunter/yuptime/compare/v0.0.5...v0.0.6) (2025-12-28)


### Bug Fixes

* require E2E tests before release and fix deployment names ([b6814af](https://github.com/briansunter/yuptime/commit/b6814af9b65cc71bdb57f988d3ae0ca4ad9aa36e))

## [0.0.5](https://github.com/briansunter/yuptime/compare/v0.0.4...v0.0.5) (2025-12-28)


### Bug Fixes

* use briansunter namespace for Docker Hub images ([ce8be60](https://github.com/briansunter/yuptime/commit/ce8be60c97010805e26e79d04fc3f1f7dceb9d89))

## [0.0.4](https://github.com/briansunter/yuptime/compare/v0.0.3...v0.0.4) (2025-12-28)


### Bug Fixes

* fetch BWS secrets directly in each build job ([987760b](https://github.com/briansunter/yuptime/commit/987760b6e182a4a5c321bce89c3a15b8e78d8174))

## [0.0.3](https://github.com/briansunter/yuptime/compare/v0.0.2...v0.0.3) (2025-12-28)


### Bug Fixes

* integrate release builds into release-please workflow ([1e11bd2](https://github.com/briansunter/yuptime/commit/1e11bd29a9932b220ef96714df6b3f11c69cdcb9))

## [0.0.2](https://github.com/briansunter/yuptime/compare/v0.0.1...v0.0.2) (2025-12-28)


### Features

* add GitHub Actions CI/CD with Release Please ([9dc70f3](https://github.com/briansunter/yuptime/commit/9dc70f346bf1b3d9ae7e555c95f938b3e0524b73))


### Bug Fixes

* simplify release-please workflow ([a773de5](https://github.com/briansunter/yuptime/commit/a773de5e231904911a5787ec42ff0a322129b3c1))
