/** Host Typert manifest for the modelConsole namespace. */

import { CONSOLE_INVOCATIONS, PKG } from './wire.ts'

export const TYPERT = Object.freeze({
  package: PKG,
  face: 'host',
  schemas: Object.freeze([]),
  invocations: CONSOLE_INVOCATIONS,
  model: Object.freeze({
    services: Object.freeze([]),
    events: Object.freeze([]),
    objects: Object.freeze([]),
  }),
})
