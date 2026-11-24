const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createStore, normalizeDestination } = require("../php/public/chat-sip-contacts");

test("SIP phone numbers and SIP addresses normalize without treating addresses as vanity numbers", () => {
  assert.equal(normalizeDestination("+31 (70) 123-4567"), "+31701234567");
  assert.equal(normalizeDestination("600"), "600");
  assert.equal(normalizeDestination("sip:Naam@Provider.TEST"), "Naam@provider.test");
  for (const input of ["https://provider.test", "12\n34", "name@bad..test", "n@provider.test?header=value", "123abc", ""]) {
    assert.equal(normalizeDestination(input), null);
  }
});

test("SIP contact CRUD uses only the signed-in account's local directory", () => {
  const records = new Map();
  const storage = { getItem: key => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) };
  const store = createStore(storage);
  const identifier = "12345678-1234-1234-1234-123456781234";
  store.save("fixture-one", identifier, "Tolk", "Name@PROVIDER.test");
  assert.deepEqual(createStore(storage).read("fixture-one"), [{ id: identifier, name: "Tolk", destination: "Name@provider.test" }]);
  assert.deepEqual(store.read("fixture-two"), []);
  assert.throws(() => store.read(""), /accountRequired/);
  assert.throws(() => store.save("fixture-one", identifier, "Fout", "https://provider.test"), /invalidContact/);
  store.save("fixture-one", identifier, "Laboratorium", "600");
  assert.deepEqual(store.read("fixture-one"), [{ id: identifier, name: "Laboratorium", destination: "600" }]);
  store.remove("fixture-two", identifier);
  assert.equal(store.read("fixture-one").length, 1);
  store.remove("fixture-one", identifier);
  assert.deepEqual(store.read("fixture-one"), []);
});
