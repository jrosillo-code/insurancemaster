/**
 * @rosillo/auth — identity, authority and session handling.
 *
 * Authority is computed server-side from recorded grants and expressed as a concrete
 * id allow-list (`AuthorisedScope`). Nothing downstream may widen it.
 */

export * from './authority';
export * from './employees';
export * from './session';
export * from './throttle';
