/**
 * @rosillo/domain — the canonical contracts of the Rosillo AI Platform.
 *
 * Everything the platform treats as true crosses this package: evidence and its
 * provenance, the approved intent taxonomy, the server-side action catalogue, the
 * answer contract and the client→employee handoff. No package may widen these
 * boundaries locally; changes here are reviewed as product and compliance changes.
 *
 * SYNTHETIC DATA ONLY.
 */

export * from './evidence';
export * from './scope';
export * from './intents';
export * from './actionCatalogue';
export * from './answer';
export * from './handoff';
export * from './aiRun';
export * from './limits';
export * from './untrusted';
export * from './build';
export * from './text';
