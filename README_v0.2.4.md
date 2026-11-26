# Flasher Studio v0.2.5 — кандидат для аппаратных испытаний

Основа v0.2.4 / UI 20, Builder v0.2.6, Bootloaders v0.2.1. Firebase target `studio`. Никакой имитации записи.

## Изменения
- CMSIS-DAP v2 по USB bulk (WebUSB), STM32F103C8T6 и STM32F103CBT6. Общий F1 Flash-контроллер со ST-LINK: PID, Flash size, UID, halt, проверка защиты, erase, halfword writes, readback, lock. Только интерфейс с дескриптором CMSIS-DAP, не HID v1. Ручной сброс после записи. Тесты протокола на подставных ответах, аппаратная совместимость ещё неизвестна. Для других моделей/адаптеров остаётся OpenOCD в пределах прежних профилей.
- ESP Recovery: подготовка копии проекта ESP-IDF ZIP (fresh sdkconfig.defaults, один стандартный корень, без готового sdkconfig или конфликтующей конфигурации). Для PlatformIO — простой явно заданный ESP32 Arduino environment с board_build.partitions и board_upload.flash_size, без extends/extra_configs/extra_scripts и конфликтов. При неоднозначности остановка; исходный архив не меняется. Сложные конфигурации пока не адаптируются автоматически. При получении результата обязательна проверка реальной таблицы разделов и сегментов из manifest; только app-only BIN проверенного чипа/размера отправляется через Recovery. Полная запись пакета Recovery запрещена. ESP-IDF может указать factory offset при стандартной сборке: он используется исключительно для нахождения app-only файла, не для записи поверх Recovery. Новые облачные сборки ещё не запускались. Не-Recovery ESP-IDF/PlatformIO по USB по-прежнему требуют поддерживаемый merged BIN.
- Каталог 78 версий в 39 карточках сохранён; SW cache обновлён.

## Проверки
48 JS + 5 Python автоматических тестов; Chromium мобильная ширина, с подстановкой локальных ресурсов (без настоящего USB/GitHub и без сетевого запуска). npm vendor в этой среде не проверялся. Аппаратных испытаний нет. Не использовать на ценных платах без резервной копии.

## Ограничения
UPDI, Urboot, Nordic DFU, ST-LINK/V3 и J-Link остаются локальными инструментами. STM32 Recovery требует самостоятельно скомпонованного приложения для 0x08004000; автоматическая адаптация STM32 linker script не реализована. ESP-IDF/PlatformIO Recovery поддержка ограничена описанными проектами. GitHub-репозитории не изменены. Не гарантируется поддержка всех CMSIS-DAP и WebUSB на Android. Подробнее о прежней реализации см. README_v0.2.4.md и предыдущие README.

## Развёртывание для аппаратных тестов
```bash
npm install --ignore-scripts --no-audit --no-fund
npm run vendor
npm test
python -m unittest discover -s tests -p '*_test.py'
firebase deploy --only hosting:studio --project esp-flasher-byvovk
```

Документация:
- https://arm-software.github.io/CMSIS-DAP/latest/group__DAP__Transfer.html
- https://arm-software.github.io/CMSIS-DAP/latest/group__DAP__SWJ__Sequence.html
- https://docs.platformio.org/en/latest/platforms/espressif32.html
- https://docs.espressif.com/projects/esp-idf/en/v5.5.4/esp32/api-reference/kconfig-reference.html
