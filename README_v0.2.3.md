# Flasher Studio v0.2.3 — кандидат для аппаратных испытаний

Основа: v0.2.2, UI 20. Firebase target studio, проект esp-flasher-byvovk. Builder v0.2.6 без изменений.

## Новое
- WebUSB USB-UART: CP210x 10c4:ea60, CH340/341 1a86:7523 и 5523. DTR/RTS, baud, framing; старые CH340 (версия < 0x30) ограничены 8N1. Web Serial и CDC сохранены. Android требует доступного WebUSB, OTG и разрешения ОС; не все варианты адаптеров поддерживаются. Выбор транспорта в настройках и разделе устройства.
- 60 базовых маркировок STM32 F0/F1 для ROM UART на основе полученного каталога DFP. Проверяется PID и размер Flash, читается UID; корпус и температурную градацию определить таким способом нельзя. SWD/DFU используют прежний ограниченный список.
- Установка кандидата UART Recovery STM32F103C8T6 из проверенного ZIP через ST-LINK/V2 и V2-1 с резервной копией Flash и проверкой записанных данных. Требует подтверждения уничтожения предыдущей программы. Приложение должно быть собрано для адреса 0x08004000; автоматическая адаптация linker script пока отсутствует.
- UF2 из каталога проверяется и скачивается для ручного переноса в BOOTSEL, не считается фактической записью.
- Wi-Fi OTA клиент для **ESP Recovery v0.2.1**: проверка токена, чипа, идентификатора и размеров/адресов слотов, SHA-256 приложения, проверка результата HTTP. Только app-only BIN, не merged BIN. HTTP в локальной WPA2-сети, без TLS; требуется разрешение Local Network Access браузера. Не является проверкой физического чтения Flash. Старый Recovery v0.2.0 не поддерживает этот веб-клиент. 

## Порядок проверки
1. Сначала обновить репозиторий Bootloaders до v0.2.1, получить успешные сборки и каталог. В этом архиве приложения ещё каталог v0.2.0, новая версия Recovery не включена.
2. После сверки нового каталога и интеграции пакетов можно развернуть приложение. Команды ниже для локальной проверки и будущего деплоя, пока не публиковать.

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run vendor
npm test
python -m unittest discover -s tests -p '*_test.py'
firebase deploy --only hosting:studio --project esp-flasher-byvovk
```

## Ограничения
Реальная аппаратура, Android OTG, установка npm/vendor, облачные запросы GitHub и сетевой доступ PWA к Recovery не проверены в текущей среде. 37 JS и 5 Python локальных тестов; мобильный Chromium проверен с подстановкой локальных модулей. Все загрузчики остаются кандидатами. Не прошивать ценные устройства без резервной копии. Прямые браузерные UPDI/Urboot/Nordic DFU, CMSIS-DAP/J-Link/ST-LINK V3 не реализованы, используются прежние локальные инструменты. Автоматическая адаптация разметки ESP-IDF/PlatformIO/STM32 не реализована. Подробности предыдущих функций в README_v0.2.2.md.

## Документация
- Silicon Labs CP210x AN571: https://www.silabs.com/documents/public/application-notes/AN571.pdf
- Linux CH341 driver: https://github.com/torvalds/linux/blob/master/drivers/usb/serial/ch341.c
- ST AN2606: https://www.st.com/resource/en/application_note/an2606-stm32-microcontroller-system-memory-boot-mode-stmicroelectronics.pdf
- Chrome Local Network Access: https://developer.chrome.com/blog/local-network-access
