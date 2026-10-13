# Голос капелюха в ElevenLabs

Капелюх — старий чоловік, давній, трохи бурчливий, але теплий. Не копія жодного
відомого персонажа: не імітувати голоси з фільмів чи франшиз.

## 1. Voice Design (Voices → Add voice → Voice Design)

Модель: Eleven v3 (найкраще тримає українську й аудіотеги).

**Опис голосу** (поле Prompt, англійською — так модель розуміє точніше):

> A very old man, around 85, speaking Ukrainian with a natural native accent.
> Deep, warm, slightly raspy and dusty voice with a gentle tremble, like an
> ancient storyteller who has been asleep for a century and just woke up.
> Unhurried pace with theatrical pauses, a hint of sly humour and mischief,
> knowing and a little grumpy but kind. Close-mic, dry studio recording,
> no music, no background noise, no reverb.

**Текст для прев’ю** (треба щонайменше 100 символів):

> Ага, ось і ти! Я чекав… довго чекав. Сто років сплю на цій полиці, а тут —
> ти. Ну, підходь ближче, не бійся старого капелюха.

Згенерувати 3 варіанти, вибрати найстарішого й найтеплішого, зберегти голос.

## 2. Text to Speech

Голос — щойно збережений, модель Eleven v3. Налаштування:

- Stability: **Creative** або близько 0.35 — більше інтонацій і «акторства»;
- Similarity: 0.75;
- Style exaggeration (якщо є): 0.3–0.4;
- Speaker boost: увімкнено.

**Текст** (аудіотеги в квадратних дужках v3 розуміє і не вимовляє):

```
[waking up, yawning] Ага-а… [surprised, warm] ось і ти! [pause]
[slyly] Я чекав.
[mysteriously] Тебе запрошено на Вечір старих чарів.
[slowly, clearly] Двадцятого грудня… о сьомій вечора.
Кав'ярня «Старий годинник», Ярославська, дванадцять.
[pause] [stern, then chuckles] Не запізнюйся. Бо я все бачу.
```

Цільова довжина 15–30 с. Якщо вийшло довше — прибрати `[pause]`.

## 3. Експорт

- Формат: MP3 44.1 кГц 128 kbps (будь-який, далі стиснемо самі).
- Файл назвати `invite.mp3` і покласти в `static/media/`
  (або інший шлях — тоді змінити `assets.audio` у `src/lib/config.ts`).
- Стиснути до мови (моно, 48 kbps, ~150 КБ):

```bash
npm run voice:pack -- шлях/до/завантаженого.mp3
```

Якщо змінився текст — онови `speech.lines` у конфігу: з нього йдуть субтитри.
