export type DiscoveryCategoryGroup = {
  label: string;
  items: string[];
};

export const DISCOVERY_CATEGORY_GROUPS: DiscoveryCategoryGroup[] = [
  {
    label: "Professioni e uffici",
    items: [
      "Studi legali",
      "Notai",
      "Commercialisti",
      "Consulenti del lavoro",
      "Consulenti aziendali",
      "Agenzie immobiliari",
      "Agenzie assicurative",
      "Agenzie di marketing",
      "Software house",
      "Studi di architettura",
      "Geometri",
    ],
  },
  {
    label: "Salute e benessere",
    items: [
      "Dentisti",
      "Fisioterapisti",
      "Cliniche private",
      "Farmacie",
      "Ottici",
      "Veterinari",
      "Palestre",
      "Personal trainer",
      "Centri estetici",
      "Parrucchieri",
      "Barbieri",
      "Spa",
    ],
  },
  {
    label: "Casa e imprese",
    items: [
      "Imprese edili",
      "Idraulici",
      "Elettricisti",
      "Imprese di pulizie",
      "Agenzie di sicurezza",
      "Falegnami",
      "Agenzie di viaggi",
    ],
  },
  {
    label: "Auto e commercio",
    items: [
      "Officine auto",
      "Concessionarie",
      "Negozi di abbigliamento",
      "Arredamento",
      "Negozi di elettronica",
    ],
  },
  {
    label: "Formazione ed eventi",
    items: [
      "Scuole di formazione",
      "Scuole di danza",
      "Fotografi",
      "Wedding planner",
    ],
  },
  {
    label: "Ospitalità",
    items: [
      "Hotel",
      "Bed & Breakfast",
      "Ristoranti",
      "Pizzerie",
      "Bar ed enoteche",
      "Gelaterie",
      "Pasticcerie",
      "Agriturismi",
    ],
  },
];

export const DISCOVERY_CATEGORIES = DISCOVERY_CATEGORY_GROUPS.flatMap(
  (group) => group.items,
);

const GOOGLE_CATEGORY_LABELS: Record<string, string> = {
  lawyer: "Studi legali",
  notary: "Notai",
  accounting: "Commercialisti",
  real_estate_agency: "Agenzie immobiliari",
  insurance_agency: "Agenzie assicurative",
  dentist: "Dentisti",
  physiotherapist: "Fisioterapisti",
  pharmacy: "Farmacie",
  optician: "Ottici",
  veterinary_care: "Veterinari",
  gym: "Palestre",
  beauty_salon: "Centri estetici",
  hair_care: "Parrucchieri",
  spa: "Spa",
  general_contractor: "Imprese edili",
  plumber: "Idraulici",
  electrician: "Elettricisti",
  cleaning_service: "Imprese di pulizie",
  car_repair: "Officine auto",
  car_dealer: "Concessionarie",
  clothing_store: "Negozi di abbigliamento",
  furniture_store: "Arredamento",
  electronics_store: "Negozi di elettronica",
  travel_agency: "Agenzie di viaggi",
  photographer: "Fotografi",
  lodging: "Hotel",
  hotel: "Hotel",
  bed_and_breakfast: "Bed & Breakfast",
  restaurant: "Ristoranti",
  italian_restaurant: "Ristoranti",
  mediterranean_restaurant: "Ristoranti",
  seafood_restaurant: "Ristoranti",
  family_restaurant: "Ristoranti",
  fusion_restaurant: "Ristoranti",
  pizza_restaurant: "Pizzerie",
  bar: "Bar ed enoteche",
  wine_bar: "Bar ed enoteche",
  ice_cream_shop: "Gelaterie",
  bakery: "Pasticcerie",
  farmstay: "Agriturismi",
};

export function discoveryCategoryLabel(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) return "Altro settore";
  const normalized = value.toLocaleLowerCase("it-IT");
  return (
    GOOGLE_CATEGORY_LABELS[normalized] ??
    DISCOVERY_CATEGORIES.find(
      (category) => category.toLocaleLowerCase("it-IT") === normalized,
    ) ??
    normalized
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase("it-IT"))
  );
}
