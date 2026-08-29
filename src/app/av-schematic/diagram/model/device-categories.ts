export const DEVICE_CATEGORY_PREFIXES: Readonly<Record<string, string>> = {
  microphone: 'MIC',
  'wireless-mic': 'WMIC',
  'media-player': 'MEDIA',
  mixer: 'MIXER',
  amplifier: 'AMP',
  loudspeaker: 'SPK',
  display: 'DISPLAY',
  camera: 'CAM',
  switcher: 'SW',
  microcontroller: 'MCU',
  'single-board-computer': 'SBC',
  imu: 'IMU',
  'motor-driver': 'DRV',
  'voltage-regulator': 'REG',
  'hall-sensor': 'HALL',
};

export const DEVICE_CATEGORIES: readonly string[] = Object.keys(DEVICE_CATEGORY_PREFIXES);

export const FALLBACK_DEVICE_PREFIX = 'DEV';
