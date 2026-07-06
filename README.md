# 🥭 Relapa — Freeze Dance

**Telegram Mini App** — танцуй под процедурную музыку и замерзай, когда она останавливается!

## Как играть

1. Музыка играет — **танцуй!** 💃
2. Музыка резко останавливается — **тапни кнопку FREEZE!** 🖐️
3. Не тапни слишком рано — проиграешь!
4. Не успеешь тапнуть — тоже проиграешь!

## Возможности

- 🎵 **Процедурная музыка** — синтезируется через Web Audio API (никаких файлов)
- 🎯 **Прогрессивная сложность** — окно фриза сужается каждый раунд (1800мс → 500мс)
- 🔥 **Комбо система** — серия успешных фризов даёт множитель до ×3.0
- ⏱️ **Daily Challenge** — каждый день одинаковая последовательность для всех
- 🏆 **Лидерборд** — сравнивайся с другими игроками
- 🏅 **12 ачивок** — от "First Freeze!" до "Legend" (2000 очков)
- 📱 **Telegram интеграция** — хаптика, Main Button, share в чат, авто-имя из Telegram
- 🎨 **SVG анимация** — Relapa (муравей-дирижёр) танцует Floss

## Telegram Mini App

Игра адаптирована для Telegram:
- **Touch-only** — большая кнопка FREEZE, оптимизированная для мобильных
- **Haptic feedback** — лёгкий тап, success, error, heavy на каждом моменте
- **Telegram Main Button** — "Start Game 🎵" в idle состоянии
- **Share** — результат отправляется в Telegram чат
- **Safe areas** — корректное отображение на устройствах с вырезом

## Технологии

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS 4** + shadcn/ui
- **Framer Motion** — анимации
- **Web Audio API** — процедурная музыка (ChuckyEngine)
- **Prisma + SQLite** — лидерборд
- **@telegram-apps/sdk-react** — Telegram WebApp SDK

## Деплой

1. Зарегистрируй бота в [@BotFather](https://t.me/BotFather)
2. Задеплой на [Vercel](https://vercel.com):
   ```bash
   npm i -g vercel
   vercel --prod
   ```
3. В BotFather: `/newapp` → вставь URL от Vercel
4. Готово! 🎉

## Структура

```
src/
├── app/
│   ├── page.tsx              # Telegram Mini App entry
│   ├── layout.tsx            # Mobile viewport, no-zoom
│   ├── globals.css           # Game animations + Telegram safe areas
│   └── api/leaderboard/      # POST/GET leaderboard
├── components/
│   ├── telegram-game.tsx     # 🎮 Mobile touch game (основной)
│   ├── telegram-provider.tsx # React context для Telegram SDK
│   ├── papaya-game.tsx       # Desktop solo game (keyboard)
│   ├── multiplayer-game.tsx  # Desktop multiplayer (2-4 players)
│   ├── papaya-character.tsx  # SVG Relapa ant conductor
│   └── ui/                   # shadcn/ui components
└── lib/
    ├── telegram.ts           # Haptics, Main Button, share
    ├── music.ts              # ChuckyEngine (Web Audio)
    ├── achievements.ts       # 12 achievements
    └── db.ts                 # Prisma client
```

## Лицензия

MIT