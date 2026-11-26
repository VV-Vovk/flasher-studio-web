# Flasher Studio v0.2.39 (development)

WB: AN5185 Rev 15 factory high FUS mapping for smaller WB5x/3x; SFSA at physical end accepted only for documented FUS vectors, no extension beyond advertised Flash. WB30/35 reserved WRP/PCROP fields masked, OPTNV and OPTSTRT preflight, CPU1 halt and sticky reset monitored during erase/write. UI reports actual CPU1 budget and SFSA at connection and checks again before confirmation. USB DFU remains disabled for WB pending proof of safe nonsecure page-only writes and trustworthy device/region identity. Focused Builder SDK smoke in separate branch. No hardware testing, no new dependencies or wireless blobs.

# Flasher Studio v0.2.35 (development)

WB coverage: 18 catalogue base groups / 23 package templates. Added WB55 640 KiB and WB15/10/1M physical 320 KiB, 2 KiB erase pages and 1 KiB PCROP units, RM0473/RM0434. Reset-and-halt via CPU1 vector catch required before erase; no CPU2 control/security writes. The WB compiler candidate remains in the private Builder branch develop/wb-cpu1, not merged and not yet SDK-smoke-tested. Flash-only until actual compile verification. No hardware testing, FUS or radio binaries redistributed.

# Flasher Studio v0.2.34 (development)

Priority STM32WB55/50/35/30/5M: 14 SWD base groups (17 package templates). RM0434: CPU1 only, live SFSA and CPU2 boot vector, RDP0, FSD/ESE, CPU2 not started, page erase only within incoming application, verification of erased page tail, no CPU2/FUS/security updates. No mass erase. Existing data in overwritten pages is lost; remaining pages preserved. User must reset/halt CPU1 before CPU2 boots. WB1x uses another geometry (RM0473) and is not enabled. Flash-only pending verified Builder builds. No new dependencies or wireless blobs; no hardware tests.

# Flasher Studio v0.2.33 (development)

H7A3/H7B3 2 MiB and H7B0 128 KiB: 21 new SWD base groups (36 package patterns), currently flash-only until Builder support is verified. RM0455: 8 KiB sectors, 128-bit rows, per-bank WRP group checks and PCROP/secure-only/ECC checks. Both banks unlocked before erase; bank swap rejected. H7A3 1 MiB remains disabled due to contradictory address mapping in RM0455 and reported CubeProgrammer behavior. H7AXI stack validation now shared by the browser and driver, L0 sparse HEX gaps use erased zero, UID recheck uses the session identity method (including split UID on L0). H72 incomplete row no longer cleared on USB failure: power-cycle required. No new dependencies or SDK binaries. Mock tests only, hardware validation pending.

# Flasher Studio v0.2.32 (development)

STM32H723/725/730/733/735: 25 catalogue base groups, 42 package templates. RM0468: 128 KiB sectors, complete 256-bit rows, 128/512/1024 KiB main Flash, status/ECC checks, protection and boot address guards, option bytes untouched. DTCM and guaranteed AXI SRAM vector validation; reset/halt with core caches disabled required. H742/743/750/753 and dual-core H7 not enabled yet because shared device IDs and discontinuous flash maps need separate validation. H5/L5/U5 need separate security-aware drivers and Builder profiles. Mock tests only, no hardware or SDK builds. L0 driver from v0.2.31 documented in separate module. No new dependencies.

# Flasher Studio v0.2.30 (development)

C0 and L4/L4+ independent doubleword Flash driver: 54 C0 and 139 L4 catalogue base groups. Exact ID/size/UID, separate C0 status/PCROP/security registers (no ECC register), L4 firewall/swap and ECC preflight, locked options, full main Flash erase/verify. L4 256/512 KiB legacy dual-bank sparse layouts rejected before erase; L4+ low-density reserved DBANK rejected. No hardware/real SDK builds, no new dependencies. References RM0490, RM0394, RM0351, RM0432. Two C0 package groups still lack a Builder profile. L0 not yet enabled.

# Flasher Studio v0.2.29 (development)

F4 remaining and F7 sector profile expansion: 176 new base catalogue groups; F413/423, F427/429/437/439, F469/479, F722/723/730/732/733, F745/746/750/756, F765/767/768/769/777/778/779. RM0430, RM0090, RM0386, RM0431, RM0385 and RM0410. Separate single/dual-bank layouts, correct physical sector encoding, live bank swap checks, secondary WRP checks, grouped WRP for F413 and F76, F72 PCROP, F7 unique ID addresses and ART cache handling. F7 requires reset/halt with core caches disabled. No option bytes altered, no vendor implementation or new dependencies. Mock tests only; hardware validation pending.

# Flasher Studio v0.2.28 (development)

F2/F4 single-bank expansion: 99 base catalogue profiles covering F205/207/215/217, F401/405/407/410/411/412/415/417/446; 240 catalogue entries. Density-specific RAM and F401 IDs, exact catalogue package matching, F410 64 KiB geometry, CCM stack support for F405/407/415/417, option lock guard. F413/423 and F42x/F43x/F46x/F47x remain pending. Supported order-code templates can now open exact marking entry instead of a disabled placeholder; wildcard targets remain rejected. `npm run coverage:stm32` reports catalogue base coverage without SDK builds. No new dependencies or public vendor binaries. Hardware verification remains pending.

