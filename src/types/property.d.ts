import { Property, Unit, RentRoll, Tenancy, Resident, Lease } from '@prisma/client';

export type { Unit };

export type FullTenancy = Tenancy & {
  lease: Lease & {
    residents: Resident[];
    unit: Unit;
  };
};

export type FullRentRoll = RentRoll & {
  tenancies: FullTenancy[];
};

export type FullProperty = Property & {
  units: Unit[];
  rentRolls: FullRentRoll[];
}; 