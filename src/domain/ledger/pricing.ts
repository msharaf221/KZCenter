import type { Enrollment } from '../models';

/** Percentage/fixed discounts travel; an absolute override only travels within the same course. */
export function carriedEnrollmentPricing(enrollment: Enrollment | null | undefined, sameCourse: boolean) {
  return {
    priceOverride: sameCourse ? enrollment?.priceOverride : undefined,
    discountAmount: enrollment?.discountAmount, discountPercent: enrollment?.discountPercent, discountReason: enrollment?.discountReason
  };
}
