/**
 * One auditable source for every allocation-sensitive electrical limit.
 * Keep these values suitable for direct reuse by the physical-integration
 * layer: pins and cable slots describe physical capacity, while ranges and
 * total entities bound parser work.
 */
export const OPERATIONAL_LIMITS = Object.freeze({
  maxPinsPerComponent: 256,
  maxWiresPerCable: 256,
  maxExpandedRange: 256,
  maxTotalEntities: 10_000,
});
