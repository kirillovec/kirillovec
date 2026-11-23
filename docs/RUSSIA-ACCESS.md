# Доступность kirillovec.ru из России без VPN

## Что обнаружено

- Статический сайт публикуется через GitHub Pages (workflow `.github/workflows/deploy.yml`).
- В корне репозитория находится `CNAME` со значением `kirillovec.ru`.
- Основной API настроен как `https://api.kirillovec.ru` и развёрнут на Cloudflare Workers.
- Фронтенд обращается к Cloudflare API для генерации изображений, авторизации, истории и проверки возможностей.
- Cloudflare сообщал о систематическом ограничении трафика к сайтам за Cloudflare со стороны российских ISP примерно до 16 KB на соединение. Это внешнее сетевое ограничение; исправлением JavaScript его не устранить.

## Безопасный первый шаг: вывести статический сайт из Cloudflare Proxy

Если DNS-записи `kirillovec.ru` и `www` сейчас имеют статус Proxied (оранжевая туча), для GitHub Pages их следует перевести в DNS only (серая туча). Не удалять DNS-записи и не менять nameservers вслепую.

Для apex-домена GitHub Pages документирует следующие A-записи:

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

Для `www` использовать CNAME на `kirillovec.github.io` (DNS only), если этот поддомен включён в настройках Pages. Оставить файл `CNAME` в корне репозитория и подтвердить custom domain в GitHub Pages.

Не менять MX, TXT, SPF, DKIM, DMARC, почтовые записи и прочие несвязанные записи. Перед изменениями сохранить полный экспорт текущей DNS-зоны. Проверить A/AAAA/CNAME, TLS и редиректы после распространения DNS.

## Что не решается отключением Proxy

`api.kirillovec.ru` обслуживается Cloudflare Worker. Перевод DNS-записи в DNS only не переносит выполнение Worker на другой хостинг. Для стабильного API из РФ backend требуется перенести на хостинг, который доступен из российских сетей, либо использовать российский AI-сервис напрямую в отдельном авторизованном пользовательском потоке.

В текущей бесплатной архитектуре Worker использует Cloudflare Workers AI и D1. Полноценный перенос этих функций на другой провайдер требует нового хоста, базы данных, секретов, OAuth callback URL, миграции D1 и тестирования. Нельзя безопасно подменить API на статический файл или раскрывать API-ключ провайдера в браузере.

## Резервные маршруты в интерфейсе

В Studio добавлены ссылки на российские сервисы:

- GigaChat — текст и генерация изображений через Kandinsky.
- Шедеврум — изображения и короткие видео.
- Локальные конструкторы промптов, импорт/экспорт проектов и скачивание TXT работают без обращения к основному API.

Внешние сервисы требуют собственную авторизацию; доступность и лимиты определяет их владелец. Это резервный маршрут, а не встроенная серверная генерация kirillovec.ru.

## Что нельзя считать подтверждённым

Без тестирования из нескольких российских провайдеров нельзя гарантировать доступность домена из каждой сети РФ. Также нельзя считать генерацию внутри Studio восстановленной, пока API остаётся на Cloudflare Worker.

## Проверка после DNS-перехода

1. Проверить открытие `https://kirillovec.ru/` и `https://kirillovec.ru/studio/` через несколько российских операторов.
2. Проверить загрузку `studio/app.js`, `studio/config.js`, CSS и фото.
3. Проверить `https://api.kirillovec.ru/health` и `/api/v1/capabilities`.
4. Проверить CORS, cookies, OAuth callback, загрузку исходного изображения и скачивание результата.
5. Запускать реальную генерацию только после подтверждения доступности API и согласованного расходования квоты.

## Источники

- Cloudflare: https://blog.cloudflare.com/russian-internet-users-are-unable-to-access-the-open-internet/
- GitHub Pages custom domain: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- GitHub Pages DNS: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site
- GigaChat image generation: https://developers.sber.ru/docs/ru/gigachat/guides/images-generation
- Yandex Shedevrum: https://yandex.ru/support/shedevrum/ru/