# Flasher Studio v0.2.27 (development)

G0B0 and G4 categories 3/4 (G471/473/474/483/484/491/4A1): 119 additional catalog templates, 77 base geometries. RM0440 rev 9 chapters 3/4; RM0454 G0B0. Category 3 checks all four WRP areas even in single-bank mode, both PCROP areas, secondary ECC flags in 128-bit read mode, live bank swap and secure areas. Both MER bits for category 3 even in single-bank mode. 128/256 KiB category 3 parts in dual-bank mode are rejected before erase because of the address gap, pending segmented image support. G411/G414 remain without SWD due to unverified silicon details. No physical tests, no private builds, no new dependencies. 

# Flasher Studio v0.2.26 (development)

G030/G050/G070 single-bank value line (RM0454 rev 5); G0B1/C1 128/256/512 KiB (RM0444 rev 6). 86 additional catalogue package templates, 41 base geometries. Bank mode read from size and option registers; swapped banks refused. Full main-flash mass erase for bank-capable parts, both-bank WRP/PCROP/SEC/ECC checks, parity SRAM bounds. No option bytes altered. G0B0 and remaining G4 pending. No new dependencies or private builds; hardware tests pending. Main's USB hotfix and license notices preserved.

Public dependency license notices and exact-version inventory check backported from v0.2.23; no new dependencies. Previously distributed ESP stub provenance remains subject to review; no new recovery binary distribution.

# Flasher Studio v0.2.20.1 (Android USB hotfix)

Android Web Serial may expose paired Bluetooth RFCOMM devices even when a wired ESP is selected. Auto uses one filtered WebUSB chooser for supported CH340/CP210x bridges and unambiguous CDC-ACM layouts, including ESP32-C3 native USB. Desktop native COM preserved; no Android fallback to Bluetooth on denial/cancellation. Shared routing for normal flashing, bootloader/recovery and monitor. Existing pinned polyfill, no new dependencies. Mock routing tests only; real phone/cable/programmer tests pending. No live deploy.


# Flasher Studio v0.2.25 (Android USB hotfix)

Android Web Serial may expose paired Bluetooth RFCOMM devices even when a wired ESP is selected. Auto uses one filtered WebUSB chooser for supported CH340/CP210x bridges and unambiguous CDC-ACM layouts, including ESP32-C3 native USB. Desktop native COM preserved; no Android fallback to Bluetooth on denial/cancellation. Shared routing for normal flashing, bootloader/recovery and monitor. Existing pinned polyfill, no new dependencies. Mock routing tests only; real phone/cable/programmer tests pending. No live deploy.

# Flasher Studio v0.2.24 (development)

Single-bank G0x1 (G031/G041/G051/G061/G071/G081) and G4 category 2 (G431/G441): 75 base geometries, 128 catalogue package templates. RM0444 rev 6 and RM0440 rev 9 chapter 5. Separate doubleword transport for CMSIS-DAP and ST-LINK, 2 KiB page erase, RDP/WRP/PCROP/securable area preflight, option lock preserved, status/ECC checks, readback and relock. Cache disabled until reset. Exact package search works; some base names still require a package for Builder. No dual-bank, G0 value-line, or G4 other categories enabled yet. No physical tests, private builds or new third-party dependencies. Existing license inventory gate retained.

# Flasher Studio v0.2.23 (development)

STM32F3 SWD: 69 existing base-model profiles, Cortex-M4, 2 KiB page erase, exact flash size and UID, read/write protection checks, halfword programming, main/CCM stack validation, readback and relock. Shared page-controller algorithm, no vendor binaries or copied programmer source. F334K4 base currently lacks a build profile; exact package variants may have one. No physical tests or private compiler builds. Public browser dependency inventory and upstream notices generated at bundle build, see LICENSE_POLICY.md. Embedded ESP stub provenance and other existing assets still require separate release review.

# Flasher Studio v0.2.22 (development)

STM32F101/F103 XL-density dual-bank SWD: PM0068 rev 2, separate bank registers and erase, protection preflight, exact flash size and UID, full readback and independent relock. All 12 XL base models from existing catalogue; F101 80 KiB SRAM, F103 96 KiB SRAM. Redundant package/temperature templates collapsed when their base part has the same catalogue profile; exact order-code search retained. Public unit tests added; no hardware testing or new private builds. The rest of the STM32 families remain incremental work.

# Flasher Studio v0.2.21 (development)

Expands single-bank SWD support to F030xC, F038, F042 variants, F048, F058, F070 variants, F078, F091/F098 and F100/F101/F102/F105/F107. Factual geometry cross-checked against the DFP inventory from Builder run 45701467875, RM0091/RM0360, PM0075/PM0063 and CMSIS register definitions. F1 checks Cortex-M3 and relocks even when a Flash status error occurs after unlock. XL-density F101/F103 two-bank devices remain unavailable for SWD until a separate algorithm is implemented. No physical testing; no new private compilation tests. Public PR CI only. No UI additions.

