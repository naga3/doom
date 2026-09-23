// 効果音。WebAudio の矩形波だけで鳴らす。音声ファイルは持たない。
// AudioContext はユーザー操作のあとでしか始まらないので、最初の入力で起こす。

const VOICES = {
  shot:      { type: 'square',   from: 520, to: 120, dur: 0.09, gain: 0.16 },
  hit:       { type: 'square',   from: 900, to: 400, dur: 0.06, gain: 0.12 },
  kill:      { type: 'sawtooth', from: 260, to: 40,  dur: 0.32, gain: 0.18 },
  hurt:      { type: 'sawtooth', from: 180, to: 90,  dur: 0.20, gain: 0.20 },
  pickup:    { type: 'triangle', from: 660, to: 1320, dur: 0.14, gain: 0.16 },
  empty:     { type: 'square',   from: 140, to: 110, dur: 0.06, gain: 0.10 },
  nextlevel: { type: 'triangle', from: 440, to: 1760, dur: 0.45, gain: 0.18 },
  clear:     { type: 'triangle', from: 523, to: 2093, dur: 0.9,  gain: 0.20 },
  dead:      { type: 'sawtooth', from: 220, to: 30,  dur: 1.1,  gain: 0.22 },
};

let ctx = null;
let enabled = true;

export function setEnabled(value) {
  enabled = value;
}

export function resume() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

export function play(name) {
  const voice = VOICES[name];
  if (!voice || !enabled || !ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = voice.type;
  osc.frequency.setValueAtTime(voice.from, now);
  osc.frequency.exponentialRampToValueAtTime(voice.to, now + voice.dur);

  gain.gain.setValueAtTime(voice.gain, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.dur);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + voice.dur);
}
