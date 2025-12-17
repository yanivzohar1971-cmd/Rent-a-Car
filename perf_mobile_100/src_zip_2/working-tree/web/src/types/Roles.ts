import type { UserProfile } from './UserProfile';

export type PersonaView = 'YARD' | 'BUYER' | 'SELLER' | 'AGENT';

export function getAvailablePersonas(profile: UserProfile | null): PersonaView[] {
  if (!profile) return [];

  const views: PersonaView[] = [];

  if (profile.isYard || profile.primaryRole === 'YARD') {
    views.push('YARD');
  }

  if (profile.isAgent || profile.primaryRole === 'AGENT') {
    views.push('AGENT');
  }

  // BUYER/SELLER derived from capabilities
  if (profile.canBuy !== false) {
    views.push('BUYER');
  }

  if (profile.canSell !== false) {
    views.push('SELLER');
  }

  // Ensure uniqueness
  return Array.from(new Set(views));
}

export function getDefaultPersona(profile: UserProfile | null): PersonaView | null {
  const available = getAvailablePersonas(profile);
  if (available.length === 0) return null;

  // Priority: YARD > AGENT > BUYER > SELLER
  if (available.includes('YARD')) return 'YARD';
  if (available.includes('AGENT')) return 'AGENT';
  if (available.includes('BUYER')) return 'BUYER';
  if (available.includes('SELLER')) return 'SELLER';

  return available[0];
}

export function getPersonaLabelHe(persona: PersonaView): string {
  switch (persona) {
    case 'YARD':
      return 'מגרש / סוחר';
    case 'AGENT':
      return 'סוכן';
    case 'BUYER':
      return 'קונה';
    case 'SELLER':
      return 'מוכר';
  }
}

