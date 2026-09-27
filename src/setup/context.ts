import { createContext, useContext } from 'react';

import type { Framing } from '../types';
import type { SetupPrompt } from './prompts';
import type { SetupState } from './session';

export interface BodySetupContextValue {
  state: SetupState;
  /** Text for `state.prompt`, after prompt overrides. */
  text: string;
  framing: Framing;
  restart(): void;
}

export const BodySetupContext = createContext<BodySetupContextValue | null>(null);

/** Setup state of the enclosing `<BodyVisionView setup>`, or null when setup is off. */
export function useBodySetup(): BodySetupContextValue | null {
  return useContext(BodySetupContext);
}

export type { SetupPrompt, SetupState };
