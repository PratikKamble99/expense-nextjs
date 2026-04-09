"use client";

import { useState } from "react";
import type { Transaction } from "@prisma/client";

interface CreateTransactionFormProps {
  onSuccess: () => void;
  onClose: () => void;
  selectedType?: string;
  transactionToEdit?: Transaction | null;
}

export function CreateTransactionForm({ onSuccess, onClose, selectedType = "EXPENSE", transactionToEdit }: CreateTransactionFormProps) {
  const [formData, setFormData] = useState({
    type: transactionToEdit?.type || selectedType,
    description: transactionToEdit?.description || "",
    amount: transactionToEdit?.amount.toString() || "",
    category: transactionToEdit?.category || "",
    accountId: transactionToEdit?.accountId || "",
    date: transactionToEdit ? new Date(transactionToEdit.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError(null);
  };

  const handleTypeChange = (type: string) => {
    setFormData((prev) => ({
      ...prev,
      type,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      if (!formData.description.trim()) {
        throw new Error("Description is required");
      }
      if (!formData.amount || parseFloat(formData.amount) <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      const isEditing = transactionToEdit && transactionToEdit.id;
      const method = isEditing ? "PUT" : "POST";
      const endpoint = isEditing
        ? `/api/transactions/${transactionToEdit.id}`
        : "/api/transactions";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formData.type,
          description: formData.description,
          amount: parseFloat(formData.amount),
          category: formData.category || null,
          accountId: formData.accountId || null,
          date: formData.date,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${isEditing ? "update" : "create"} transaction`);
      }

      setSuccess(true);

      setTimeout(() => {
        setSuccess(false);
        onSuccess();
        onClose();
      }, 1500);
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
          <h2 className="text-xl font-bold text-on-surface">
            {transactionToEdit && transactionToEdit.id
              ? "Edit Transaction"
              : "Add New Transaction"}
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            {transactionToEdit && transactionToEdit.id
              ? "Update transaction details"
              : "Create a new transaction"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
          {error && (
            <div className="p-4 rounded-lg bg-error/12 border border-error/30 mb-6">
              <p className="text-sm text-error">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-4 rounded-lg bg-tertiary/12 border border-tertiary/30 mb-6">
              <p className="text-sm text-tertiary">
                ✓ Transaction{" "}
                {transactionToEdit && transactionToEdit.id ? "updated" : "created"}{" "}
                successfully!
              </p>
            </div>
          )}
        {/* Transaction Type */}
        <div>
          <label className="label">Type</label>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {["INCOME", "EXPENSE", "TRANSFER", "INVESTMENT"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={
                  formData.type === type
                    ? "type-pill-active"
                    : "type-pill-inactive"
                }
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Description and Amount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Description</label>
            <input
              type="text"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="e.g. Coffee at Starbucks"
              className="input"
              required
            />
          </div>
          <div>
            <label className="label">Amount</label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              className="input"
              required
            />
          </div>
        </div>

        {/* Category and Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Category</label>
            <input
              type="text"
              name="category"
              value={formData.category}
              onChange={handleChange}
              placeholder="e.g. Food & Dining"
              className="input"
            />
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="input"
              required
            />
          </div>
        </div>

        {/* Submit Button */}
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
            {loading
              ? transactionToEdit && transactionToEdit.id
                ? "Updating..."
                : "Creating..."
              : transactionToEdit && transactionToEdit.id
                ? "Update Transaction"
                : "Add Transaction"}
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}
