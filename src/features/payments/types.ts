import type { PaymentMethod, PaymentStatus, PaymentType } from '../../domain/models';

export interface PaymentDraft {
  studentId: string;
  courseId: string;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  method: PaymentMethod;
  collectedBy: string;
  date: string;
  notes: string;
}

export interface RefundDraft {
  amount: number;
  reason: string;
  method: PaymentMethod;
}
