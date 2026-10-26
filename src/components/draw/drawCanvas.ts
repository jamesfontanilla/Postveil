import type { DrawObject, DrawRecord } from "./drawModel";
export function addDrawObject(record: DrawRecord, object: DrawObject): DrawRecord { if (record.objects.length >= 5000) throw new Error("Canvas object limit reached"); return { ...record, objects: [...record.objects, object] }; }
export function finitePoint(x: number, y: number): boolean { return Number.isFinite(x) && Number.isFinite(y); }
