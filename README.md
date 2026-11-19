# xDarkGuard

**Privacy-first smart dark mode browser extension.**

xDarkGuard is a standalone Manifest V3 extension designed to make websites comfortable to read in dark environments without compromising privacy.

## Rendering modes

- **Dynamic** — adapt page colors using generated dark-mode CSS while preserving site structure.
- **Static** — apply a restrained, predictable stylesheet with minimal runtime adaptation.
- **Filter** — use a page-level color inversion/filter strategy with image and media safeguards.
- **Filter+** — enhanced filter mode with targeted image, video, SVG, and embedded-content corrections.

Mode names describe xDarkGuard's intended behavior; rendering quality and site compatibility will be refined as the engine is implemented and tested.

## Privacy principles

- No telemetry or analytics.
- No browsing-history collection or upload.
- No remote executable code or runtime dependency on third-party servers.
- Settings and site exceptions stored locally.
- Minimal permissions; request additional permissions only when a feature requires them.
- Open-source filter lists and upstream code must be reviewed for license compatibility, pinned/versioned, and bundled locally before use.

## Development status

Early scaffold. Core rendering, popup controls, per-site settings, and automated tests are being implemented incrementally.

## Development

This is a plain JavaScript Manifest V3 extension. To load it in Chromium-based browsers, open the extensions page, enable Developer mode, choose **Load unpacked**, and select the repository directory once the initial files are present.

## Security and compatibility

Dark-mode rendering can affect accessibility, contrast, and site-specific controls. Test changes against representative sites and provide a per-site disable/override path. Do not claim that a rendering mode guarantees compatibility with every website.

## License

License selection is pending review of any bundled upstream code and filter data. No upstream implementation is assumed to be relicensed by this repository.
