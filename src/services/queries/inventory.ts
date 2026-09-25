import { readAll } from '../../data/readers';
import type { Course, InventoryItem } from '../../domain/models';

export async function loadInventoryCatalog() {
  const [invData, coursesData] = await Promise.all([readAll<InventoryItem>('inventory'), readAll<Course>('courses')]);
  return {
    items: invData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    courses: coursesData,
  };
}
