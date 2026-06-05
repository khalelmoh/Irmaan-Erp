/**
 * Active data adapter.
 *
 * To switch to Firebase:
 *   1. Fill .env.local with NEXT_PUBLIC_FIREBASE_* keys
 *   2. import { firebaseAdapter } from "./firebaseAdapter";
 *   3. export const dataAdapter = firebaseAdapter;
 */
import { mockAdapter } from "./mockAdapter";
// import { firebaseAdapter } from "./firebaseAdapter";

export const dataAdapter = mockAdapter;
