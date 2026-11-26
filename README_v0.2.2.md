# Flasher Studio v0.2.2 — интеграция Recovery и дополнительные интерфейсы

Основа — v0.2.1 и утверждённый UI 20. Builder v0.2.6 и Bootloaders v0.2.0 не изменены. Все прежние ограничения на аппаратные профили остаются, кроме расширения ST-LINK/V2-1. Демонстрационных операций нет. Это версия для испытаний, не финальная универсальная поддержка всех устройств.

## Новое в браузере

- Получение ZIP выбранного кандидата ESP/Urboot из точного GitHub Release v0.2.0. Сверка размера, SHA-256 всего ZIP и содержимого пакета. При CORS/отсутствии прав на приватный черновик остаётся ручной импорт. Токену нужен доступ к обоим репозиториям; для черновых релизов может понадобиться Contents write. Секрет не отправляется куда-либо кроме API GitHub. Автоустановки нет.
- 24 разметки ESP Recovery из фактических пакетов CI, с проверенными SHA-256 CSV. Для Arduino INO/ZIP в разделе сборки выбирается разметка уже установленного Recovery. Если выбранное сохранённое устройство имеет соответствующий загрузчик, его разметка предлагается автоматически. Исходный файл не изменяется: создаётся отдельный ZIP, в который добавляется partitions.csv рядом со скетчем. Конфликт существующего CSV останавливает операцию. FQBN должен соответствовать чипу, FlashSize проверяется. При получении результата проверяется фактическая бинарная таблица разделов и app-only BIN. Несоответствие останавливает сохранение результата.
- Проверенный app-only BIN можно использовать из каталога для BLE OTA, если тип чипа и объём слота совпадают, либо скачать для локального Wi-Fi клиента. Полный merged BIN из такого пакета не разрешается писать в Flash. По-прежнему требуется подтверждение совместимости реальной разметки; существующий Recovery сообщает тип и размер слота, но не уникальный ID и хеш таблицы. Автоматическая перестройка проекта ESP-IDF/PlatformIO/STM32 linker script пока не реализована. Облачная сборка Arduino с этой разметкой не проверена здесь; при несовпадении запись блокируется.
- STM32F103C8T6: UART-клиент для уже установленного FS10 Recovery. PA9/PA10, PB12 к GND при reset, 115200, 8N1. BIN/HEX должен быть скомпонован с базой приложения 0x08004000, максимум 47 КиБ. Проверка протокола, векторов, CRC32 и подтверждения загрузчика. Не выдаёт CRC за независимый readback или запуск. Нет UID. Первичная установка FS10 через специальный диалог пока не реализована.
- ST-LINK/V2-1 (0483:374b, 0483:3752), USB OUT endpoint 1, IN 1, debug interface 0; тот же узкий драйвер STM32F103C8T6/CBT6, API v2. Старый V2 сохраняет OUT 2. Новые версии не проверены аппаратно. V3 требует иной API — не выдаётся за прямое браузерное подключение.

## Локальный инструмент (не PWA-драйвер)

В разделе «Устройство → Дополнительные интерфейсы» скачивается `native-tools.py`. Он запускается на компьютере с Python 3.9+; никакого сетевого сервера не создаёт. AVRDUDE/OpenOCD/adafruit-nrfutil нужно установить самостоятельно. Порты и точную конфигурацию платы выбирает пользователь; тестировать только на резервных устройствах. Инструменты не записывают фиктивные сведения об устройстве в каталог PWA.

```
python native-tools.py --help
python native-tools.py wifi app.bin --target esp32c3
python native-tools.py avr app.hex --part m328p --protocol urclock --port COM3 --baud 115200
python native-tools.py avr app.hex --part m4809 --protocol serialupdi --port COM3 --baud 115200
python native-tools.py swd app.bin --target STM32F103C8T6 --adapter cmsis-dap
python native-tools.py nordic app.hex --port COM3 --sd-req 0xNNNN
```

Последний пример: `0xNNNN` — заменить на точный установленный SoftDevice FWID, это НЕ значение для копирования. Для Nordic только Feather nRF52840 Express с совместимым S140 и USB serial DFU, проверяются границы HEX, приложение, не SoftDevice/bootloader. Для OpenOCD доступны `stlink`, `cmsis-dap`, `jlink`; проверяются PID, объём Flash и векторы в узком профиле F103; используется локальный OpenOCD с конфигурацией соответствующего адаптера. Для urclock и serialupdi требуется AVRDUDE с поддержкой протокола; проверяется Intel HEX, запись и verify выполняются штатной утилитой без `-F`/`-V`. Wi-Fi работает с локальным AP Recovery по HTTP, без TLS; требуется правильная защищённая сеть устройства, токен вводится локально. Проверяется app-only образ, тип MCU, предел слота и ответ сервиса. Это обход ограничений CORS/mixed content, а не прямой Wi-Fi OTA из HTTPS-PWA. Все указанные локальные команды требуют аппаратной проверки.

## Деплой для испытаний

```
cd ~ && unzip -o Flasher_Studio_v0.2.2.zip && cd Flasher_Studio_v0.2.2 && npm install --ignore-scripts --no-audit --no-fund && npm run vendor && npm test && firebase deploy --only hosting:studio --project esp-flasher-byvovk
```

У токена GitHub: Actions read/write, Contents read/write, Metadata read, доступ к Builder и Bootloaders. Для старого ESP сайта ничего не меняется. Сохраняется локальное хранилище. SW обновлён до v0.2.2.

## Проверка и ограничения

29 JS-тестов, 5 Python-тестов; Chromium мобильный viewport (загрузка модулей через data URL, без vendor bundle); сравнение всех 24 CSV и бинарных таблиц с реальными пакетами CI; фактический Nordic HEX и ESP app BIN прошли проверки форматов. Нет реальной компиляции под новый Recovery, физических тестов, npm vendor bundle, live API или Firebase деплоя в этой среде. Прямые UPDI/Urboot, Nordic BLE/USB DFU, J-Link/CMSIS-DAP/V3 и Wi-Fi OTA из браузера остаются незавершёнными. Не все STM32 и прочие чипы поддерживаются. ESP Recovery для ESP32/S2/H2 ещё не устанавливается из браузера. UF2 — ручной экспорт. Автоматическая установка кандидатов запрещена. Сохранены документы предыдущих версий.

## Документация

- https://docs.espressif.com/projects/arduino-esp32/en/latest/tutorials/partition_table.html
- https://docs.github.com/en/rest/releases/assets
- https://github.com/pyocd/pyOCD/blob/main/pyocd/probe/stlink/usb.py
- https://openocd.org/doc-release/html/Debug-Adapter-Configuration.html
- https://avrdude.readthedocs.io/en/latest/5-Programmer_Specific_Information.html
- https://github.com/adafruit/Adafruit_nRF52_nrfutil
