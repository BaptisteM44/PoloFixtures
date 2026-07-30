export type PaymentMethod = "BANK_TRANSFER" | "PAYPAL" | "CASH" | "OTHER";

export const PAYMENT_METHODS: PaymentMethod[] = ["BANK_TRANSFER", "PAYPAL", "CASH", "OTHER"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "Virement",
  PAYPAL: "PayPal",
  CASH: "Cash",
  OTHER: "Autre",
};
