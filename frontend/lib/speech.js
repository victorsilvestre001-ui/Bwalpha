const KEY = "tradeon_voice";

export function isVoiceOn() {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export function setVoiceOn(on) {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  if (!on) try { window.speechSynthesis?.cancel(); } catch {}
}

export function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!synth || !isVoiceOn()) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "pt-BR";
    const voice = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
    if (voice) u.voice = voice;
    u.rate = 1.05;
    synth.speak(u);
  } catch {}
}
