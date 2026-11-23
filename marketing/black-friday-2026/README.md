# Black Friday 2026: announcement video

A 17-second vertical spot (1080×1920, 30 fps, with sound) for Reels, TikTok, WhatsApp Status, Facebook and Instagram Stories.

**The offer it states:** Black Friday, 24 to 27 November 2026, on selected products only, valid on the online shop (jrimporters.com) only and not in store.

| Time | Scene |
| --- | --- |
| 0–2 s | The shop's coastline photo in daylight: *"This week, the coast goes…"*. The lights flicker out. |
| 2–5 s | **BLACK FRIDAY** slams in. |
| 5–8 s | Four calendar tiles flip in: Tue 24, Wed 25, Thu 26, **Fri 27**. *"4 days only"* |
| 8–10.5 s | A swinging deal tag: *"Deals on selected products"* |
| 10.5–14 s | A phone types `jrimporters.com`: *"Online only, not in store"*. The camera dives into the screen… |
| 14–17 s | …and lands on the end card: dates, the web address, and the terms in small print. |

The picture uses the shop's own fonts (Archivo, Manrope), colours, coastline artwork and logo, read directly from the repo. The soundtrack is original: `audio.py` synthesises it from scratch, so there are no licensing issues.

## Changing it

Every on-screen date and phrase is plain text in `comp.html`, and every cue time is in `timing.json`. Picture and sound both read `timing.json`, so a cue moved there stays in sync with its sound.

## Rendering

Needs Node with Playwright and Chromium, ffmpeg, and Python 3 with `numpy` and `scipy`.

```bash
node render.mjs video 120 out/video-silent.mp4    # 120 fps sub-frames, blended to 30 fps for motion blur
python3 audio.py out/music.wav                    # soundtrack
python3 finish.py out/video-silent.mp4 out/music.wav out/final.mp4   # mux, loudness -14 LUFS
```

`node render.mjs stills 2.6,6.4,16.6` writes single frames to `stills/` for checking. `node render.mjs serve` previews it live in a browser, without sound.
