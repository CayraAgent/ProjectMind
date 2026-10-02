import { login } from "./auth.js";

export function canStartSession(user) {
  return login(user);
}
