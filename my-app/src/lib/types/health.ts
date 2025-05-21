export type HealthModel = {
  isOnline: boolean;
  timestamp: string; // o Date si lo vas a convertir al parsear
  status: string;
  version: string;
};