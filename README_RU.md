# Flasher Studio v0.2.15

ST-LINK/V2 and V2-1 SWD: explicit 14 STM32F0 and 6 STM32F103 medium-density order-code profiles. RM0360/RM0091 F0 1/2 KiB page erase, full-flash readback, 4 KiB protection sectors; 32-bit WRP masks checked unsigned. F1 medium-density uses existing F103 driver. ID and size checks do not distinguish every package with shared silicon. No blanket family support, no options/OTP modifications, no hardware verification. Other STM32 families remain unsupported by ST-LINK. Sources: ST RM0360, RM0091, PM0075, STM32F030/F042/F070/F072/F103 datasheets.

# Flasher Studio v0.2.14

STM32F070F6P6 (TR ordering suffix accepted) via ST-LINK/V2 or V2-1: RM0360 Flash controller, 32 KiB / 6 KiB RAM, 1 KiB page erase, halfword writes, ID 0x445 at 0x40015800, CPUID Cortex-M0, flash-size and UID verification, reject read/write protection and option-byte errors, verify entire main flash including erased tail, relock. No option bytes changed, no recovery bootloader required. Full erase confirmation remains. After programming power-cycle with BOOT0 low. Same device ID/geometry may be shared by other silicon; exact board selection required. Builder profile v0.2.9. Physical ST-LINK/Android tests pending. F103 paths unchanged.

# Flasher Studio v0.2.13

ESP32-C3 private cloud Recovery: reuse the existing private Builder token and workflow build-esp-recovery.yml (Builder v0.2.8), exact settings, dispatch/resume, verified chunked download, IndexedDB cache and install dialog. No local Docker or manual file transfer required in the normal flow. Private Actions quota applies. Public ESP redistribution remains HOLD; hardware test pending. Custom cloud build limited to C3; S3/C6 remain previous experimental private candidates. Existing own ZIP import remains in advanced details.

# Flasher Studio v0.2.12

Local ESP32-C3 builds: configure profile, copy local build command, explicitly import own catalog.json and ZIP. Verify checksum, manifest, component bounds, matching known partition layout and draft notices. Metadata persists locally; after reload select original ZIP for installation. No network request/token for local ZIP; no automatic install or public ESP binary distribution. Requires Docker on PC, not cloud compilation. Actual hardware and end-to-end browser validation pending.

# Flasher Studio v0.2.11

ESP Recovery configuration: defaults 4 MiB, Wi-Fi+BLE, board-specific GPIO candidate, 3 seconds hold; reset button restores defaults. Select 0–5 seconds, GPIO, Flash, transport. Only exact existing catalog packages can be installed; unavailable custom settings disable install, no automatic compilation or public ESP redistribution. Hardware validation pending.

# Flasher Studio v0.2.10

Public STM32F103C8T6 FS10 v0.2.2: CI and Firebase publish download the exact released catalog and ZIP, verify pinned SHA-256 and manifest, and stage the Apache-2.0 package with LICENSE on the same origin. New installations prefer this package; historical catalog entries remain for existing builds. No token is sent for public downloads. No third-party binaries added. Urboot still comes directly from MiniCore. ESP distribution remains on hold. Hardware validation pending. Local deployment requires `python tools/prepare_public_boot.py` before tests and deploy.

# Flasher Studio v0.2.9

Urboot for six ATmega328/328P clock profiles: fetch exact official MiniCore 3.0.2 HEX from pinned upstream commit, anonymously; verify known SHA-256, size and addresses; preserve USBasp signature/fuse and explicit confirmation guards. No third-party binary is mirrored. The manual candidate ZIP path remains. Browser network and hardware are not validated yet. ESP/STM candidate distribution unchanged.

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
