import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const currency = (n: number, code = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(n);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const padNumber = (n: number, width = 5) =>
  String(n).padStart(width, "0");

export const COMPANY = {
  name: "Irmaan Trading Company",
  tagline: "Trading · Distribution",
  address: "Berbera, Somaliland",
  phone: "063 4446433 / 063 4446784 / 063 4449000",
  email: "info@irmaantrading.com",
  website: "www.irmaantrading.com",
  taxId: "TIN-7741200",
};
