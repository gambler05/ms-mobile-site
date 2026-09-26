import "dotenv/config";
import { runAllJobs } from "../src/server/jobs/scheduled";
import { prisma } from "../src/server/db";

/** Worker autonome : exécute les tâches planifiées toutes les minutes (file de notifications incluse). */
const interval = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
async function tick() {
  const r = await runAllJobs();
  console.log(new Date().toISOString(), JSON.stringify(r));
}
tick().then(() => {
  if (process.argv.includes("--once")) return prisma.$disconnect();
  setInterval(() => void tick(), interval);
});
