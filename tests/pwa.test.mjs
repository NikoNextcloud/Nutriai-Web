import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
const source = await readFile(new URL("../sw.js", import.meta.url), "utf8");
function worker(scope = "https://nutri.test/") {
  const listeners = {}, stores = new Map(), fetched = [];
  let skipped = false;
  const clients = [];
  const cacheStorage = {
    keys: async () => [...stores.keys()],
    delete: async key => stores.delete(key),
    open: async key => {
      if (!stores.has(key)) stores.set(key, new Map());
      const map = stores.get(key);
      return { put: async (url, response) => map.set(String(url), response), match: async url => map.get(typeof url === "string" ? url : url.url) };
    }
  };
  const self = { registration: { scope }, addEventListener: (name, listener) => listeners[name] = listener,
    clients: { matchAll: async () => clients }, skipWaiting: async () => { skipped = true; } };
  vm.runInNewContext(source, { self, caches: cacheStorage, crypto: webcrypto, URL, Request, Uint8Array,
    fetch: async request => { fetched.push(request); return new Response("wrong deployment"); } });
  return { listeners, stores, clients, fetched, skipped: () => skipped };
}
test("manifest and platform icons have the required real pixel sizes", async () => {
  const manifest = JSON.parse(await readFile("manifest.webmanifest"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "./");
  assert.equal(manifest.scope, "./");
  for (const icon of manifest.icons) {
    const png = await readFile(icon.src);
    const [width, height] = icon.sizes.split("x").map(Number);
    assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height);
  }
  const apple = await readFile("icons/apple-touch-icon.png");
  assert.equal(apple.readUInt32BE(16), 180);
});
test("private API, photos, non-GET, external and arbitrary query requests bypass Cache Storage", () => {
  const { listeners } = worker();
  for (const [url, method, authorization] of [
    ["https://nutri.test/api/foods?barcode=3017620422003", "GET"],
    ["https://nutri.test/api/gemini", "POST"], ["https://nutri.test/app.js?secret=private", "GET"],
    ["https://nutri.test/photos/food.jpg", "GET"], ["https://cdn.example/script.js", "GET"],
    ["https://nutri.test/index.html", "GET", "Bearer private"], ["https://nutri.test/?token=private", "GET"]
  ]) {
    let intercepted = false;
    listeners.fetch({ request: { url, method, mode: "cors", headers: new Headers(authorization ? { authorization } : {}) },
      respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, url);
  }
});
test("home navigation maps only to this release's offline shell, including subpath hosting", async () => {
  for (const scope of ["https://nutri.test/", "https://nutri.test/Nutriai-Web/"]) {
    const { listeners, stores } = worker(scope);
    const name = "nutriai-shell:" + new URL(scope).pathname + ":" + source.match(/const REVISION = "([^"]+)"/)[1];
    stores.set(name, new Map([[scope + "index.html", new Response("offline shell")]]));
    let response;
    listeners.fetch({ request: { url: scope, method: "GET", mode: "navigate", headers: new Headers() }, respondWith: value => response = value });
    assert.equal(await (await response).text(), "offline shell");
  }
});
test("activation removes only old NutriAI shell caches in its scope", async () => {
  const { listeners, stores } = worker("https://nutri.test/app/");
  for (const name of ["unrelated-user-files", "nutriai-shell:/:older", "nutriai-shell:/app/:older"]) stores.set(name, new Map());
  let done; listeners.activate({ waitUntil: promise => done = promise }); await done;
  assert.ok(stores.has("unrelated-user-files")); assert.ok(stores.has("nutriai-shell:/:older"));
  assert.ok(!stores.has("nutriai-shell:/app/:older"));
});
test("a changed or incomplete deployment fails installation without skipping the waiting phase", async () => {
  const w = worker(); let done;
  w.listeners.install({ waitUntil: promise => done = promise });
  await assert.rejects(done, /integrity mismatch/); assert.equal(w.skipped(), false);
  assert.equal(w.stores.size, 0);
});
test("updates require the explicit activation message and block multiple open windows", async () => {
  const w = worker(); let done, blocked;
  w.clients.push({url:"https://nutri.test/"},{url:"https://nutri.test/index.html"});
  w.listeners.message({ data: {type:"ACTIVATE_UPDATE"}, source: {postMessage: data => blocked = data.type}, waitUntil: promise => done = promise });
  await done; assert.equal(blocked,"UPDATE_BLOCKED"); assert.equal(w.skipped(),false);
  w.clients.pop(); w.listeners.message({data:{type:"ACTIVATE_UPDATE"},waitUntil:promise=>done=promise});
  await done; assert.equal(w.skipped(),true);
});
