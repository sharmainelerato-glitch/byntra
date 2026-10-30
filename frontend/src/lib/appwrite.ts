
import {
  Client,
  Account,
  Storage,
  ID
} from "appwrite";

export const client = new Client()
  .setEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT)
  .setProject(import.meta.env.VITE_APPWRITE_PROJECT_ID);

export const account = new Account(client);
export const storage = new Storage(client);

export async function registerWithAppwrite(
  username: string,
  email: string,
  password: string
) {
  const user = await account.create({
    userId: ID.unique(),
    email,
    password,
    name: username
  });

  await account.createEmailPasswordSession({
    email,
    password
  });

  return user;
}

export async function loginWithAppwrite(
  email: string,
  password: string
) {
  await account.createEmailPasswordSession({
    email,
    password
  });

  return account.get();
}

export async function logoutFromAppwrite() {
  await account.deleteSession({
    sessionId: "current"
  });
}

export async function getAppwriteUser() {
  try {
    return await account.get();
  } catch {
    return null;
  }
}
