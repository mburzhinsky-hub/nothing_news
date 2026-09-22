# Glyph Weather TV — Samsung Tizen

TV-версия ambient weather display, сделанная под Samsung UE55AU7100UXRU (2021).

## Что внутри

- 1920×1080 TV UI, рассчитанный на 55" экран.
- Крупная dot-matrix температура.
- Собственный weather glyph.
- Анимированный дождь, снег, гроза, облачность и clear ambience.
- 5-дневный прогноз.
- Часы и дата.
- Пульт Samsung:
  - **OK** — открыть настройки.
  - **↑ / ↓** — перемещение по настройкам.
  - **← / →** — изменить значение.
  - **Back** — закрыть настройки / выйти из приложения.
  - **Red** — обновить погоду.
  - **Green** — включить/выключить weather FX.
- Города: Moscow, Rotterdam, London, New York, Dubai, Tokyo.
- °C / °F.
- Три визуальных glyph-стиля: Dots, Wire, Segment.
- Open-Meteo без API-ключа.
- Последние данные кэшируются локально; при отсутствии сети остаётся cached/demo экран.

## Совместимость

Проект настроен как Samsung TV Web Application с `required_version="6.0"`.

Модель из проекта пользователя: **UE55AU7100UXRU**, Samsung AU7100 2021.

## Запуск в браузере

Можно открыть `index.html` обычным браузером. Стрелки и Enter имитируют пульт.

Если репозиторий публикуется через GitHub Pages, превью доступно по пути:

`/tizen-tv/`

## Установка на телевизор

1. Установить Tizen Studio + Samsung TV Extension.
2. Создать Samsung/Tizen certificate profile.
3. Включить Developer Mode на ТВ и указать IP компьютера.
4. Подключить телевизор в Device Manager.
5. Импортировать папку `tizen-tv` как Tizen Web Project.
6. Build Signed Package / Run As → Tizen Web Application.

После подписи получится устанавливаемый `.wgt`.

## Важно

Файл `.wgt` нельзя нормально подготовить для установки без вашего Samsung/Tizen author/distributor certificate — сертификат привязан к вашему dev-профилю/телевизору. Сам исходный Tizen-проект уже готов.
