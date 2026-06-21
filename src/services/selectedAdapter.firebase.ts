import { firebaseAdapter } from "./firebaseAdapter";

export const activeAdapterName = "firebase" as const;
export const dataAdapter = firebaseAdapter;
