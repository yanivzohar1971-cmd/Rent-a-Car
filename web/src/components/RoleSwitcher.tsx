import './RoleSwitcher.css';
import type { PersonaView } from '../types/Roles';
import { getPersonaLabelHe } from '../types/Roles';

interface RoleSwitcherProps {
  personas: PersonaView[];
  selected: PersonaView | null;
  onChange: (persona: PersonaView) => void;
}

export function RoleSwitcher({ personas, selected, onChange }: RoleSwitcherProps) {
  if (!personas.length) return null;

  return (
    <div className="role-switcher">
      {personas.map((p) => {
        const isActive = p === selected;
        return (
          <button
            key={p}
            type="button"
            className={`role-pill ${isActive ? 'active' : ''}`}
            onClick={() => onChange(p)}
          >
            {getPersonaLabelHe(p)}
          </button>
        );
      })}
    </div>
  );
}

