# ATtiny classic ISP — validation and wiring (v0.2.55)

## Hardware setup

1. On a classic Arduino Uno R3 or Nano ATmega328P, load the standard Arduino IDE example File > Examples > 11.ArduinoISP > ArduinoISP. The standard sketch uses 19200 baud, 8N1 and a target SPI clock configured as 1 MHz / 6. Do not select the Arduino board's bootloader protocol as the target programmer.
2. Connect target RESET to Arduino D10, MOSI to D11, MISO to D12, SCK to D13, GND to GND on Uno/Nano. On other boards use hardware SPI/ICSP pins. Check the target's own pinout and use voltage-compatible signals and supply; do not connect 5 V to a 3.3 V-only circuit. Do not feed two supplies into each other.
3. Disable programmer auto-reset where necessary after uploading ArduinoISP (on Uno/Nano commonly a 10 µF capacitor between programmer RESET and GND; remove for uploading the sketch). Use slower SPI clock in ArduinoISP if the target runs below 1 MHz.
4. Select exact ATtiny and actual clock profile, choose Arduino as ISP, select programmer serial port, verify signature, choose local application HEX or catalogue build, confirm full-chip erase. No fuses are written; EEPROM may be erased depending on EESAVE. Existing bootloader is erased. For Digispark this is ISP only, not Micronucleus USB.
5. The driver releases target RESET by LEAVE_PROGMODE after each operation. If connection is lost, disconnect safely and release reset/power cycle manually. A failed operation is not evidence that the old firmware is intact.

## Release gate — physical tests not yet performed

- Compile Blink for ATtiny13/A MicroCore 2.5.2, ATtiny85 TinyCore 0.8.0 and each TinyCore group x4/x7/x8/x41/x61/x313/1634/828/43/26. Check artifact FQBN and size; confirm pin mapping and selected clock.
- Flash and reflash representative 16, 32, 64 and 128-byte page devices using Arduino Uno/Nano as ISP and USBasp. Verify whole Flash with an independent tool (avrdude) and observe Blink after disconnect.
- Read fuses before/after; must match. Test wrong model, oversized image, locked device, slow SCK and disconnection without implicit retries or lock/fuse writes.
- Hardware examples: ATtiny13A, ATtiny85, ATtiny441/841, ATtiny167. Include older ATtiny26 (fixed erase/write delays) and a USBasp with slow-clock jumper.
- TPI-only ATtiny4/5/9/10/20/40, modern UPDI tinyAVR, USB bootloaders, high-voltage rescue are outside this ISP scope.

References: Arduino Examples ArduinoISP sketch (https://github.com/arduino/arduino-examples/blob/main/examples/11.ArduinoISP/ArduinoISP/ArduinoISP.ino); AVRDUDE v8.0 part definitions (https://github.com/avrdudes/avrdude/blob/v8.0/src/avrdude.conf.in); TinyCore v0.8.0 and MicroCore v2.5.2 boards.txt.
