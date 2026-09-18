export interface ThinkRoomPreset {
  name: string;
  emoji: string;
  teamId: string;
  description: string;
}

export const defaultThinkRooms: ThinkRoomPreset[] = [
  {
    name: 'Product & Engineering Think Room',
    emoji: '🧩',
    teamId: 'team-product-engineering',
    description: 'Product, architecture, UX, engineering, QA, reliability, and security decisions.',
  },
  {
    name: 'Sales & Growth Think Room',
    emoji: '📈',
    teamId: 'team-sales-growth',
    description: 'Positioning, acquisition, SEO, messaging, sales pipeline, and customer growth.',
  },
  {
    name: 'Production & Operations Think Room',
    emoji: '🏭',
    teamId: 'team-production-operations',
    description: 'Production planning, operations, delivery, quality, finance controls, and reliability.',
  },
  {
    name: 'Research & Strategy Think Room',
    emoji: '🔬',
    teamId: 'team-research-strategy',
    description: 'Research, critical review, product direction, analytics, and decision support.',
  },
  {
    name: 'Legal & Finance Think Room',
    emoji: '⚖️',
    teamId: 'team-legal-finance',
    description: 'Legal, immigration, accounting, compliance, financial, and security perspectives.',
  },
  {
    name: 'Health & Wellbeing Think Room',
    emoji: '🩺',
    teamId: 'team-health-wellbeing',
    description: 'General health education, psychology-informed perspective, wellbeing, and safety review.',
  },
  {
    name: 'Education & Immigration Think Room',
    emoji: '🎓',
    teamId: 'team-education-immigration',
    description: 'Education pathways, admissions planning, immigration process, and legal issue spotting.',
  },
  {
    name: 'Client Advisory Think Room',
    emoji: '🤝',
    teamId: 'team-client-advisory',
    description: 'Cross-functional customer guidance across success, sales, finance, education, and wellbeing.',
  },
];
