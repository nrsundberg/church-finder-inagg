export interface ChurchInput {
  sourceId: string;
  source: "sbc" | "founders" | "9marks";
  name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  lat: number;
  lng: number;
  phone?: string;
  email?: string;
  website?: string;
  profileUrl?: string;
}
