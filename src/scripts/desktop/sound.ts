// System sounds. Filled in with original Web Audio sounds in sound-recipes.ts;
// this module only decides whether and when to play them.
export type SoundName = 'startup' | 'shutdown' | 'logoff' | 'ding' | 'chord' | 'exclamation' | 'click' | 'recycle' | 'menu';

export function play(_name: SoundName | string) {
  /* sounds arrive in a later step */
}

/** Call inside a click or key handler so browsers allow audio. */
export function unlockAudio() {
  /* sounds arrive in a later step */
}
