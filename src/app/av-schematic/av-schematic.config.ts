import { InjectionToken } from '@angular/core';

export interface AvSchematicConfig {
  viewport: {
    edgePadding: number;
    zoomToFitPadding: number;
    zoomStep: number;
  };
}

export const AV_SCHEMATIC_DEFAULTS: AvSchematicConfig = {
  viewport: {
    edgePadding: 60,
    zoomToFitPadding: 20,
    zoomStep: 0.1,
  },
};

export const AV_SCHEMATIC_CONFIG = new InjectionToken<AvSchematicConfig>('AV_SCHEMATIC_CONFIG', {
  factory: () => AV_SCHEMATIC_DEFAULTS,
});

export type PartialAvSchematicConfig = {
  [K in keyof AvSchematicConfig]?: Partial<AvSchematicConfig[K]>;
};

export function provideAvSchematicConfig(overrides: PartialAvSchematicConfig) {
  return {
    provide: AV_SCHEMATIC_CONFIG,
    useValue: mergeConfig(AV_SCHEMATIC_DEFAULTS, overrides),
  };
}

function mergeConfig(
  defaults: AvSchematicConfig,
  overrides: PartialAvSchematicConfig,
): AvSchematicConfig {
  return {
    viewport: { ...defaults.viewport, ...overrides.viewport },
  };
}
