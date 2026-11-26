# Flasher Studio v0.2.8

Keep the boot installation choice visible and greyed out when no compatible package and implemented installation route are available. Explain the unavailable state. Compatibility and write guards from v0.2.7 are unchanged. No new hardware support.

# Flasher Studio v0.2.7

Boot installation controls are shown only for an explicitly selected compatible target with a matching CI package and implemented installation route. No generic install placeholder for ROM-only or unsupported targets. Only the implemented package source and wired routes are offered; existing package/backup/confirmation checks remain unchanged. Candidate packages are not hardware validated. The bundled boot catalog is metadata, not binaries. Ordinary flashing and compilation are unchanged.

# Flasher Studio v0.2.6

UI 20; Bootloaders v0.2.1 unchanged. Builder v0.2.7 required for new STM32 FS10 layout only; ordinary build API unchanged.

- STM32F103C8T6: select FS10 Recovery v0.2.0/v0.2.1 before source-only C, C++ or ZIP compilation. A copy of the sources gains `flasher-native.json` with `recoveryLayout: fs10-stm32f103c8`. Existing conflicting project config, linker, startup and full IDE projects are rejected. Builder relocates Flash and VTOR. Verify the metadata, actual HEX bounds, vectors and BIN/HEX bytes before saving the package. No full-flash writes for that package. Use the dedicated UART Recovery panel, select a local BIN/HEX or select the saved FS10 version in the regular firmware catalog above, then choose catalog as the Recovery source. Loader does not report unique ID; no false device identity is stored. Firmware launch is not verified.
- CMSIS-DAP v1 HID on desktop Chromium using WebHID (64-byte reports), in addition to v2 WebUSB. STM32F103C8/CB only. Unsupported HID descriptors rejected. No hardware validation. CMSIS-DAP v2 can also install FS10 Recovery for F103C8 via the existing backup/confirmation flow.
- No demo operations. No new standalone utilities for the unfinished direct UPDI, Urboot, Nordic DFU, ST-LINK/V3, J-Link. Those remain the previous local-tool paths. All physical programming and browser/network behavior still require testing.

Tests: `npm test` (66 JavaScript tests including five boot availability checks), `python -m unittest discover -s tests -p '*_test.py'` (5 tests). Mobile UI checked via local injected resources, not live HTTPS. Actual SDK compilation, vendor npm installation and hardware not validated here.

Deploy only to the studio target after the new Builder check:
```
npm install --ignore-scripts --no-audit --no-fund
npm run vendor
npm test
firebase deploy --only hosting:studio --project esp-flasher-byvovk
```
Use test boards first; backup important data before writing. See prior version READMEs for limitations.
