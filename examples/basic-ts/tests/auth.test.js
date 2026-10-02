import test from "node:test";
import assert from "node:assert/strict";
import { login } from "../src/auth.js";

test("login requires an id", () => {
  assert.equal(login({ id: "u1" }), true);
  assert.equal(login({}), false);
});
