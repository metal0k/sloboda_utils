# SlobodaMap

Интерактивная карта Андреевской Слободы. Личный трекер задач по домам — отмечаю
зелёным «готово» и красным «проблема», состояние сохраняется между устройствами
через ссылку с хэшем (без бэкенда).

Live: <https://metal0k.github.io/sloboda_utils/>

## Стек

- Vite 5 + TypeScript 5 (strict), без UI-фреймворков
- SVG карты инлайнится в страницу через `?raw`
- localStorage (`slobodaState/v2`) + URL-hash для синхронизации между устройствами
- Деплой: GitHub Actions → GitHub Pages

## Разработка

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit (strict)
npm run build        # → dist/
npm run preview      # локальный сервер для собранного dist/
```

`npm run build` сначала запускает `prebuild` → `scripts/generate-houses.ts`,
который сканирует `public/sloboda_house_numbers.svg`, извлекает все `<text id>`
и генерирует `src/houses.generated.ts`. Сгенерированный файл закоммичен —
это нужно, чтобы `npm run dev` работал без предварительной генерации.

## Деплой

Push в `main` → GitHub Actions (`.github/workflows/deploy.yml`) собирает и
публикует `dist/` на GitHub Pages.

В Settings → Pages источник должен быть выставлен в **GitHub Actions**.
Первый запуск workflow создаст environment `github-pages` автоматически.

## Редактирование карты

Когда дома меняются (новый, снос, смена нумерации):

1. Откройте `public/sloboda_house_numbers.svg` в Inkscape (или любом SVG-редакторе).
2. Каждый номер дома — это `<text>` с `id="_<номер>"` (например `_42`) или
   `id="_<номер>_2"` для адресов вида «42/2».
3. Сохраните, запустите `npm run build` (или `npm run dev` — генератор работает
   через `prebuild`, но для дев-сервера можно один раз вручную:
   `npx tsx scripts/generate-houses.ts`).
4. Если меняется список «отключённых» домов (например, дом снесли) —
   правьте `DISABLED_HOUSE_IDS` в `src/houses.ts`.

`ACTIVE_HOUSE_COUNT` пересчитывается автоматически.

## Архитектура

```
src/
  main.ts                 # точка входа: инлайнит SVG, инициализирует UI
  state.ts                # типизированный store, persistence в localStorage
  houses.ts               # источник правды о списке домов
  houses.generated.ts     # сгенерировано из SVG
  url-state.ts            # encode/decode компактного hash-стейта
  map.ts                  # биндинги кликов на SVG <text>
  ui/
    title.ts              # редактируемый заголовок кампании
    stats.ts              # «N / 67 · X%» pill
    sheet.ts              # bottom-sheet / sidebar (export/import/share/bulk)
    gestures.ts           # pan + pinch-zoom через Pointer Events
  styles/
    main.css              # дизайн-токены, layout
public/
  sloboda_map_back.png    # спутниковая подложка
  sloboda_house_numbers.svg
  favicon.ico, icon.png, site.webmanifest, robots.txt
scripts/
  generate-houses.ts      # SVG → houses.generated.ts
.github/workflows/
  deploy.yml              # CI на Pages
```

## Синхронизация между устройствами

GitHub Pages — только статика, бэкенда нет. Сценарий:

1. На устройстве A нажмите «Поделиться» в меню → ссылка с хэшем
   (`#s=...`) копируется в буфер.
2. Откройте ссылку на устройстве B → появится баннер «Принять состояние из ссылки?».
3. Принять → стейт перезаписывается локально, хэш убирается из URL.

Резервная копия: «Экспорт JSON» в меню сохраняет файл; «Импорт JSON» восстанавливает.

## Лицензия

MIT, см. `LICENSE.txt`.
