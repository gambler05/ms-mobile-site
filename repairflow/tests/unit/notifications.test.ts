import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { makeOrg } from "./helpers";
import { emitEvent, processQueue, retryJob } from "@/server/services/notifications";
import { renderTemplate, validateTemplate } from "@/lib/domain/notifications";

const customer = { id: "c", name: "Test", email: "t@example.test", phone: "0700000000", consentEmail: true, consentSms: true, consentWhatsapp: false };

describe("notifications", () => {
  it("déduplique in-app et jobs sur la même occurrence", async () => {
    const { org, shop } = await makeOrg();
    const input = { orgId: org.id, shopId: shop.id, event: "DEVICE_READY" as const, occurrenceKey: `t:1:READY`, title: "Prêt", body: "", link: "/", customer, vars: { ticketNumber: "X" } };
    await emitEvent(input);
    await emitEvent(input);
    await emitEvent(input);
    expect(await prisma.notification.count({ where: { orgId: org.id } })).toBe(1);
    expect(await prisma.notificationJob.count({ where: { orgId: org.id } })).toBe(2);
  });
  it("respecte les consentements et canaux configurés", async () => {
    const { org, shop } = await makeOrg();
    await prisma.setting.create({ data: { orgId: org.id, key: "notif.channels.DEVICE_READY", valueJson: JSON.stringify(["EMAIL"]) } });
    await emitEvent({ orgId: org.id, shopId: shop.id, event: "DEVICE_READY", occurrenceKey: "t:2", title: "", body: "", link: "/", customer: { ...customer, consentEmail: false } });
    expect(await prisma.notificationJob.count({ where: { orgId: org.id } })).toBe(0);
  });
  it("simule en mode démo, échoue sans template, relance avec backoff puis abandonne", async () => {
    const { org, shop } = await makeOrg();
    await emitEvent({ orgId: org.id, shopId: shop.id, event: "DEVICE_READY", occurrenceKey: "t:3", title: "", body: "", link: "/", customer });
    await prisma.notificationJob.updateMany({ where: { orgId: org.id }, data: { nextAttemptAt: new Date(0) } });
    const s = await processQueue();
    expect(s.simulated).toBeGreaterThanOrEqual(2);
    expect((await prisma.notificationDelivery.count({ where: { job: { orgId: org.id } } }))).toBe(2);
    // Sans template : échec, tentative comptée, nouvelle tentative planifiée
    await prisma.template.deleteMany({ where: { orgId: org.id } });
    await emitEvent({ orgId: org.id, shopId: shop.id, event: "QUOTE_AVAILABLE", occurrenceKey: "q:1", title: "", body: "", link: "/", customer });
    await prisma.notificationJob.updateMany({ where: { orgId: org.id, eventType: "QUOTE_AVAILABLE" }, data: { nextAttemptAt: new Date(0), maxAttempts: 2 } });
    await processQueue();
    let job = await prisma.notificationJob.findFirstOrThrow({ where: { orgId: org.id, eventType: "QUOTE_AVAILABLE" } });
    expect(job.status).toBe("FAILED");
    expect(job.attempts).toBe(1);
    expect(job.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await prisma.notificationJob.update({ where: { id: job.id }, data: { nextAttemptAt: new Date(0) } });
    await processQueue();
    job = await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(job.status).toBe("DEAD");
    await retryJob(org.id, job.id);
    expect((await prisma.notificationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PENDING");
  });
  it("valide les variables de template", () => {
    expect(validateTemplate("DEVICE_READY", "Bonjour {{customerName}} {{inconnu}}").unknown).toEqual(["inconnu"]);
    expect(renderTemplate("{{a}}-{{b}}", { a: 1, b: "x" })).toBe("1-x");
  });
});
