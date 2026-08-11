# Lite artifact size baselines

`config/artifact-size-baselines.json` records the published v2.0.1 Windows x64
Lite NSIS and MSI asset sizes. The release workflow compares newly built Lite
installers with the matching package format by using
`scripts/check-artifact-size.mjs`.

The check fails only when an installer exceeds its baseline by both 512 KiB and
2%. Baselines are checked in, so tests and releases do not download prior
artifacts. Refresh a baseline only from a published release asset for the same
platform and installer format.
