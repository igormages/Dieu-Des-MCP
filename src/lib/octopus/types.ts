export interface OctopusSessionStatus {
  isAuthenticated: boolean;
  sub: string | null;
  accountNumber: string | null;
  preferredName: string | null;
  tokenExpiresAt: string | null;
  refreshExpiresAt: string | null;
}

export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

export interface OctopusSmartFlexDevice {
  id: string;
  name: string;
  deviceType: string;
  provider: string;
  propertyId: string;
  make?: string;
  status: { current: string; isSuspended: boolean };
}

export interface OctopusChargeScheduleEntry {
  dayOfWeek: DayOfWeek;
  time: string;
  max: number | null;
}

export interface OctopusChargeSchedule {
  accountNumber: string;
  deviceId: string;
  deviceName: string;
  mode: string;
  unit: string;
  targetType: string;
  schedules: OctopusChargeScheduleEntry[];
  message: string;
}

export interface OctopusSetChargeTargetResult {
  accountNumber: string;
  deviceId: string;
  deviceName: string;
  time: string;
  maxPercent: number;
  schedules: OctopusChargeScheduleEntry[];
  message: string;
}

export interface OctopusProgrammedChargeSlot {
  start: string;
  end: string;
  startLocal: string;
  endLocal: string;
  type: string;
  energyAddedKwh: number | null;
  isActive: boolean;
  isUpcoming: boolean;
  stateOfChargeFinal?: string | null;
  problems?: string[];
}

export interface OctopusProgrammedCharge {
  accountNumber: string;
  deviceId: string;
  deviceName: string;
  deviceState: string | null;
  targetTime: string | null;
  targetMaxPercent: number | null;
  plannedWindowStart: string | null;
  plannedWindowEnd: string | null;
  plannedWindowStartLocal: string | null;
  plannedWindowEndLocal: string | null;
  plannedDispatches: OctopusProgrammedChargeSlot[];
  activeSlot: OctopusProgrammedChargeSlot | null;
  upcomingSlots: OctopusProgrammedChargeSlot[];
  recentSlots: OctopusProgrammedChargeSlot[];
  message: string;
}