# Flasher Studio v0.2.20

Separate target capability states (build+flash, build only, flash only, unsupported). Unsupported target rows disabled, exact manual entry checked, unsupported programming interfaces disabled. Compiler eligibility uses existing Builder profile inventory and source-only catalogue metadata; it is not a guarantee of any project's compilation. Additional F030/F031/F051/F071/F072 and F103 low/medium/high-density base-part SWD profiles from existing ROM geometry, HSI guard, full F1 verification. F0/F1 are not complete (including F09x, XL/other F1 lines); no hardware certification. No new private CI.

# Flasher Studio v0.2.19

Seven additional exact single-bank F2/F4 SWD profiles using the shared ST-LINK and CMSIS-DAP transports. RM0033 / RM0368 / RM0383 / RM0090. Sector erase, conservative x8 programming (slow), RDP/WRP/PCROP guards, cache invalidation, full main Flash verification, relock. No Option Bytes changes. F407 vector validation currently accepts main SRAM only (128 KiB, not CCM). No dual-bank support; no hardware tests. No UI controls added. F205/F401/F411 have explicit Builder profiles; F207/F407 use existing catalog resolver and are not newly compiled in this update. Public CI only.

# Flasher Studio v0.2.18

Local Monitor tab: serial terminal with TX/RX, baud rate, 7/8 data bits, parity, stop bits, CR/LF, optional timestamps and echo, pause, autoscroll, text log export. Numeric plotter parses complete lines, 1–8 numeric channels, named `temp:25.4 voltage:3.3`, bounded 10,000 samples, selectable visible window, toggle series and CSV export. Uses existing Web Serial, WebUSB CDC, CH340/CP210x; monitor holds exclusive hardware lock, releases port on navigation. No network requests from monitor, no tokens, no private Actions minutes. Hardware browser tests pending.

# Flasher Studio v0.2.17

Wired ESP8266 (NodeMCU, D1 mini, Generic) experimental support: Arduino ESP8266 core 3.1.2 combined uncompressed eboot+app BIN at 0x0, flash capacity, segment geometry, boot checksum and full image CRC verified before write. Cloud archive selection limited to one BIN with exact Arduino core metadata; manual file must pass same format. No ESP8266 OTA installation, no arbitrary SDK image / filesystem / segment layouts. Added ESP32-S2 and H2 ordinary merged BIN route, matching chip headers and offsets. All writes still require physical connection and readback. No hardware verification. No private CI runs triggered. Arduino Nano/old bootloader routes unchanged.

# Flasher Studio v0.2.16

Shared STM32 SWD architecture: independent profile registry and F0/F1 algorithms (`stm32-swd.js`), separate ST-LINK and CMSIS-DAP adapters. All 20 existing explicit profiles are now routed through either ST-LINK/V2/V2-1 or CMSIS-DAP v2 USB / v1 HID. No extra primary-screen controls; existing optional programmer tools remain unchanged. FS10 installer remains F103C8 only. Existing erase/verification policies preserved. Actual programmer and phone hardware remain untested. Other flash architectures not enabled yet.

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

H72/H73 source-only firmware can use the full AXI stack range only when the connected chip's current TCM_AXI_SHARED setting permits it (320/256/192/128 KiB). The setting is read before erase and never modified.

## WB CPU1 / ROM DFU development

Real STM32CubeWB v1.24.0 CPU1 compiler smoke passed 9/9 (WB55RGV6, WB35CEU6A, WB15CCU6, CMSIS/HAL/LL), Builder branch develop/wb-cpu1 only. Expanded 23-template matrix is pending. Web compile eligibility remains unchanged until Builder main supports WB. ROM DFU planning is experimental and not connected to USB: AN2606 sections 84/85 exclude WB10/15; the planner requires live SFSA, option/protection snapshot, exact geometry and page-only erase range. No write path enabled, no FUS commands, no hardware test. Source: https://www.st.com/resource/en/application_note/an2606-introduction-to-system-memory-boot-mode-stmicroelectronics.pdf

## WB CPU1 preview in Web v0.2.38

All 69 real SDK builds passed (23 catalogue templates × CMSIS/HAL/LL), including negative mailbox link test. Exact WB order codes now offer CPU1-only compilation in this development web branch. C/CPP/ZIP requests are routed to private Builder `develop/wb-cpu1`; upload, dispatch, polling, resume and artifact metadata use the same validated branch. Other families continue using main. No wireless SDK or FUS, no public deployment, no hardware verification. Source remains in private Git history; do not merge request files to public branches. Default app budget 32 KiB; actual SFSA checked before SWD programming.

## Browser credential manager / PWA title

GitHub credentials use a dedicated form with username/current-password autocomplete. After successful GitHub access verification, supported browsers can offer to save the PAT via PasswordCredential. Native form navigation is blocked; no PAT in localStorage, Firebase or URLs. Browser consent/settings determine whether saving is available; actual Android autofill needs device verification. Manifest uses Flasher Studio for both names without changing app identity. Clearing the field does not delete vault entries.
