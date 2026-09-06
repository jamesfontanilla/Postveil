const baseUrl = (process.env.POSTVEIL_BASE_URL || "https://postveil.jamesfontanilla.com").replace(/\/$/, "");

const checks = [];
function check(name, passed, detail = "") {
  checks.push({ name, passed, detail });
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", ...init });
  let body = null;
  try { body = await response.json(); } catch { /* header-only responses are expected for some checks */ }
  return { response, body };
}

const health = await request("/api/health");
check("health responds", health.response.status === 200, `HTTP ${health.response.status}`);
check("D1 is configured", health.body?.configured?.d1 === true);
check("SES is configured", health.body?.configured?.ses === true);
check("SES webhook secret is configured", health.body?.configured?.sesWebhook === true);
check("Turnstile is configured", health.body?.configured?.turnstile === true);
check("exact inbound-MX checking is configured", health.body?.configured?.exactInboundMx === true);
check("account lockout is enabled", health.body?.configured?.accountLockout === true);
check("D1 probe is healthy", health.body?.databaseProbe?.ok === true);
check("attachment ingestion remains fail-closed", health.body?.configured?.attachmentsEnabled === false, JSON.stringify(health.body?.configured?.attachmentsEnabled));

const healthOptions = await request("/api/health", { method: "OPTIONS" });
check("health rejects unsafe methods", healthOptions.response.status === 405, `HTTP ${healthOptions.response.status}`);

const config = await request("/api/client-config");
check("client config responds", config.response.status === 200, `HTTP ${config.response.status}`);
check("client uses D1 auth mode", config.body?.authMode === "d1");

const privateRoute = await request("/api/attachments");
check("private attachment route requires authentication", privateRoute.response.status === 401, `HTTP ${privateRoute.response.status}`);

for (const header of ["x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy", "strict-transport-security"]) {
  check(`security header: ${header}`, Boolean(health.response.headers.get(header)));
}
check("HTML has a content security policy", Boolean((await request("/")).response.headers.get("content-security-policy")));

const failures = checks.filter((item) => !item.passed);
for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` — ${item.detail}` : ""}`);
console.log(`\n${checks.length - failures.length}/${checks.length} production checks passed for ${baseUrl}`);
if (failures.length) process.exitCode = 1;
