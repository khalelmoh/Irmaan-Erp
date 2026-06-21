import { mockAdapter } from "./mockAdapter";
import { firebaseAdapter } from "./firebaseAdapter";

const useFirebase = process.env.NEXT_PUBLIC_USE_FIREBASE === "true";

export const activeAdapterName = useFirebase
  ? ("firebase" as const)
  : ("mock" as const);

export const dataAdapter = useFirebase ? firebaseAdapter : mockAdapter;
