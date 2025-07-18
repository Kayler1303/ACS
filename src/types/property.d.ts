import { Property, Unit, RentRoll, Tenancy, Resident } from '@prisma/client';

export type FullTenancy = Tenancy & {
  residents: Resident[];
};

export type FullRentRoll = RentRoll & {
  tenancies: FullTenancy[];
};

export type FullProperty = Property & {
  units: Unit[];
  rentRolls: FullRentRoll[];
}; 