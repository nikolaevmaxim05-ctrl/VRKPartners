// infrastructure/clock — системные часы.
import type { Clock } from '@core/application/ports/common'

export const systemClock: Clock = { now: () => new Date() }
