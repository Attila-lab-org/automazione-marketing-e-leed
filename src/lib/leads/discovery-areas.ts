/**
 * Una ricerca Google non elenca tutta la città: restituisce i primi risultati
 * di una frase. La volta dopo si passa a una zona non ancora cercata.
 */

export function normalizePlaceKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('it-IT');
}

const CITY_AREAS: Record<string, readonly string[]> = {
  milano: [
    'Navigli',
    'Isola',
    'Porta Romana',
    'Brera',
    'Lambrate',
    'Bicocca',
    'Città Studi',
    'Porta Venezia',
    'Sarpi',
    'Buenos Aires',
    'Lorenteggio',
    'Greco',
    'Corvetto',
    'Affori',
    'Niguarda',
  ],
  roma: [
    'Trastevere',
    'Prati',
    'Testaccio',
    'San Lorenzo',
    'Ostiense',
    'Monteverde',
    'Parioli',
    'Garbatella',
    'Centocelle',
    'Tiburtino',
    'Flaminio',
    'Appio',
  ],
  torino: [
    'San Salvario',
    'Vanchiglia',
    'Cenisia',
    'Aurora',
    'Santa Rita',
    'Lingotto',
    'Crocetta',
    'Barriera di Milano',
  ],
  napoli: ['Chiaia', 'Vomero', 'Fuorigrotta', 'Posillipo', 'Secondigliano', 'Ponticelli'],
  bologna: ['Bolognina', 'Santo Stefano', 'Saragozza', 'San Donato', 'Navile'],
  firenze: ['Oltrarno', 'Santa Croce', 'Campo di Marte', 'Rifredi', 'Isolotto'],
  genova: ['Centro storico', 'Albaro', 'Sampierdarena', 'Sestri Ponente', 'Pegli'],
  palermo: ['Centro storico', 'Politeama', 'Libertà', 'Borgo Nuovo', 'Brancaccio'],
  bari: ['Murat', 'Madonnella', 'Libertà', 'San Paolo', 'Japigia', 'Poggiofranco'],
  catania: ['Centro', 'Borgo', 'Picanello', 'Librino', 'San Giovanni Galermo'],
  venezia: ['Mestre', 'Lido', 'Marghera', 'Cannaregio', 'Castello'],
  verona: ['Centro', 'Borgo Trento', 'San Zeno', 'Borgo Roma', 'Golosine'],
};

const COMPASS = ['centro', 'nord', 'sud', 'est', 'ovest'] as const;

export function planDiscoveryLocations(input: {
  location: string;
  alreadySearched: readonly string[];
  limit?: number;
}): string[] {
  const location = input.location.trim().replace(/\s+/g, ' ');
  if (!location) return [];
  const key = normalizePlaceKey(location);
  const searched = new Set(input.alreadySearched.map((item) => normalizePlaceKey(item)));
  const limit = input.limit ?? 4;
  const areas = CITY_AREAS[key];

  if (!areas) {
    if (!searched.has(key)) return [location];
    return COMPASS.map((side) => `${location} ${side}`)
      .filter((side) => !searched.has(normalizePlaceKey(side)))
      .slice(0, limit);
  }

  if (!searched.has(key)) return [location];

  const next: string[] = [];
  for (const area of areas) {
    const label = `${location} ${area}`;
    if (searched.has(normalizePlaceKey(label))) continue;
    next.push(label);
    if (next.length >= limit) break;
  }
  return next;
}
