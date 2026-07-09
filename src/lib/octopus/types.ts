export const OCTOPUS_ORIGIN = "https://octopusenergy.fr";

export type EligibilityOutcome =
  | "OK"
  | "SOURCE_LEDGER_HAS_PENDING_FUND_REQUESTS"
  | "TARGET_LEDGER_HAS_NO_ACTIVE_AGREEMENTS"
  | string;

export interface OctopusEligibleAgreement {
  id: number;
  isActive: boolean;
  billingFrequency: number;
  chargingLedger: { number: string };
  supplyPoint: {
    marketName: string;
    meterPoint?: { address?: { fullAddress?: string } };
  };
  nextPaymentForecast?: { amount: number; date: string } | null;
  eligibilityOutcome?: EligibilityOutcome;
}

export interface OctopusCagnotteStatus {
  accountNumber: string;
  potLedgerNumber: string;
  currentBalanceCents: number;
  balanceForecastCents: number;
  globalEligibilityOutcome: EligibilityOutcome;
  usable: boolean;
  usableAmountCents: number;
  eligibleAgreements: OctopusEligibleAgreement[];
  message: string;
}

export interface OctopusUseCagnotteResult {
  accountNumber: string;
  status: string;
  requestedAmountCents: number;
  sourceLedgerNumber: string;
  targetLedgerNumber: string;
  message: string;
}

export interface OctopusKrakenSessionStatus {
  isAuthenticated: boolean;
  sub: string | null;
  accountNumber: string | null;
  preferredName: string | null;
  tokenExpiresAt: string | null;
}

export interface OctopusSessionStatus {
  isAuthenticated: boolean;
  authMethod: string | null;
  sub: string | null;
  accountNumber: string | null;
  preferredName: string | null;
  sessionExpiresAt: string | null;
  kraken: OctopusKrakenSessionStatus;
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
