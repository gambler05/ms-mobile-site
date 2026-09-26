import "dotenv/config";
import { prisma } from "../src/server/db";
import { decryptSecret } from "../src/server/crypto";
prisma.repairTicket.findFirst({ where: { status: "READY", trackingTokenEnc: { not: null }, trackingRevokedAt: null } }).then((t) => { console.log(t ? decryptSecret(t.trackingTokenEnc!) : ""); process.exit(0); });
