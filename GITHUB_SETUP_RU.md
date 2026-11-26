# GitHub CI для Web v0.2.6

Перед первым коммитом создать и сохранить package-lock.json:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

CI устанавливает зависимости из lock, собирает браузерный bundle, выполняет оба набора тестов и сохраняет public/ в Actions. Деплой в Firebase не выполняется. Тесты не подтверждают работоспособность на реальном оборудовании. Сгенерированный bundle не хранится в Git. Исходники v0.2.6 не изменены.
