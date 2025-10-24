export interface CharacterSummary {
  name: string
  world: string
  job: string
  jobDetail?: string | null
  level: number
  exp: number
  expRate?: string | null
  guild?: string | null
  image?: string | null
  gender?: string | null
  createDate?: string | null
  accessFlag?: string | null
  liberationQuestClear?: string | null
}

export interface UnionOverviewSummary {
  level?: number | null
  grade?: string | null
  artifactLevel?: number | null
  artifactPoint?: number | null
}

export interface RankingRecord {
  date: string
  ranking: number
  characterName: string
  characterLevel: number
  expRate?: string | null
  worldName: string
  className: string
}

export interface ExperiencePoint {
  date: string
  level: number
  exp: number
  gain: number
}

export interface EquipmentStatBlock {
  str?: string
  dex?: string
  int?: string
  luk?: string
  maxHp?: string
  maxMp?: string
  attackPower?: string
  magicPower?: string
  armor?: string
  speed?: string
  jump?: string
  bossDamage?: string
  damage?: string
  allStat?: string
  criticalRate?: string
}

export interface EquipmentItemSummary {
  itemName: string
  icon: string | null
  slot: string
  base: EquipmentStatBlock
  additional?: EquipmentStatBlock
  starforce?: EquipmentStatBlock
  potential?: string[]
  additionalPotential?: string[]
  isUniqueEquip?: boolean
  scrollCount?: string
}
