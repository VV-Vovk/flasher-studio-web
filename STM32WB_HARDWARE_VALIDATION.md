# STM32WB release gate — v0.2.48 preview

Software-only tests are not hardware validation. No firmware or signing keys are distributed.

## Hardware matrix (not yet run)

Use expendable WB35/WB55 boards with known FUS and backup of CPU1. Stable power, BOOT0, ST-LINK and STM32CubeProgrammer recovery available. Record exact device order code, hardware revision, FUS/Safeboot/stack versions, UID, SFSA, test image SHA-256, result and logs locally. Never publish user flash backups.

| Test | Acceptance criterion |
|---|---|
| CPU1 compile and SWD | Build, write, read back and execute a known blink example on representative WB1x, WB3x, WB5x; protected CPU2 unchanged |
| ROM DFU | Correct identity and actual SFSA, app-only write/readback and application boot; refuse protected pages |
| BLE OTA | Compatible ST BLE_Ota bootloader and app image, reconnect and independently confirm application version |
| FUS entry | Running stack -> approved two GET_STATE requests -> same UID -> FUS idle; no implicit retry |
| FUS incremental | Confirm each version and new SFSA, then obtain the next official local BIN; check legacy 0.5.3 path against ST notes |
| First install | Blank and nonblank CPU1 with exact backup, stack version and execution verified; CPU1 bytes unchanged |
| Direct update | FUS 2.2.0, compatible new-format older/newer stack, live SFSA + NVM size; confirm both CPU1 bytes and real BLE bonding/reconnect |
| Delete/install | Confirm old stack absent, FUS idle and new stack works, verify backup and NVM/pairing where applicable |
| Recovery | USB disconnect during stage/command, wrong UID, busy/error, browser reload, failed readback; no false success or automatic destructive retry |
| Geometry | At least representative WB35 256/512 and WB55 256/512/640/1024; separately validate all SKU profiles before declaring support |

Do not merge to live until applicable tests pass; do not activate anti-rollback or change option bytes as part of testing. For unsupported combinations, use the official ST procedure. If pairing migration is required, use compatible FUSv2 stack formats and validate on real paired devices. FUS metadata is not evidence that the radio or CPU1 application runs.
