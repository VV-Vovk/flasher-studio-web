# Release and dependency policy

- New third-party code, binaries, assets, SDKs and bootloaders require review of exact upstream version, license, copyright notices, redistribution and source obligations, provenance, and hardware/use restrictions. Public availability and private repository status are not permission. Keep unknown/restricted artifacts out of public GitHub, CI artifacts and Firebase. No copied proprietary programmer binaries, vendor logos or extracted closed-source loaders.
- Independently implement register algorithms from factual hardware documentation; do not copy GPL OpenOCD/stm32flash implementation into this application. Reference manuals are references, not bundled content.
- Public browser dependencies: exact pinned inventory checked at bundle build, upstream license and notice texts copied into public/licenses/npm-THIRD-PARTY-NOTICES.txt. Changes require explicit policy review. This is an automated inventory check, not a legal determination.
- ESP: esptool-js package declares Apache-2.0; separately verify the provenance and license of each embedded flasher stub and any bundled third-party components before treating the full package as cleared. ESP Recovery binary distribution remains HOLD. Current upstream stub repository: https://github.com/espressif/esp-flasher-stub (Apache-2.0 OR MIT); do not infer that every historical stub has this license.
- ST: use official CMSIS Device/HAL components under their actual licenses; restricted Cube middleware and licensed desktop tools are not mirrored. https://github.com/STMicroelectronics/STM32CubeF3
- AVR/Arduino/Nordic/Pico: review each core, bootloader, runtime and linked library independently. GPL/LGPL and device-specific license terms can impose obligations on redistribution of firmware; private compilation alone does not clear public distribution. Never publish user firmware or source without permission. Separate build output licenses from web app licenses.
- Do not select a license for the owner's own source without their explicit instruction. The public repo does not by itself grant permission to reuse original code.
- Before a live release, review the final artifact including binary provenance, inherited notices and user content; if evidence is missing, keep release unpublished. This checklist is not a guarantee of legal compliance.

- G0x1/G431/G441 register algorithm: references RM0444 rev 6 and RM0440 rev 9 ch. 5 (https://www.st.com/resource/en/reference_manual/dm00371828-stm32g0x0-advanced-arm-based-32-bit-mcus-stmicroelectronics.pdf and https://www.st.com/resource/en/reference_manual/dm00355726-stm32g4-series-advanced-arm-based-32-bit-mcus-stmicroelectronics.pdf). Only factual register values/geometry and original code; no new dependencies, SDK code, or loader binaries in Web.

- G0x0 and G0B1/C1: ST RM0454 rev 5 and RM0444 rev 6 reference manuals, independent register-level implementation. No loader binaries or SDK code redistributed.

- G0B0 and G4 category 3/4: factual register and memory geometry from RM0454 and RM0440 rev 9 chapters 3–4; no vendor source or loader binaries added.

- F2/F4 single-bank profile expansion references ST RM0033, RM0368, RM0383, RM0090, RM0401, RM0402, RM0390 and DS6329. No vendor implementation copied.

- F4/F7 expansion: factual register layouts and memory geometry from RM0430, RM0090, RM0386, RM0431, RM0385, RM0410; independently implemented, no firmware blobs or new dependencies.

- C0/L4/L4+ independent doubleword Flash controller from factual registers in RM0490, RM0394, RM0351, RM0432. No vendor implementation, loaders, or dependencies added.

- H72x/H73x: independent register-level implementation based on factual register values and Flash geometry from ST RM0468; no vendor source or loader binaries redistributed.

- H7A/B RM0455 and ST CMSIS register definitions used as factual reference; original JS driver, no vendor implementation or Flash loader binaries added. Existing license review restrictions remain.

- WB CPU1 application driver: original register-level implementation using factual RM0434/AN5451 descriptions. No ST FUS or wireless binary redistribution, no option modifications. Restricted wireless middleware stays excluded.

- WB1x RM0473/AN5811 and WB55 640 KiB geometry from factual DFP metadata; no third-party Flash implementation or FUS/wireless binaries included.

- WB factory high FUS mapping and flash checks based on factual AN5185 Rev 15 and RM0434 register definitions; no FUS implementation or binaries added.

- v0.2.41–0.2.58: new browser drivers use factual STM32WB, Nordic, AVR ISP and USB bootloader protocol definitions. References include AN5185 Rev 15, Nordic product specifications, AVRDUDE v8.0 part geometry, ArduinoISP protocol, Micronucleus v2.6 host protocol (MIT), Adafruit Trinket/Gemma protocol and board definitions, TinyCore/MicroCore board definitions. No upstream firmware source or new vendor firmware binaries are bundled. New board cores are downloaded for private builds only; no new public npm dependency versions or user artifacts. Existing ESP stub and Recovery restrictions remain.
