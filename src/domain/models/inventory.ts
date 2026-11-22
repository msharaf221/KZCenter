export interface InventoryItem {
  id: string;
  name: string;
  type: 'book' | 'handout' | 'other';
  costPrice: number;
  sellPrice: number;
  stock: number;
  courseId?: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  type: 'in' | 'out';
  quantity: number;
  price: number;
  studentId?: string;
  date: string;
  createdAt: string;
}
