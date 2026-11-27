// Flasher Studio localization preview. Only explicitly captured UI literals are translated.
// Do not use translated text as a target ID, protocol name, file path or other program state.
const fsLocale = (() => {
  const MESSAGES = {
  "1. Исходный проект": {
    "en": "1. Source project",
    "de": "1. Quellprojekt"
  },
  "Выбрать проект": {
    "en": "Select project",
    "de": "Projekt auswählen"
  },
  "Название проекта": {
    "en": "Project name",
    "de": "Projektname"
  },
  "Убрать исходный файл": {
    "en": "Remove source file",
    "de": "Quelldatei entfernen"
  },
  "2. Конфигурация проекта": {
    "en": "2. Project configuration",
    "de": "2. Projektkonfiguration"
  },
  "Авто": {
    "en": "Auto",
    "de": "Automatisch"
  },
  "Параметры будут определены автоматически после загрузки проекта": {
    "en": "Settings will be detected automatically after loading the project",
    "de": "Die Einstellungen werden nach dem Laden des Projekts automatisch erkannt"
  },
  "Выбрать / изменить плату": {
    "en": "Select / change board",
    "de": "Platine auswählen / ändern"
  },
  "Расширенные настройки": {
    "en": "Advanced settings",
    "de": "Erweiterte Einstellungen"
  },
  "Система сборки": {
    "en": "Build system",
    "de": "Build-System"
  },
  "Библиотеки проекта": {
    "en": "Project libraries",
    "de": "Projektbibliotheken"
  },
  "Библиотеки вручную": {
    "en": "Manual libraries",
    "de": "Bibliotheken manuell auswählen"
  },
  "Автоподбор библиотек": {
    "en": "Automatic library selection",
    "de": "Automatische Bibliotheksauswahl"
  },
  "Компилировать": {
    "en": "Compile",
    "de": "Kompilieren"
  },
  "Выбери исходники для начала.": {
    "en": "Select source files to begin.",
    "de": "Wähle zunächst die Quelldateien aus."
  },
  "Отменить": {
    "en": "Cancel",
    "de": "Abbrechen"
  },
  "Скачать BIN": {
    "en": "Download BIN",
    "de": "BIN herunterladen"
  },
  "3. Программирование": {
    "en": "3. Programming",
    "de": "3. Programmierung"
  },
  "Что необходимо сделать?": {
    "en": "What would you like to do?",
    "de": "Was möchtest du tun?"
  },
  "Записать прошивку": {
    "en": "Flash firmware",
    "de": "Firmware flashen"
  },
  "Обычное программирование устройства": {
    "en": "Standard device programming",
    "de": "Normale Geräteprogrammierung"
  },
  "Установить загрузчик": {
    "en": "Install bootloader",
    "de": "Bootloader installieren"
  },
  "Первичная подготовка или замена загрузчика": {
    "en": "Initial setup or bootloader replacement",
    "de": "Ersteinrichtung oder Austausch des Bootloaders"
  },
  "Предлагаемый способ подключения": {
    "en": "Suggested connection method",
    "de": "Vorgeschlagene Verbindungsmethode"
  },
  "Устройство не подключено": {
    "en": "Device not connected",
    "de": "Gerät nicht verbunden"
  },
  "Установить загрузчик / OTA": {
    "en": "Install bootloader / OTA",
    "de": "Bootloader / OTA installieren"
  },
  "Подключить устройство": {
    "en": "Connect device",
    "de": "Gerät verbinden"
  },
  "Способ первичного подключения": {
    "en": "Initial connection method",
    "de": "Verbindungsmethode für die Ersteinrichtung"
  },
  "Выбрать целевую плату": {
    "en": "Select target board",
    "de": "Zielplatine auswählen"
  },
  "Источник загрузчика": {
    "en": "Bootloader source",
    "de": "Bootloader-Quelle"
  },
  "Выбрать из каталога": {
    "en": "Select from catalog",
    "de": "Aus dem Katalog auswählen"
  },
  "Сохранённые совместимые пакеты": {
    "en": "Saved compatible packages",
    "de": "Gespeicherte kompatible Pakete"
  },
  "Скачать совместимый": {
    "en": "Download compatible package",
    "de": "Kompatibles Paket herunterladen"
  },
  "Подготовка OTA-пакета": {
    "en": "Prepare OTA package",
    "de": "OTA-Paket vorbereiten"
  },
  "Загрузить свой файл": {
    "en": "Load your own file",
    "de": "Eigene Datei laden"
  },
  "BIN, HEX, UF2 или ZIP": {
    "en": "BIN, HEX, UF2 or ZIP",
    "de": "BIN, HEX, UF2 oder ZIP"
  },
  "Совместимый пакет": {
    "en": "Compatible package",
    "de": "Kompatibles Paket"
  },
  "Поддержка последующих обновлений": {
    "en": "Support for future updates",
    "de": "Unterstützung zukünftiger Updates"
  },
  "Отдельная служебная прошивка · концепция": {
    "en": "Separate service firmware · concept",
    "de": "Separate Service-Firmware · Konzept"
  },
  "Установка загрузчика — отдельная операция. Компиляция проекта не требуется.": {
    "en": "Bootloader installation is a separate operation. Project compilation is not required.",
    "de": "Die Installation des Bootloaders ist ein separater Vorgang. Eine Projektkompilierung ist nicht erforderlich."
  },
  "Каталог": {
    "en": "Catalog",
    "de": "Katalog"
  },
  "По семействам": {
    "en": "By family",
    "de": "Nach Familie"
  },
  "Общий список": {
    "en": "All items",
    "de": "Gesamtliste"
  },
  "Проекты": {
    "en": "Projects",
    "de": "Projekte"
  },
  "Загрузчики": {
    "en": "Bootloaders",
    "de": "Bootloader"
  },
  "Сохранённые проекты и версии прошивок": {
    "en": "Saved projects and firmware versions",
    "de": "Gespeicherte Projekte und Firmware-Versionen"
  },
  "Сортировка": {
    "en": "Sort by",
    "de": "Sortierung"
  },
  "Сначала новые": {
    "en": "Newest first",
    "de": "Neueste zuerst"
  },
  "По названию (А–Я)": {
    "en": "By name (A–Z)",
    "de": "Nach Name (A–Z)"
  },
  "По плате / чипу": {
    "en": "By board / chip",
    "de": "Nach Platine / Chip"
  },
  "По числу устройств": {
    "en": "By device count",
    "de": "Nach Geräteanzahl"
  },
  "По версии": {
    "en": "By version",
    "de": "Nach Version"
  },
  "Загрузчики и пакеты беспроводного обновления": {
    "en": "Bootloaders and wireless update packages",
    "de": "Bootloader und drahtlose Update-Pakete"
  },
  "Загрузчики появятся здесь после реализации их установки.": {
    "en": "Bootloaders will appear here once installation is implemented.",
    "de": "Bootloader erscheinen hier, sobald ihre Installation implementiert ist."
  },
  "Устройство": {
    "en": "Device",
    "de": "Gerät"
  },
  "Подключение, проверка и запись.": {
    "en": "Connection, verification and programming.",
    "de": "Verbindung, Prüfung und Programmierung."
  },
  "Подключение": {
    "en": "Connection",
    "de": "Verbindung"
  },
  "Программатор": {
    "en": "Programmer",
    "de": "Programmiergerät"
  },
  "Способ подключения": {
    "en": "Connection method",
    "de": "Verbindungsmethode"
  },
  "IP-адрес или имя устройства": {
    "en": "IP address or device name",
    "de": "IP-Adresse oder Gerätename"
  },
  "Подключись к той же Wi-Fi сети или к точке доступа микроконтроллера.": {
    "en": "Connect to the same Wi-Fi network or the microcontroller's access point.",
    "de": "Verbinde dich mit demselben WLAN oder dem Access Point des Mikrocontrollers."
  },
  "Подключение Bluetooth LE": {
    "en": "Bluetooth LE connection",
    "de": "Bluetooth-LE-Verbindung"
  },
  "В рабочей версии откроется выбор BLE-устройств с совместимым сервисом обновления.": {
    "en": "The working version will open a BLE device picker for devices with a compatible update service.",
    "de": "In der funktionsfähigen Version öffnet sich die Auswahl von BLE-Geräten mit kompatiblem Update-Dienst."
  },
  "Не подключено": {
    "en": "Not connected",
    "de": "Nicht verbunden"
  },
  "Подключение недоступно": {
    "en": "Connection unavailable",
    "de": "Verbindung nicht verfügbar"
  },
  "Экземпляр платы": {
    "en": "Board instance",
    "de": "Platinenexemplar"
  },
  "Добавить устройство": {
    "en": "Add device",
    "de": "Gerät hinzufügen"
  },
  "Драйвер подключения пока недоступен.": {
    "en": "Connection driver is not available yet.",
    "de": "Der Verbindungstreiber ist noch nicht verfügbar."
  },
  "Информация об устройстве": {
    "en": "Device information",
    "de": "Geräteinformationen"
  },
  "Считывание метаданных, версии и загрузчика": {
    "en": "Read metadata, version and bootloader",
    "de": "Metadaten, Version und Bootloader auslesen"
  },
  "Считать информацию": {
    "en": "Read information",
    "de": "Informationen auslesen"
  },
  "Подключи устройство для чтения.": {
    "en": "Connect a device to read information.",
    "de": "Verbinde ein Gerät zum Auslesen."
  },
  "Мои устройства": {
    "en": "My devices",
    "de": "Meine Geräte"
  },
  "Имена, идентификаторы и последняя известная прошивка.": {
    "en": "Names, identifiers and last known firmware.",
    "de": "Namen, Kennungen und zuletzt bekannte Firmware."
  },
  "Сохранённые платы": {
    "en": "Saved boards",
    "de": "Gespeicherte Platinen"
  },
  "Запись прошивки": {
    "en": "Firmware programming",
    "de": "Firmware programmieren"
  },
  "Выбери готовый файл или проект": {
    "en": "Select a firmware file or project",
    "de": "Firmware-Datei oder Projekt auswählen"
  },
  "Источник прошивки": {
    "en": "Firmware source",
    "de": "Firmware-Quelle"
  },
  "Файл с устройства": {
    "en": "Local file",
    "de": "Lokale Datei"
  },
  "Из каталога": {
    "en": "From catalog",
    "de": "Aus dem Katalog"
  },
  "Файл прошивки": {
    "en": "Firmware file",
    "de": "Firmware-Datei"
  },
  "Проект": {
    "en": "Project",
    "de": "Projekt"
  },
  "Операция": {
    "en": "Operation",
    "de": "Vorgang"
  },
  "Запись приложения": {
    "en": "Program application",
    "de": "Anwendung programmieren"
  },
  "Полная прошивка": {
    "en": "Full firmware",
    "de": "Vollständige Firmware"
  },
  "Запись загрузчика": {
    "en": "Program bootloader",
    "de": "Bootloader programmieren"
  },
  "Проверить после записи": {
    "en": "Verify after programming",
    "de": "Nach dem Programmieren verifizieren"
  },
  "Ожидание подключения.": {
    "en": "Waiting for connection.",
    "de": "Warte auf Verbindung."
  },
  "Загрузчик": {
    "en": "Bootloader",
    "de": "Bootloader"
  },
  "Сначала выбери микроконтроллер.": {
    "en": "Select a microcontroller first.",
    "de": "Wähle zuerst einen Mikrocontroller aus."
  },
  "Инструменты программатора": {
    "en": "Programmer tools",
    "de": "Programmierwerkzeuge"
  },
  "Инструменты пока недоступны: драйвер не подключён": {
    "en": "Tools unavailable: driver not connected",
    "de": "Werkzeuge nicht verfügbar: Treiber nicht verbunden"
  },
  "Выбери операцию.": {
    "en": "Select an operation.",
    "de": "Wähle einen Vorgang aus."
  },
  "Настройки": {
    "en": "Settings",
    "de": "Einstellungen"
  },
  "Компилятор и внешний вид.": {
    "en": "Compiler and appearance.",
    "de": "Compiler und Darstellung."
  },
  "Собственный облачный компилятор": {
    "en": "Your own cloud compiler",
    "de": "Eigener Cloud-Compiler"
  },
  "Репозиторий": {
    "en": "Repository",
    "de": "Repository"
  },
  "Токен": {
    "en": "Token",
    "de": "Token"
  },
  "Проверить доступ": {
    "en": "Check access",
    "de": "Zugriff prüfen"
  },
  "Сбросить": {
    "en": "Reset",
    "de": "Zurücksetzen"
  },
  "Токен GitHub необходим для сборки.": {
    "en": "A GitHub token is required to build firmware.",
    "de": "Zum Erstellen der Firmware ist ein GitHub-Token erforderlich."
  },
  "Создать токен GitHub ↗": {
    "en": "Create GitHub token ↗",
    "de": "GitHub-Token erstellen ↗"
  },
  "Внешний вид": {
    "en": "Appearance",
    "de": "Darstellung"
  },
  "Тема": {
    "en": "Theme",
    "de": "Design"
  },
  "Тёмная": {
    "en": "Dark",
    "de": "Dunkel"
  },
  "Светлая": {
    "en": "Light",
    "de": "Hell"
  },
  "О приложении": {
    "en": "About",
    "de": "Über die App"
  },
  "Flasher Studio · v0.2.62. Универсальная облачная сборка, USB/UART-программирование (первый аппаратный релиз).": {
    "en": "Flasher Studio · v0.2.62. Universal cloud builds, USB/UART programming (first hardware release).",
    "de": "Flasher Studio · v0.2.62. Universelle Cloud-Builds, USB/UART-Programmierung (erste Hardware-Version)."
  },
  "Монитор порта": {
    "en": "Serial monitor",
    "de": "Serieller Monitor"
  },
  "Последовательный терминал и графики в реальном времени.": {
    "en": "Serial terminal and real-time plots.",
    "de": "Serielles Terminal und Echtzeitdiagramme."
  },
  "Автоматически · USB / COM": {
    "en": "Automatic · USB / COM",
    "de": "Automatisch · USB / COM"
  },
  "Скорость, бод": {
    "en": "Baud rate",
    "de": "Baudrate"
  },
  "Подключить": {
    "en": "Connect",
    "de": "Verbinden"
  },
  "Параметры UART": {
    "en": "UART settings",
    "de": "UART-Einstellungen"
  },
  "Биты": {
    "en": "Data bits",
    "de": "Datenbits"
  },
  "Чётность": {
    "en": "Parity",
    "de": "Parität"
  },
  "Нет": {
    "en": "None",
    "de": "Keine"
  },
  "Стоп-биты": {
    "en": "Stop bits",
    "de": "Stoppbits"
  },
  "Терминал": {
    "en": "Terminal",
    "de": "Terminal"
  },
  "Графики": {
    "en": "Plots",
    "de": "Diagramme"
  },
  "Пауза": {
    "en": "Pause",
    "de": "Pause"
  },
  "Очистить": {
    "en": "Clear",
    "de": "Leeren"
  },
  "Скачать": {
    "en": "Download",
    "de": "Herunterladen"
  },
  "Автопрокрутка": {
    "en": "Auto-scroll",
    "de": "Automatisch scrollen"
  },
  "Время": {
    "en": "Time",
    "de": "Zeit"
  },
  "Точек на графике": {
    "en": "Points per plot",
    "de": "Datenpunkte im Diagramm"
  },
  "Отправляй числа через пробел или запятую, либо": {
    "en": "Send numbers separated by spaces or commas, or use",
    "de": "Sende Zahlen durch Leerzeichen oder Kommas getrennt oder verwende"
  },
  ". Каждая строка — один отсчёт. До 8 кривых.": {
    "en": ". Each line is one sample. Up to 8 curves.",
    "de": ". Jede Zeile ist ein Messwert. Bis zu 8 Kurven."
  },
  "RX 0 Б · TX 0 Б · 0 точек": {
    "en": "RX 0 B · TX 0 B · 0 points",
    "de": "RX 0 B · TX 0 B · 0 Punkte"
  },
  "Отправить": {
    "en": "Send",
    "de": "Senden"
  },
  "Окончание строки": {
    "en": "Line ending",
    "de": "Zeilenende"
  },
  "Новая строка (LF)": {
    "en": "New line (LF)",
    "de": "Zeilenumbruch (LF)"
  },
  "Без окончания": {
    "en": "No ending",
    "de": "Kein Zeilenende"
  },
  "Эхо TX": {
    "en": "TX echo",
    "de": "TX-Echo"
  },
  "Данные обрабатываются локально. При переходе к прошивке монитор освобождает порт. Некоторые платы сбрасываются при открытии COM-порта.": {
    "en": "Data is processed locally. The monitor releases the port when programming begins. Some boards reset when the COM port opens.",
    "de": "Die Daten werden lokal verarbeitet. Der Monitor gibt den Port vor der Programmierung frei. Einige Platinen werden beim Öffnen des COM-Ports zurückgesetzt."
  },
  "Целевая плата": {
    "en": "Target board",
    "de": "Zielplatine"
  },
  "Семейство, чип и конкретная модель": {
    "en": "Family, chip and exact model",
    "de": "Familie, Chip und genaues Modell"
  },
  "Микроконтроллер / серия": {
    "en": "Microcontroller / series",
    "de": "Mikrocontroller / Serie"
  },
  "Группа STM32": {
    "en": "STM32 group",
    "de": "STM32-Gruppe"
  },
  "По буквам": {
    "en": "By letter",
    "de": "Nach Buchstaben"
  },
  "Серия": {
    "en": "Series",
    "de": "Serie"
  },
  "Конкретная плата / модель": {
    "en": "Exact board / model",
    "de": "Genaue Platine / Modell"
  },
  "Все серии": {
    "en": "All series",
    "de": "Alle Serien"
  },
  "Показать ещё": {
    "en": "Show more",
    "de": "Mehr anzeigen"
  },
  "База моделей STM32": {
    "en": "STM32 model database",
    "de": "STM32-Modelldatenbank"
  },
  "Обновить из базы ST": {
    "en": "Update from ST database",
    "de": "Aus ST-Datenbank aktualisieren"
  },
  "Импортировать ZIP базы ST": {
    "en": "Import ST database ZIP",
    "de": "ZIP der ST-Datenbank importieren"
  },
  "Можно скачать ZIP и импортировать его без сетевого доступа из приложения. Варианты с x — шаблоны маркировки, а не точный код заказа.": {
    "en": "Download the ZIP and import it without network access from the app. Variants with x are part-number patterns, not exact order codes.",
    "de": "Die ZIP-Datei kann heruntergeladen und ohne Netzwerkzugriff in der App importiert werden. Varianten mit x sind Bezeichnungsmuster, keine exakten Bestellnummern."
  },
  "Скачать официальную базу ST ↗": {
    "en": "Download official ST database ↗",
    "de": "Offizielle ST-Datenbank herunterladen ↗"
  },
  "Точная маркировка MCU": {
    "en": "Exact MCU part number",
    "de": "Genaue MCU-Bezeichnung"
  },
  "Подтвердить плату": {
    "en": "Confirm board",
    "de": "Platine bestätigen"
  },
  "Установка загрузчика": {
    "en": "Bootloader installation",
    "de": "Bootloader-Installation"
  },
  "Пакет": {
    "en": "Package",
    "de": "Paket"
  },
  "Обновление": {
    "en": "Update",
    "de": "Update"
  },
  "OTA в приложении": {
    "en": "OTA in the application",
    "de": "OTA in der Anwendung"
  },
  "Служебная прошивка": {
    "en": "Service firmware",
    "de": "Service-Firmware"
  },
  "Файл загрузчика": {
    "en": "Bootloader file",
    "de": "Bootloader-Datei"
  },
  "BIN, HEX, UF2 или ZIP · для выбранного MCU": {
    "en": "BIN, HEX, UF2 or ZIP · for selected MCU",
    "de": "BIN, HEX, UF2 oder ZIP · für gewählten MCU"
  },
  "Установка может стереть текущую прошивку и данные. Подтверждаю.": {
    "en": "Installation may erase existing firmware and data. I confirm.",
    "de": "Die Installation kann vorhandene Firmware und Daten löschen. Ich bestätige dies."
  },
  "Установка недоступна": {
    "en": "Installation unavailable",
    "de": "Installation nicht verfügbar"
  },
  "Перейти к OTA": {
    "en": "Go to OTA",
    "de": "Zu OTA wechseln"
  },
  "Драйвер установки пока недоступен": {
    "en": "Installation driver not available yet",
    "de": "Installationstreiber noch nicht verfügbar"
  },
  "Вернуть автоматически определённую конфигурацию": {
    "en": "Restore auto-detected configuration",
    "de": "Automatisch erkannte Konfiguration wiederherstellen"
  },
  "Сбросить к автоматически определённой конфигурации": {
    "en": "Reset to auto-detected configuration",
    "de": "Auf automatisch erkannte Konfiguration zurücksetzen"
  },
  "Операция программирования": {
    "en": "Programming operation",
    "de": "Programmiervorgang"
  },
  "Вид каталога": {
    "en": "Catalog view",
    "de": "Katalogansicht"
  },
  "Раздел каталога": {
    "en": "Catalog section",
    "de": "Katalogbereich"
  },
  "Поиск: проект, плата, версия, устройство": {
    "en": "Search: project, board, version, device",
    "de": "Suche: Projekt, Platine, Version, Gerät"
  },
  "Поиск проектов": {
    "en": "Search projects",
    "de": "Projekte suchen"
  },
  "Поиск: загрузчик, чип, версия, устройство": {
    "en": "Search: bootloader, chip, version, device",
    "de": "Suche: Bootloader, Chip, Version, Gerät"
  },
  "Поиск загрузчиков": {
    "en": "Search bootloaders",
    "de": "Bootloader suchen"
  },
  "Имя, плата, ID, проект…": {
    "en": "Name, board, ID, project…",
    "de": "Name, Platine, ID, Projekt…"
  },
  "Поиск устройств": {
    "en": "Search devices",
    "de": "Geräte suchen"
  },
  "Полученные данные": {
    "en": "Received data",
    "de": "Empfangene Daten"
  },
  "График числовых данных": {
    "en": "Numeric data plot",
    "de": "Diagramm numerischer Daten"
  },
  "Команда…": {
    "en": "Command…",
    "de": "Befehl…"
  },
  "Закрыть": {
    "en": "Close",
    "de": "Schließen"
  },
  "Поиск по маркировке": {
    "en": "Search by part number",
    "de": "Nach Bauteilbezeichnung suchen"
  },
  "Например STM32G431CBT6": {
    "en": "For example STM32G431CBT6",
    "de": "Zum Beispiel STM32G431CBT6"
  },
  "Сборка": {
    "en": "Build",
    "de": "Build"
  },
  "Монитор": {
    "en": "Monitor",
    "de": "Monitor"
  },
  "Язык интерфейса": {
    "en": "Interface language",
    "de": "Oberflächensprache"
  },
  "Предварительная локализация: часть динамических сообщений ещё не переведена.": {
    "en": "Localization preview: some dynamic messages are not translated yet.",
    "de": "Lokalisierungsvorschau: Einige dynamische Meldungen sind noch nicht übersetzt."
  }
};
  const KEY = 'flasher-studio.ui-language.v1';
  const supported = value => ['ru','en','de'].includes(value) ? value : 'ru';
  function load(storage) { try { return supported(storage.getItem(KEY)); } catch { return 'ru'; } }
  function save(storage, value) { try { storage.setItem(KEY,supported(value)); return true; } catch { return false; } }
  function translate(source, language) {
    return language === 'ru' ? source : (Object.hasOwn(MESSAGES, source) ? MESSAGES[source][language] : undefined) ?? source;
  }
  let language = 'ru', nodes = [], attrs = [];
  function track(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode, parent=node.parentElement;
      if(!parent || parent.closest('script,style,pre,code,textarea,input')) continue;
      const source=node.data.trim();
      if(!Object.hasOwn(MESSAGES,source)) continue;
      const prefix=node.data.slice(0,node.data.indexOf(source)),suffix=node.data.slice(prefix.length+source.length);
      nodes.push({node,source,prefix,suffix,last:node.data});
    }
    for(const element of root.querySelectorAll('[title],[aria-label],[placeholder]')){
      for(const name of ['title','aria-label','placeholder']){
        const source=element.getAttribute(name);
        if(source!==null && Object.hasOwn(MESSAGES,source)) attrs.push({element,name,source,last:source});
      }
    }
  }
  function apply(value) {
    language=supported(value);
    document.documentElement.lang=language;
    for(const record of nodes){
      // A render may have replaced the original node; never overwrite dynamic or user text.
      if(!record.node.isConnected || record.node.data!==record.last) continue;
      record.last=record.prefix+translate(record.source,language)+record.suffix;
      if(record.node.data!==record.last)record.node.data=record.last;
    }
    for(const record of attrs){
      if(!record.element.isConnected || record.element.getAttribute(record.name)!==record.last)continue;
      record.last=translate(record.source,language);
      if(record.element.getAttribute(record.name)!==record.last)record.element.setAttribute(record.name,record.last);
    }
  }
  function start(storage) {
    const selector=document.getElementById('fsLanguage');
    if(!selector) return;
    track(document.getElementById('nav'));
    selector.value=load(storage);
    apply(selector.value);
    selector.addEventListener('change',()=>{save(storage,selector.value);apply(selector.value);});
  }
  // Snapshot original markup before the app loads persisted projects or devices.
  function capture(){track(document.body);}
  return {capture,start,translate,load,save,supported};
})();
