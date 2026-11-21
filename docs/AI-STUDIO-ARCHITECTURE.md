# AI Studio — архитектура kirillovec.ru

## Текущее состояние (обновлено 21.11.2026)
- Публичный сайт публикуется через GitHub Pages; исходники находятся в репозитории `kirillovec/kirillovec`.
- Интерфейс AI Studio: `https://kirillovec.ru/studio/`.
- API: Cloudflare Worker `kirillovec-ai-studio-api`, публичный health-check `/health`.
- Метаданные задач и лимиты хранятся в Cloudflare D1 `kirillovec-ai-studio`.
- Text-to-image: Cloudflare Workers AI `@cf/black-forest-labs/flux-1-schnell`.
- Редактирование по референсу: Cloudflare Workers AI `@cf/black-forest-labs/flux-2-klein-4b`; браузер подготавливает JPEG-референс с размером до 2048 px по длинной стороне и адаптивным сжатием в пределах лимита API.
- Поддерживаемые входные форматы: JPEG, PNG, WEBP; лимит исходного файла — 4 МБ.
- Результат показывается в Studio и доступен для скачивания; локальная история изображений и библиотека сохранённых проектов хранятся в браузере; проекты можно экспортировать в JSON.
- Музыкальный режим по умолчанию работает как ручной Suno-пакет (Style + Lyrics + настройки + переход в Suno). API-генерация дополнительно защищена флагом `ENABLE_PAID_SUNO_API=true` и секретом `SUNO_API_KEY`; без явного включения endpoint возвращает `SUNO_API_DISABLED`.
- Встроенная генерация видео отключена; режим видео пока служит для подготовки промптов и перехода к внешнему сервису.
- R2 не требуется для текущего inline-потока изображений и не должен создаваться без отдельного согласования.
- Реальный end-to-end тест генерации с расходованием суточной квоты должен выполняться отдельно; зелёный CI подтверждает синтаксис и публикацию, но сам по себе не доказывает успешный инференс модели.

## Целевая архитектура: гибридная
1. **Frontend**: текущая статическая страница на GitHub Pages. Не содержит секретов.
2. **API gateway/backend**: отдельный сервис (например, Cloudflare Workers, Fly.io, Render или VPS), который авторизует пользователя, валидирует входные параметры, выдаёт задания и хранит состояние.
3. **Внешние провайдеры**: адаптеры для image generation, image-to-image, text-to-video, image-to-video и video processing. Подключать провайдеры через унифицированный интерфейс, чтобы менять поставщика без переделки UI.
4. **Собственные модели**: отдельный worker/endpoint на GPU-сервере. Вызывать его через тот же интерфейс задач.
5. **Хранилище**: объектное хранилище для исходников и результатов; метаданные и история — в базе данных.
6. **Очередь задач**: асинхронные статусы `queued`, `running`, `succeeded`, `failed`; повторы с ограничением, тайм-ауты и обработка ошибок провайдера.
7. **Секреты**: API-ключи только в secret manager / переменных окружения backend, никогда в HTML, репозитории или браузерном коде.

## Предлагаемый контракт API
- `GET /api/v1/capabilities` — список доступных инструментов и моделей.
- `POST /api/v1/jobs` — создать задачу: `{ mode, prompt, inputAssetId?, model, aspectRatio, quality, duration? }`.
- `GET /api/v1/jobs/:id` — статус и метаданные результата.
- `GET /api/v1/jobs?cursor=...` — история пользователя.
- `POST /api/v1/assets/presign` — безопасная выдача URL для загрузки файла.
- `GET /api/v1/assets/:id` — метаданные и доступ к результату.

## Этапы реализации
1. Подтвердить frontend и UX на GitHub Pages.
2. Выбрать backend-хостинг и провайдера изображений/видео; проверить цены, доступность и условия хранения данных.
3. Добавить аутентификацию и ограничения использования.
4. Реализовать адаптер первого провайдера и асинхронную очередь.
5. Подключить собственную модель как второй адаптер, если доступен GPU endpoint.
6. Добавить объектное хранилище, галерею результатов, удаление и сроки хранения.
7. Добавить мониторинг, лимиты расходов, защиту от злоупотреблений и тесты.

## Важные ограничения
- GitHub Pages — статический хостинг, сам по себе не запускает backend или GPU-модели.
- Функции face swap, клонирования голоса и работа с изображениями людей требуют проверки прав пользователя, согласия и политики провайдера.
- Нельзя заявлять, что генерация работает, пока успешный реальный запрос к модели не прошёл end-to-end.


## Product direction (21.11.2026)
The primary product is AI Creative Studio, not the artist portfolio. Main tools:
1. Audio: Suno-oriented Style/Lyrics builder, prompt pack handoff to Suno. The third-party Suno API path is disabled in the UI and guarded server-side; it requires the explicit Worker variable `ENABLE_PAID_SUNO_API=true` plus `SUNO_API_KEY`.
2. Images: text-to-image and image-to-image using the existing Workers AI binding.
3. Video: prompt builder and handoff to external services; no claim of in-site video rendering until a provider is actually integrated.
4. Text: local editable templates and structured briefs. Server-side LLM generation is not enabled yet.

## Cost and storage rules
- Keep the manual Suno handoff as the default no-provider-key workflow.
- The backend Suno API integration is third-party and may be paid; it is disabled by default in both frontend and backend. Only enable it after a separate cost decision by setting `ENABLE_PAID_SUNO_API=true` in the Worker environment.
- Do not add R2 or other paid object storage without a separate approval.
- Save small project metadata and editable drafts in browser-local storage; provide export so users can back up their work.
- Image outputs remain downloadable from the inline response; no persistent asset bucket is required for the current path.

## Frontend modes
- `/studio/?mode=audio`
- `/studio/?mode=image`
- `/studio/?mode=video`
- `/studio/?mode=text`

The homepage prioritizes Audio and Images, with Video and Text as first-class tools. Artist and portfolio pages remain secondary destinations.
