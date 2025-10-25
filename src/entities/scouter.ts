export interface MapleScouterBasicInfo {
  name: string
  level?: number
  expRate?: string
  job?: string
  world?: string
  guild?: string
  creationDate?: string
  popularity?: number
  arcaneForce?: number
  authenticForce?: number
  starforce?: number
  unionLevel?: number
  artifactLevel?: number
  power?: number
  dojangFloor?: number
  dojangTime?: number
  characterRanking?: number
  worldRanking?: number
  classRanking?: number
}

export interface MapleScouterCombatStats {
  combatPower?: number
  generalDamage380?: number
  hexaDamage380?: number
  generalDamage300?: number
  hexaDamage300?: number
  statScore?: number
}

export interface MapleScouterHexaNode {
  key: string
  label: string
  level: number
  icon?: string
  mainSkill?: string
  subSkills?: string[]
  subSkillIcons?: string[]
}

export interface MapleScouterHexaSummary {
  nodes: MapleScouterHexaNode[]
  usedErda?: number
  usedMeso?: number
}

export interface MapleScouterPotentialLine {
  grade?: string
  option: string
}

export interface MapleScouterSymbol {
  title: string
  level: number
  type: string
  icon?: string
}

export interface MapleScouterEquipmentStat {
  label: string
  value: string
}

export interface MapleScouterEquipment {
  slot: string
  slotLabel: string
  name: string
  icon?: string
  starforce?: number
  scrolls?: number
  flameSummary?: string
  potentials?: string[]
  additionalPotentials?: string[]
  stats: MapleScouterEquipmentStat[]
}

export interface MapleScouterProfile {
  avatar?: string
  preset?: string
  presetUsed?: boolean
  basic: MapleScouterBasicInfo
  combat: MapleScouterCombatStats
  equipments: MapleScouterEquipment[]
  hexa: MapleScouterHexaSummary
  potentials: MapleScouterPotentialLine[]
  symbols: MapleScouterSymbol[]
}
