// Module-private types for rewards API parsing

export interface Promotion {
  name: string;
  complete: boolean;
  pointProgressMax: number;
  pointProgress: number;
  attributes?: { is_unlocked?: string };
}
