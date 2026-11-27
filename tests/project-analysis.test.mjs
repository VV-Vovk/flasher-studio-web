import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeProject,readProjectEntries} from '../public/project-analysis.js';
const analyze=(files,name='source.zip')=>analyzeProject(Object.entries(files).map(([path,text])=>({path,text})),name);
test('Single generic INO: Arduino but no assumed board',async()=>{
 const entries=await readProjectEntries(new File(['void setup(){} void loop(){}'],'Blink.ino'));
 const a=analyzeProject(entries,'Blink.ino');assert.equal(a.framework,'Arduino');assert.equal(a.system,'Arduino CLI');assert.equal(a.target,null);
});
test('Arbitrary Makefile STM32 layout with full marking in documentation',()=>{
 const a=analyze({'nested/main.c':'volatile unsigned *gpio=(void*)0x48000000;', 'nested/README.md':'# STM32F070F6P6 — no HAL','nested/Makefile':'CROSS_COMPILE ?= arm-none-eabi-\nCPU=-mcpu=cortex-m0\nCFLAGS=-ffreestanding','nested/stm32f070f6.ld':'MEMORY { FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 32K\n RAM (rwx) : ORIGIN = 0x20000000, LENGTH = 6K }','nested/startup.s':'.cpu cortex-m0'});
 assert.equal(a.target.part,'STM32F070F6P6');assert.equal(a.framework,'Bare Metal');assert.equal(a.system,'Makefile');assert.equal(a.compiler,'arm-none-eabi-gcc');assert.equal(a.cpu,'cortex-m0');assert.equal(a.memory[0].bytes,32768);
});
test('Partial STM32 identity and conflicting full identities do not choose a device',()=>{
 const a=analyze({'src/main.c':'#include "stm32f4xx.h"','stm32f411.ld':'','README.md':'STM32F411'});
 assert.equal(a.target,null);assert.equal(a.framework,'CMSIS');
 const b=analyze({'README.md':'STM32F103C8T6 STM32F103CBT6','main.c':'int main(){}'});
 assert.equal(b.target,null);assert.equal(b.conflict,true);
});
test('Explicit board settings distinguish build systems',()=>{
 const a=analyze({'platformio.ini':'[env:a]\nboard=esp32-c3-devkitm-1\nframework=arduino','src/main.cpp':'#include <Arduino.h>'});
 assert.equal(a.target.board,'ESP32-C3 DevKitM-1');assert.equal(a.framework,'Arduino');assert.equal(a.system,'PlatformIO');
 const b=analyze({'CMakeLists.txt':'set(PICO_BOARD pico2_w)\npico_sdk_init()','main.c':'#include "pico/stdlib.h"'});
 assert.equal(b.target.board,'Pico 2 W');assert.equal(b.framework,'Pico SDK');
});
test('MCU-specific source alone does not invent board settings',()=>{
 const a=analyze({'app.ino':'#include <ESP8266WiFi.h>'},'app.ino');assert.equal(a.target,null);
 const b=analyze({'main.c':'#include <avr/io.h>\n#if defined(ATtiny85)\n#endif'});assert.equal(b.target,null);
 const c=analyze({'sdkconfig':'CONFIG_IDF_TARGET="esp32s3"','CMakeLists.txt':'include($ENV{IDF_PATH}/tools/cmake/project.cmake)'});assert.equal(c.framework,'ESP-IDF');assert.equal(c.target,null);
});
test('SDK dependencies are not mistaken for project hardware',()=>{
 const a=analyze({'project.ioc':'Mcu.CPN=STM32G431CBT6','Drivers/Other/README.md':'STM32F070F6P6','Core/Src/main.c':'HAL_Init();'});
 assert.equal(a.target.part,'STM32G431CBT6');assert.equal(a.framework,'STM32 HAL');
});

test('Arbitrary archive wrapper and conflicting part-line evidence',()=>{
 const a=analyze({'firmware/src/main.c':'int main(void){}','firmware/README.md':'STM32F070F6P6','firmware/Makefile':'CC=arm-none-eabi-gcc\nCFLAGS=-ffreestanding'});
 assert.equal(a.target.part,'STM32F070F6P6');assert.equal(a.compiler,'arm-none-eabi-gcc');
 const b=analyze({'README.md':'STM32F070F6P6','stm32f411.ld':'','main.c':'int main(){}'});
 assert.equal(b.target,null);assert.equal(b.targetConflict,true);
 const c=analyze({'Makefile':'CC=arm-none-eabi-gcc','CMakeLists.txt':'project(test)','main.c':'int main(){}'});
 assert.equal(c.buildConflict,true);assert.equal(c.system,'');
});
