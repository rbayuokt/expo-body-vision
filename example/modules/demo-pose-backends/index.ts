import { requireNativeModule } from 'expo';

const native = requireNativeModule<{ register(): string[] }>('DemoPoseBackends');

/**
 * Registers Apple Vision as a second backend on iOS. Android has nothing extra (ML Kit is built
 * into the library there). Returns the names it registered. Safe to call more than once.
 */
export function registerDemoBackends(): string[] {
  return native.register();
}
