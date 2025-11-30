export type Car = {
  id: string;
  manufacturerHe: string;
  modelHe: string;
  year: number;
  price: number;
  km: number;
  city: string;
  mainImageUrl: string;
};

export const MOCK_CARS: Car[] = [
  {
    id: "1",
    manufacturerHe: "טויוטה",
    modelHe: "קורולה",
    year: 2018,
    price: 78000,
    km: 82000,
    city: "תל אביב",
    mainImageUrl: "https://via.placeholder.com/400x240?text=Corolla+2018",
  },
  {
    id: "2",
    manufacturerHe: "יונדאי",
    modelHe: "i10",
    year: 2020,
    price: 65000,
    km: 42000,
    city: "ראשון לציון",
    mainImageUrl: "https://via.placeholder.com/400x240?text=i10+2020",
  },
  {
    id: "3",
    manufacturerHe: "מזדה",
    modelHe: "מאזדה 3",
    year: 2019,
    price: 95000,
    km: 65000,
    city: "ירושלים",
    mainImageUrl: "https://via.placeholder.com/400x240?text=Mazda+3+2019",
  },
  {
    id: "4",
    manufacturerHe: "סובארו",
    modelHe: "אאוטבק",
    year: 2021,
    price: 120000,
    km: 38000,
    city: "חיפה",
    mainImageUrl: "https://via.placeholder.com/400x240?text=Outback+2021",
  },
  {
    id: "5",
    manufacturerHe: "הונדה",
    modelHe: "סיוויק",
    year: 2017,
    price: 68000,
    km: 95000,
    city: "באר שבע",
    mainImageUrl: "https://via.placeholder.com/400x240?text=Civic+2017",
  },
  {
    id: "6",
    manufacturerHe: "פורד",
    modelHe: "פוקוס",
    year: 2018,
    price: 72000,
    km: 78000,
    city: "אשדוד",
    mainImageUrl: "https://via.placeholder.com/400x240?text=Focus+2018",
  },
];

