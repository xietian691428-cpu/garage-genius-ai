export interface InventoryItem {
  id: string;
  vehicle_id: string;
  user_id?: string | null;
  oem_number?: string;
  brand: string;
  name: string;
  category:
    | "brake"
    | "engine"
    | "filter"
    | "suspension"
    | "electrical"
    | "consumable"
    | "other";
  current_stock: number;
  min_stock: number;
  price: number;
  location: string;
  purchase_links: string[];
  notes?: string;
  last_updated: string;
  last_used_in_repair?: string;
}
