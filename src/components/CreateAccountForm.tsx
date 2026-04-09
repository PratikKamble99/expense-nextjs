"use client";

import { useState } from "react";
import { createAccount } from "@/actions/accounts";
import { useCurrency } from "@/contexts/CurrencyContext";

interface CreateAccountFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateAccountForm({ onClose, onSuccess }: CreateAccountFormProps) {
  const { symbol, currency } = useCurrency();
  const [formData, setFormData] = useState({
    name: "",
    type: "",
    openingBalance: "",
    bank: "",
    lastFourDigits: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await createAccount({
        name: formData.name,
        currency,
        isDefault: false,
        balance: formData.openingBalance ? parseFloat(formData.openingBalance) : 0,
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-overlay" onClick={onClose}>
      <div className="glass-modal w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-8 py-6 border-b border-line-subtle/10">
          <h2 className="text-xl font-bold text-on-surface">Create New Account</h2>
          <p className="text-sm text-on-surface-variant mt-1">Add a new bank account to your wallet</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {error && (
            <div className="p-4 rounded-lg bg-error/12 border border-error/30">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {/* Account Name */}
          <div>
            <label className="label">Account Name</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g. Primary Checking"
              className="input"
              required
            />
          </div>

          {/* Type and Opening Balance */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Type</label>
              <select
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="input"
                required
              >
                <option value="">Select Type</option>
                <option value="CHECKING">Checking</option>
                <option value="SAVINGS">Savings</option>
                <option value="CREDIT_CARD">Credit Card</option>
                <option value="INVESTMENT">Investment</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Opening Balance</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-medium">{symbol}</span>
                <input
                  type="number"
                  name="openingBalance"
                  value={formData.openingBalance}
                  onChange={handleChange}
                  placeholder="0.00"
                  step="0.01"
                  className="input pl-8"
                />
              </div>
            </div>
          </div>

          {/* Bank and Last 4 Digits */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Bank / Institution</label>
              <input
                type="text"
                name="bank"
                value={formData.bank}
                onChange={handleChange}
                placeholder="e.g. Chase"
                className="input"
              />
            </div>
            <div>
              <label className="label">Last 4 Digits</label>
              <input
                type="text"
                name="lastFourDigits"
                value={formData.lastFourDigits}
                onChange={handleChange}
                placeholder="1234"
                maxLength="4"
                className="input"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Notes regarding this account..."
              className="input resize-none"
              rows={3}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
