/** Stable legacy exports; receipt persistence is owned by services/receiptService. */
export { formatReceiptNo, parseReceiptNo, type ReceiptNumberParts } from '../domain/receipts';
export { backfillReceiptNumbers, nextReceiptNo, peekReceiptNo, setReceiptCounter } from '../services/receiptService';
export { generateId } from './ids';
