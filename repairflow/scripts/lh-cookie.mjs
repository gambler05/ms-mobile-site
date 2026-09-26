import { chromium } from "@playwright/test";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage();
await p.goto("http://localhost:3100/login"); await p.fill("#email", "admin@msmobile.example.test"); await p.fill("#password", "demo1234"); await p.click("button[type=submit]"); await p.waitForURL("http://localhost:3100/");
const c = (await p.context().cookies()).find((x) => x.name === "rf_session");
console.log(c.value); await b.close();
