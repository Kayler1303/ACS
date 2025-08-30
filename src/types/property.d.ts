import { Property, Unit, RentRoll, Tenancy, Resident, Lease, RentRollSnapshot } from '@prisma/client';

export type { Unit };

export type FullTenancy = Tenancy & {
  Lease: Lease & {
    Resident: Resident[];
    Unit: Unit;
  };
};

export type FullRentRoll = RentRoll & {
  snapshot?: RentRollSnapshot | null;
  Tenancy: FullTenancy[];
};

export type PendingDeletionRequest = {
  id: string;
  userExplanation: string;
  createdAt: Date;
};

export type FullProperty = Property & {
  Unit: Unit[];
  RentRoll: FullRentRoll[];
  pendingDeletionRequest: PendingDeletionRequest | null;
}; 