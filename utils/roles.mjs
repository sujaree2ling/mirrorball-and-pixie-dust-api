export const ADMIN_EMAIL = "linglings@gmail.com";

export function getRoleForEmail(email = "") {
  return email.trim().toLowerCase() === ADMIN_EMAIL ? "admin" : "user";
}

export function isAdminEmail(email = "") {
  return getRoleForEmail(email) === "admin";
}
