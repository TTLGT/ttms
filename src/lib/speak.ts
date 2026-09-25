/**
 * Reading a word aloud, for Learn English.
 *
 * The browser's own speech voice rather than a service: it is free, works
 * offline, sends nothing anywhere, and every browser the office uses has at
 * least one US English voice. Where it is missing the button is not drawn —
 * `canSpeak()` — rather than drawn and silent.
 */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  // US first, because the clients, carriers and drivers on the other end of
  // the phone are American; any English after that.
  return voices.find((v) => v.lang === 'en-US')
      ?? voices.find((v) => v.lang.startsWith('en'));
}

export function speak(text: string, slow = false) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  // A second click while the first is still talking starts over rather than
  // queueing behind it.
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  const voice = englishVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = slow ? 0.7 : 0.95;
  synth.speak(utterance);
}
