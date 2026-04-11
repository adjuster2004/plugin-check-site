# Plugin check ssl certificate - плагин для проверки срока действия сертификатов сайтов

Доступ к странице по http://0.0.0.0:9090/ - порт можно сменить в python скрипте и настройках docker

## 🛠️ Последовательность
- **Склонировать репозиторий**
```bash
git clone https://github.com/adjuster2004/plugin-check-ssl/
cd plugin-check-ssl
```

- **Собираем образ**
```bash
docker-compose build --no-cache
docker build -t ssl-checker-api .
```

- **Открываем в браузере**
http://localhost:9090/

<img width="242" height="110" alt="image" src="https://github.com/user-attachments/assets/e00fe59f-320e-4d1a-838e-110c0c0ca458" />

- **Для проверки дописываем домен**

http://localhost:9090/?domains=google.com

<img width="330" height="100" alt="image" src="https://github.com/user-attachments/assets/f9cc5853-d864-409b-bafd-602abc478ed6" />


- **А чтобы не делать это вручную используем плагин.**

Устанавливаем через режим разработчика

<img width="330" height="444" alt="image" src="https://github.com/user-attachments/assets/8caad886-f882-41a1-9674-d87fba1f8a7b" />

- **Заполняем поля**

Так плагин будет автоматом стучаться в docker и получать информацию по ssl сертификатам

- **Работают уведомления в трее**

<img width="264" height="74" alt="image" src="https://github.com/user-attachments/assets/268b22b0-bb8f-443e-a6cc-96f6b15dcf67" />


## 📄 Лицензия
Этот проект распространяется под лицензией **MIT**.

Copyright (c) 2025 Sergey S @adjuster2004

Подробности в файле [LICENSE](LICENSE).
