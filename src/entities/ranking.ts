import { RankingRecord } from '../api/types'

export interface CharacterRanking {
  ocid: string
  records: RankingRecord[]
  available: boolean
  message?: string
}
