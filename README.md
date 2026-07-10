# Eyesore Rhythm Game

DDR-style arrow build.

- Fixed vertical phone viewport
- Stationary arrow receptors
- Falling directional arrows
- Rebuilt chart aligned to the detected beat grid
- 263 notes
- Chart tempo: exactly 115 BPM
- First beat offset: 0.4644 seconds

Open `index.html` or serve the folder with `python -m http.server 8000`.

## Editing the chart

The chart in `chart.js` is locked to exactly **115 BPM**. Notes are written in
beats and converted to audio seconds automatically:

- `beat: 16` is beat 16.
- `beat: 16.5` is the eighth note halfway to beat 17.
- `beat: 16.25` is the sixteenth note after beat 16.
- Two notes with the same beat and different lanes create a jump.
- Lanes are `0 = left`, `1 = up`, `2 = down`, and `3 = right`.

Example:

```js
{ beat: 16, lane: 0, type: "tap", section: "VERSE I" },
{ beat: 16.5, lane: 1, type: "tap", section: "VERSE I" },
{ beat: 17, lane: 0, type: "tap", section: "VERSE I" },
{ beat: 17, lane: 3, type: "tap", section: "VERSE I" }, // jump
```

`AUDIO_OFFSET` is the time in seconds where beat zero occurs in the MP3. Adjust
only that value if the whole chart consistently feels early or late. Adjust an
individual note's `beat` if only that note or pattern feels wrong.
