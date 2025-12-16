/**
 * Content Wizard Option Bank (Hebrew)
 * Massive option bank for all wizard questions
 */

export const optionBank = {
  // Q1: Content Type (single select)
  contentTypes: [
    'Blog Post (Guide)',
    'SEO Landing Page copy (for existing SEO pages)',
    'FAQ-only page',
    'Checklist',
    'Comparison A vs B',
    'Buyer Guide',
    'Seller Guide',
    'Rental Guide',
    'Dealer/Yard Guide',
    'Parts/Accessories Guide',
    'Workshop/Mechanic Guide',
    'Troubleshooting ("what to do when…")',
    'Other…',
  ],

  // Q2: Audience (multi-select)
  audiences: [
    'Buyers (private)',
    'Sellers (private)',
    'Renters',
    'Families',
    'New drivers',
    'Students',
    'Businesses / Commercial',
    'Car enthusiasts',
    'Dealerships',
    'Yards',
    'Mechanics',
    'Other…',
  ],

  // Q3: Primary Goal (single select)
  goals: [
    'Organic traffic',
    'Leads to /cars',
    'Leads to /sell',
    'Brand trust',
    'Local intent (city)',
    'Conversion to contact/WhatsApp',
    'Educate before purchase',
    'Reduce support questions',
    'Other…',
  ],

  // Q4: Primary Keyword (single + free text)
  primaryKeywords: [
    // Sales
    'רכבים למכירה',
    'מכירת רכב',
    'קניית רכב',
    'רכב יד שנייה',
    'רכב יד 2',
    'טרייד אין',
    'החלפת רכב',
    // Rent
    'השכרת רכב',
    'השכרת רכב ליום',
    'השכרת רכב לשבוע',
    'השכרת רכב לחודש',
    'השכרת רכב בישראל',
    // Dealers/Yards
    'מגרש רכב',
    'סוכנות רכב',
    'סוחר רכב',
    // Parts/Accessories/Workshops
    'אביזרים לרכב',
    'חלקי חילוף לרכב',
    'מוסך מומלץ',
    'מוסך מורשה',
    'טיפול 10,000',
    'טיפול תקופתי',
    'מצבר לרכב',
    'צמיגים',
    'שמנים ופילטרים',
    'Other keyword…',
  ],

  // Q5: Secondary Keywords (multi-select + add custom)
  secondaryKeywords: {
    filters: [
      'אוטומט',
      'היברידי',
      'חשמלי',
      '7 מקומות',
      'מסחרי',
      'ק״מ נמוך',
      'יד 1',
      'בעלות פרטית',
      'ליסינג',
      'שנתון 2018',
      'שנתון 2019',
      'שנתון 2020',
      'שנתון 2021',
      'שנתון 2022',
      'שנתון 2023',
      'שנתון 2024',
      'עד 50,000 ₪',
      'עד 100,000 ₪',
      'עד 150,000 ₪',
      'עד 200,000 ₪',
      'עד 300,000 ₪',
    ],
    checks: [
      'בדיקת רכב לפני קנייה',
      'היסטוריית טיפולים',
      'בדיקת תאונות',
      'שיעבודים/עיקולים',
      'בדיקת בעלות',
      'העברת בעלות',
      'מחירון לוי יצחק (info-only)',
    ],
    rentals: [
      'ללא כרטיס אשראי (info-only)',
      'נהג חדש (info-only)',
      'אוטומט/ידני',
      'זול',
    ],
    parts: [
      'מצבר',
      'צמיגים',
      'בלמים',
      'שמן מנוע',
      'פילטרים',
      'מגבים',
      'נורות',
      'רפידות',
      'דיסקים',
    ],
    accessories: [
      'מצלמת דרך',
      'מולטימדיה',
      'חיישנים',
      'גגון',
      'כיסאות בטיחות',
      'שטיחונים',
      'כיסוי רכב',
      'דיטיילינג',
    ],
  },

  // Q6: Location (multi-select + "All Israel" + free text)
  locations: [
    'תל אביב',
    'חיפה',
    'ירושלים',
    'ראשון לציון',
    'חולון',
    'נתניה',
    'באר שבע',
    'אשדוד',
    'פתח תקווה',
    'אילת',
    'נתב״ג',
    'כל הארץ',
    'Other city…',
  ],

  // Q7: Vehicle Segment (multi-select)
  vehicleSegments: [
    'מיני/עירוני',
    'משפחתי',
    'SUV/ג׳יפון',
    '7 מקומות',
    'מסחרי',
    'יוקרה',
    'חשמלי',
    'היברידי',
    'Other…',
  ],

  // Q8: Structure Blocks (multi-select)
  structureBlocks: [
    'Opening hook (2–3 lines)',
    'H2 sections (3–7)',
    'Checklist',
    'Comparison table',
    'FAQ (5–10)',
    'Mistakes to avoid',
    'Costs & pricing guidance',
    'What to ask the seller/yard',
    'Legal/documents section (safe, general info)',
    'CTA to /cars and /sell',
    'Other…',
  ],

  // Q9: Tone (single select)
  tones: [
    'מקצועי ורשמי',
    'נגיש וחברי',
    'קצר וחד',
    'מדריך מפורט',
    'Other…',
  ],

  // Q10: Length (single select + numeric)
  lengthPresets: [
    { value: 'short', label: 'קצר (400–700)', min: 400, max: 700 },
    { value: 'medium', label: 'בינוני (800–1200)', min: 800, max: 1200 },
    { value: 'long', label: 'ארוך (1500–2200)', min: 1500, max: 2200 },
    { value: 'custom', label: 'Custom number' },
  ],
};

// Helper to get all secondary keywords as flat array
export function getAllSecondaryKeywords(): string[] {
  return [
    ...optionBank.secondaryKeywords.filters,
    ...optionBank.secondaryKeywords.checks,
    ...optionBank.secondaryKeywords.rentals,
    ...optionBank.secondaryKeywords.parts,
    ...optionBank.secondaryKeywords.accessories,
  ];
}
