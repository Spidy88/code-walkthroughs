type User = { id: number; email: string; name: string };
const users: User[] = [
  { id: 1, email: 'alice@example.com', name: 'Alice' },
  { id: 2, email: 'bob@example.com', name: 'Bob' },
];

export async function selectAllUsers(): Promise<ReadonlyArray<User>> {
  return users;
}

export async function findUserById(id: number): Promise<User | null> {
  return users.find((u) => u.id === id) ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return users.find((u) => u.email === email) ?? null;
}

export async function insertUser(input: { email: string; name: string }): Promise<User> {
  const id = users.length + 1;
  const user = { id, ...input };
  users.push(user);
  return user;
}
