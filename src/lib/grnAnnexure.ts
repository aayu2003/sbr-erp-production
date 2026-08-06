import getBaseUrl from '@/lib/config';
import { getGateEntries, type GateEntryRecord, type GRNRecord } from '@/lib/grnApi';

export type GrnAnnexurePicture = {
  itemId: string;
  itemCode?: string;
  itemName: string;
  imageUrl?: string;
};

export type GrnAnnexureData = {
  gateEntries: GateEntryRecord[];
  itemPictures: GrnAnnexurePicture[];
};

const absoluteAssetUrl = (value: unknown) => {
  const url = String(value || '').trim();
  if (!url) return '';
  try {
    return new URL(url, `${String(getBaseUrl() || window.location.origin).replace(/\/$/, '')}/`).href;
  } catch {
    return url;
  }
};

export const loadGrnAnnexure = async (grn: Pick<GRNRecord, 'gateEntryIds' | 'items'>): Promise<GrnAnnexureData> => {
  const [allGateEntries, inventoryResponse] = await Promise.all([
    getGateEntries().catch(() => [] as GateEntryRecord[]),
    fetch(`${String(getBaseUrl() || '').replace(/\/$/, '')}/inventory/get_all_item`)
      .then((response) => response.json())
      .catch(() => null),
  ]);

  const gateEntryLookup = new Map(allGateEntries.map((entry) => [entry.enteryId, entry]));
  const gateEntries = grn.gateEntryIds
    .map((entryId) => gateEntryLookup.get(entryId))
    .filter((entry): entry is GateEntryRecord => Boolean(entry));

  const rawItems = Array.isArray(inventoryResponse?.items) ? inventoryResponse.items as Record<string, unknown>[] : [];
  const inventoryById = new Map<string, Record<string, unknown>>();
  const inventoryByCode = new Map<string, Record<string, unknown>>();
  rawItems.forEach((item) => {
    const id = String(item.Invent_id || item.invent_id || item.id || '').trim();
    const code = String(item.new_item_code || item.item_code || '').trim();
    if (id) inventoryById.set(id, item);
    if (code) inventoryByCode.set(code, item);
  });

  const itemPictures = grn.items.map((item) => {
    const inventoryItem = inventoryById.get(item.itemId) || (item.itemCode ? inventoryByCode.get(item.itemCode) : undefined);
    return {
      itemId: item.itemId,
      itemCode: item.itemCode,
      itemName: item.description,
      imageUrl: absoluteAssetUrl(inventoryItem?.item_image_url || inventoryItem?.image_url || inventoryItem?.imageUrl),
    };
  });

  return { gateEntries, itemPictures };
};
