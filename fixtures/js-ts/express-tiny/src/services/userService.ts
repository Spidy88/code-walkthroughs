import { findUserByEmail, findUserById, insertUser, selectAllUsers } from '../db/userRepo.ts';

export async function listUsers() {
  return selectAllUsers();
}

export async function fetchUser(id: number) {
  return findUserById(id);
}

export async function registerUser(input: { email: string; name: string }) {
  const existing = await findUserByEmail(input.email);
  if (existing) return existing;
  return insertUser(input);
}
