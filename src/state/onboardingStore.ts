// src/state/onboardingStore.ts
let _answers: any = null;

export const onboardingStore = {
  set(answers: any) { _answers = answers; },
  get() { return _answers; },
  clear() { _answers = null; },
};