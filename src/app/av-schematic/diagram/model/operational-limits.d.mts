export interface OperationalLimits {
  readonly maxPinsPerComponent: number;
  readonly maxWiresPerCable: number;
  readonly maxExpandedRange: number;
  readonly maxTotalEntities: number;
}

export const OPERATIONAL_LIMITS: Readonly<OperationalLimits>;
