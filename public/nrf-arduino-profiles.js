// Exact board names verified against Zephyr v4.1.0 board.yml.
// Emulation targets must never be treated as physical SoC identities.
export const NRF_ZEPHYR=Object.freeze({
 'nRF52 DK (nRF52810 emulation)':'nrf52dk/nrf52810',
 'nRF52840 DK (nRF52811 emulation)':'nrf52840dk/nrf52811',
 'nRF52833 DK (nRF52820 emulation)':'nrf52833dk/nrf52820',
 'nRF52 DK':'nrf52dk/nrf52832',
 'nRF52833 DK':'nrf52833dk/nrf52833',
 'nRF52840 DK':'nrf52840dk/nrf52840',
 'nRF5340 DK':'nrf5340dk/nrf5340/cpuapp',
 'nRF54L15 DK':'nrf54l15dk/nrf54l15/cpuapp',
 'nRF9160 DK':'nrf9160dk/nrf9160',
 'Seeed XIAO nRF52840':'xiao_ble/nrf52840',
 'Adafruit Feather nRF52840':'adafruit_feather_nrf52840/nrf52840'
});
export const NRF_CHIPS=Object.freeze({
 'nRF52 DK (nRF52810 emulation)':'nRF52810',
 'nRF52840 DK (nRF52811 emulation)':'nRF52811',
 'nRF52833 DK (nRF52820 emulation)':'nRF52820',
 'nRF52 DK':'nRF52832','nRF52833 DK':'nRF52833','nRF52840 DK':'nRF52840',
 'nRF5340 DK':'nRF5340','nRF54L15 DK':'nRF54','nRF9160 DK':'nRF91',
 'Seeed XIAO nRF52840':'nRF52840','Adafruit Feather nRF52840':'nRF52840',
 'Adafruit Feather nRF52832':'nRF52832','Pro Micro nRF52840':'nRF52840',
 'Arduino Nano 33 BLE':'nRF52840'
});
export function nrfZephyrTarget(name,chip){return NRF_CHIPS[name]===chip&&Object.hasOwn(NRF_ZEPHYR,name)?NRF_ZEPHYR[name]:'';}
export const PRO_MINI=Object.freeze({
 'Arduino Pro Mini 5V / 16 MHz':'arduino:avr:pro:cpu=16MHzatmega328',
 'Arduino Pro Mini 3.3V / 8 MHz':'arduino:avr:pro:cpu=8MHzatmega328'
});
export function proMiniProfile(name){return Object.hasOwn(PRO_MINI,name)?{baud:57600,signature:'1e950f',limit:30720}:null;}
