import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { rowToCard } from "./cards";
import { nowIso } from "./format";
import { bestPrice, type NormalizedCard } from "./types";

export interface AlertView {
  id: number;
  card: NormalizedCard;
  thresholdPct: number;
  variantType: string;
  basePrice: number | null;
  baseCurrency: string | null;
  currentPrice: number | null;
  currency: string | null;
  changePct: number | null;
  triggered: boolean;
  createdAt: string;
  acknowledgedAt: string | null;
}

/** All alerts with their current state. An alert is "triggered" when |change from base| >= threshold. */
export function listAlerts(): AlertView[] {
  const rows = db
    .select({ alert: schema.alerts, card: schema.cards })
    .from(schema.alerts)
    .innerJoin(schema.cards, eq(schema.alerts.cardId, schema.cards.id))
    .all();
  const views = rows.map(({ alert, card: row }) => {
    const card = rowToCard(row);
    const bp = bestPrice(card.prices, alert.variantType);
    const current = bp?.amount ?? null;
    const changePct = current != null && alert.basePrice ? ((current - alert.basePrice) / alert.basePrice) * 100 : null;
    const triggered = changePct != null && Math.abs(changePct) >= alert.thresholdPct;
    if (triggered && !alert.lastTriggeredAt) {
      db.update(schema.alerts).set({ lastTriggeredAt: nowIso() }).where(eq(schema.alerts.id, alert.id)).run();
    }
    return {
      id: alert.id,
      card,
      thresholdPct: alert.thresholdPct,
      variantType: alert.variantType,
      basePrice: alert.basePrice,
      baseCurrency: alert.baseCurrency,
      currentPrice: current,
      currency: bp?.currency ?? alert.baseCurrency,
      changePct,
      triggered,
      createdAt: alert.createdAt,
      acknowledgedAt: alert.acknowledgedAt,
    };
  });
  return views.sort((a, b) => Number(b.triggered) - Number(a.triggered) || Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
}

export function upsertAlert(cardId: string, thresholdPct: number, variantType?: string) {
  const row = db.select().from(schema.cards).where(eq(schema.cards.id, cardId)).get();
  if (!row) throw new Error("Card not found");
  const card = rowToCard(row);
  const bp = bestPrice(card.prices, variantType);
  const values = {
    cardId,
    thresholdPct,
    variantType: bp?.variant ?? variantType ?? "normal",
    basePrice: bp?.amount ?? null,
    baseCurrency: bp?.currency ?? null,
    createdAt: nowIso(),
    lastTriggeredAt: null,
    acknowledgedAt: null,
  };
  return db
    .insert(schema.alerts)
    .values(values)
    .onConflictDoUpdate({ target: schema.alerts.cardId, set: values })
    .returning()
    .get();
}

/** Reset the base price to the current price so the alert re-arms from here. */
export function acknowledgeAlert(id: number) {
  const alert = db.select().from(schema.alerts).where(eq(schema.alerts.id, id)).get();
  if (!alert) return null;
  const row = db.select().from(schema.cards).where(eq(schema.cards.id, alert.cardId)).get();
  const bp = row ? bestPrice(rowToCard(row).prices, alert.variantType) : null;
  return db
    .update(schema.alerts)
    .set({ basePrice: bp?.amount ?? alert.basePrice, baseCurrency: bp?.currency ?? alert.baseCurrency, acknowledgedAt: nowIso(), lastTriggeredAt: null })
    .where(eq(schema.alerts.id, id))
    .returning()
    .get();
}

export function deleteAlert(id: number) {
  db.delete(schema.alerts).where(eq(schema.alerts.id, id)).run();
}

export function alertForCard(cardId: string) {
  return db.select().from(schema.alerts).where(eq(schema.alerts.cardId, cardId)).get() ?? null;
}
