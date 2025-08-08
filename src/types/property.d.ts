import { Property, Unit, RentRoll, Tenancy, Resident, Lease } from '@prisma/client';

export type { Unit };

export type FullTenancy = Tenancy & {
  Lease: Lease & {
    Resident: Resident[];
    Unit: Unit;
  };
};

export type FullRentRoll = RentRoll & {
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