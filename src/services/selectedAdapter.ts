import { mockAdapter } from "./mockAdapter";
import { firebaseAdapter } from "./firebaseAdapter";
import { supabaseAdapter } from "./supabaseAdapter";

const useSupabase = process.env.NEXT_PUBLIC_USE_SUPABASE === "true";
const useFirebase = process.env.NEXT_PUBLIC_USE_FIREBASE === "true";

export const activeAdapterName = useSupabase
  ? ("supabase" as const)
  : useFirebase
    ? ("firebase" as const)
    : ("mock" as const);

export const dataAdapter = useSupabase
  ? supabaseAdapter
  : useFirebase
    ? firebaseAdapter
    : mockAdapter;
