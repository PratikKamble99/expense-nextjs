"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getPreferences, updatePreferences } from "@/actions/settings";

export const SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
};

interface CurrencyContextValue {
  currency: string;
  symbol: string;
  rate: number;
  rates: Record<string, number>;
  loading: boolean;
  /** Format a number already in the user's display currency (no conversion). */
  formatCurrency: (amount: number) => string;
  /** Convert from any source currency to the user's display currency and format. */
  convertToDisplay: (amount: number, fromCurrency: string) => string;
  setCurrency: (code: string) => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextValue>({
  currency: "USD",
  symbol: "$",
  rate: 1,
  rates: { USD: 1 },
  loading: true,
  formatCurrency: (n) => `$${n.toFixed(2)}`,
  convertToDisplay: (n) => `$${n.toFixed(2)}`,
  setCurrency: async () => {},
});

export const useCurrency = () => useContext(CurrencyContext);

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState("USD");
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getPreferences().then((p) => p.currency).catch(() => "USD"),
      fetch("https://open.er-api.com/v6/latest/USD")
        .then((r) => r.json())
        .then((d) => (d.rates ?? {}) as Record<string, number>)
        .catch(() => ({ USD: 1 })),
    ])
      .then(([userCurrency, fetchedRates]) => {
        setCurrencyState(userCurrency);
        setRates(fetchedRates);
      })
      .finally(() => setLoading(false));
  }, []);

  const rate = rates[currency] ?? 1;
  const symbol = SYMBOLS[currency] ?? currency;

  /** Format a value already in the user's display currency — no conversion. */
  const formatCurrency = useCallback(
    (amount: number) => {
      const decimals = currency === "JPY" ? 0 : 2;
      return `${symbol}${amount.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`;
    },
    [currency, symbol]
  );

  /** Convert from `fromCurrency` to the user's display currency and format. */
  const convertToDisplay = useCallback(
    (amount: number, fromCurrency: string) => {
      const fromRate = rates[fromCurrency] ?? 1;
      const converted = amount * (rate / fromRate);
      const decimals = currency === "JPY" ? 0 : 2;
      return `${symbol}${converted.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`;
    },
    [rates, rate, currency, symbol]
  );

  const setCurrency = useCallback(
    async (code: string) => {
      const prev = currency;
      setCurrencyState(code);
      try {
        await updatePreferences({ currency: code });
      } catch {
        setCurrencyState(prev);
      }
    },
    [currency]
  );

  return (
    <CurrencyContext.Provider
      value={{ currency, symbol, rate, rates, loading, formatCurrency, convertToDisplay, setCurrency }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}
