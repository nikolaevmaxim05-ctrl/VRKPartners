// infrastructure/clock — системний годинник.
import type { Clock } from '@core/application/ports/common'

export const systemClock: Clock = { now: () => new Date() }
