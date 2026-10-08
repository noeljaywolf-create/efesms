// Every extinguisher type the service team handles. Includes litre/kg capacities as seen on quotations.
export const EXTINGUISHER_TYPES = [
  '2.5kg DCP',
  '2kg CO2',
  '4.5kg CO2',
  '9kg ABC Dry Powder',
  '9kg BC Dry Powder',
  '9kg DC Dry Powder',
  '9L Water Spray',
  '9L Water Gas',
  '9L Foam AFFF',
  '9L Foam AR (Alcohol-Resistant)',
  '18L Foam AFFF',
  '25L Foam',
  '45L Foam',
  'ABC Dry Powder',
  'BC Dry Powder',
  'DC Dry Powder',
  'CO2',
  'Foam AFFF',
  'Foam AR (Alcohol-Resistant)',
  'Foam FP (Fluoroprotein)',
  'Water Spray',
  'Water Mist',
  'Wet Chemical (Class K)',
  'Clean Agent FM200',
  'Clean Agent Novec 1230',
  'Clean Agent FE-36',
  'Class D Metal (NaCl)',
  'Class D Metal (Copper)',
]

// Keep the extinguishing agent separate from the capacity-specific unit model.
export const EXTINGUISHER_AGENT_TYPES = [
  'Water', 'Foam', 'DCP', 'CO2', 'Wet Chemical', 'Clean Agent', 'Class D Metal', 'Other',
] as const

export const EXTINGUISHER_UNIT_TYPES = [
  ...EXTINGUISHER_TYPES.filter((value) => /^\d+(?:\.\d+)?\s*(?:kg|l)\b/i.test(value)),
  'Other / custom unit',
] as const

export const inferExtinguisherAgent = (value?: string | null): string => {
  const type = (value ?? '').toLowerCase()
  if (type.includes('co2')) return 'CO2'
  if (type.includes('foam')) return 'Foam'
  if (type.includes('water')) return 'Water'
  if (type.includes('dcp') || type.includes('dry powder')) return 'DCP'
  if (type.includes('wet chemical')) return 'Wet Chemical'
  if (type.includes('clean agent') || type.includes('fm200') || type.includes('novec') || type.includes('fe-36')) return 'Clean Agent'
  if (type.includes('class d')) return 'Class D Metal'
  return ''
}

export const matchExtinguisherUnit = (value?: string | null): string => {
  const type = (value ?? '').toLowerCase()
  return EXTINGUISHER_UNIT_TYPES.find((unit) => unit !== 'Other / custom unit' && type.includes(unit.toLowerCase())) ?? ''
}

export const AGENT_TYPE_COLORS: Record<string, string> = {
  'ABC Dry Powder': '#0288d1',
  'BC Dry Powder': '#0277bd',
  'DC Dry Powder': '#01579b',
  CO2: '#374151',
  'Foam AFFF': '#ff8f00',
  'Foam AR (Alcohol-Resistant)': '#f57c00',
  'Foam FP (Fluoroprotein)': '#ef6c00',
  'Water Spray': '#2e7d32',
  'Water Mist': '#00695c',
  'Wet Chemical (Class K)': '#7b1fa2',
  'Clean Agent FM200': '#FF3D00',
  'Clean Agent Novec 1230': '#c62828',
  'Clean Agent FE-36': '#ad1457',
  'Class D Metal (NaCl)': '#4e342e',
  'Class D Metal (Copper)': '#6d4c41',
}
