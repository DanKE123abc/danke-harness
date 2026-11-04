/** Bonus notice retry timings shared by Host and Client. */
import z from '@deepseek-ai/schemastery'

/** Bonus notice acknowledgement retry timings shared by Host and Client. */
export interface BonusNoticeConfig {
  /** First delay before retrying a failed bonus acknowledgement. */
  bonusAckRetryDelayMs: number
  /** Ceiling for the acknowledgement retry backoff. */
  bonusAckRetryMaxDelayMs: number
}
/** Validate bonus acknowledgement retry options. */
export const BonusNoticeConfigFields = {
  bonusAckRetryDelayMs: z.number().min(1).default(1_000),
  bonusAckRetryMaxDelayMs: z.number().min(1).default(60_000),
}
/** Validate bonus acknowledgement retry options. */
export const BonusNoticeConfig: z<Partial<BonusNoticeConfig>, BonusNoticeConfig> = z.object(BonusNoticeConfigFields)
/** Bootstrap key containing no account credentials. */
export const BONUS_NOTICE_CONFIG_GLOBAL = '__DSH_BONUS_NOTICE_CONFIG__'
