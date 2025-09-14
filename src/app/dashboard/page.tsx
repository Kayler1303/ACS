import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from 'next/link';
import { getUserAccessibleProperties } from "@/lib/permissions";
import { PageTracker } from "@/components/PageTracker";
import { getPropertyPaymentStatus, hasPropertyAccess, getPaymentStatusDisplay } from "@/lib/payment-utils";
import UnitDiscrepancyAlert from "@/components/UnitDiscrepancyAlert";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/dashboard");
  }

  const { owned, shared } = await getUserAccessibleProperties(session.user.id);
  
  // Mark properties with their sharing status
  const ownedWithStatus = owned.map((property: any) => ({ ...property, isShared: false, sharePermission: null }));
  const sharedWithStatus = shared.map((share: any) => ({ 
    ...share.property, 
    isShared: true, 
    sharePermission: share.permission 
  }));
  
  const allProperties = [...ownedWithStatus, ...sharedWithStatus];

  return (
    <div className="container mx-auto px-4 py-8">
      <PageTracker pageName="Dashboard" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-brand-blue">Your Properties</h1>
        <div className="flex space-x-3">
          <Link href="/account" className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded transition-colors duration-300">
            <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            My Account
          </Link>
          <Link href="/property/new" className="bg-brand-accent hover:bg-brand-accent-dark text-white font-bold py-2 px-4 rounded transition-colors duration-300">
            Create New Property
          </Link>
        </div>
      </div>

      {allProperties.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-lg">
          <p className="text-lg text-gray-600">You haven't created any properties yet.</p>
          <p className="text-gray-500 mt-2">Click the button above to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allProperties.map((property) => {
            const paymentStatus = getPropertyPaymentStatus(property);
            const hasAccess = hasPropertyAccess(property);
            const statusDisplay = getPaymentStatusDisplay(paymentStatus);
            
            // Check for unit discrepancy
            const unitDiscrepancy = property.UnitCountDiscrepancy?.find((d: any) => d.status === 'PENDING');
            
            return (
              <div key={property.id} className="relative">
                {/* Show unit discrepancy alert if present */}
                {unitDiscrepancy && (
                  <UnitDiscrepancyAlert
                    propertyId={property.id}
                    propertyName={property.name}
                    discrepancy={{
                      id: unitDiscrepancy.id,
                      declaredUnitCount: unitDiscrepancy.declaredUnitCount,
                      actualUnitCount: unitDiscrepancy.actualUnitCount,
                      paymentDifference: Number(unitDiscrepancy.paymentDifference),
                      setupType: unitDiscrepancy.setupType,
                      discoveredAt: unitDiscrepancy.discoveredAt
                    }}
                  />
                )}
                
                {hasAccess ? (
                  <Link href={`/property/${property.id}`}>
                    <div className="block bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow duration-300 p-6 relative">
                      {property.isShared && (
                        <div className="absolute top-3 right-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            property.sharePermission === 'READ_ONLY' ? 'bg-gray-100 text-gray-800' :
                            property.sharePermission === 'CONFIGURE' ? 'bg-blue-100 text-blue-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            Shared ({property.sharePermission === 'READ_ONLY' ? 'Read Only' : 
                                     property.sharePermission === 'CONFIGURE' ? 'Configure' : 'Edit'})
                          </span>
                        </div>
                      )}
                      <h2 className="text-xl font-semibold text-brand-blue mb-2 pr-20">{property.name}</h2>
                      <p className="text-gray-600">{property.address}</p>
                      {property.isShared && (
                        <p className="text-sm text-gray-500 mt-2">
                          Shared by {property.User?.name || property.User?.email}
                        </p>
                      )}
                      {(paymentStatus === 'ADMIN_GRANTED' || paymentStatus === 'ACTIVE') && (
                        <div className="mt-3">
                          <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${statusDisplay.color} ${statusDisplay.bgColor} border`}>
                            {statusDisplay.label}
                          </span>
                        </div>
                      )}
                    </div>
                  </Link>
                ) : (
                  <div className="block bg-white rounded-lg border-2 border-red-200 p-6 relative opacity-75">
                    {property.isShared && (
                      <div className="absolute top-3 right-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          property.sharePermission === 'READ_ONLY' ? 'bg-gray-100 text-gray-800' :
                          property.sharePermission === 'CONFIGURE' ? 'bg-blue-100 text-blue-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          Shared ({property.sharePermission === 'READ_ONLY' ? 'Read Only' : 
                                   property.sharePermission === 'CONFIGURE' ? 'Configure' : 'Edit'})
                        </span>
                      </div>
                    )}
                    <h2 className="text-xl font-semibold text-gray-700 mb-2 pr-20">{property.name}</h2>
                    <p className="text-gray-500">{property.address}</p>
                    {property.isShared && (
                      <p className="text-sm text-gray-400 mt-2">
                        Shared by {property.User?.name || property.User?.email}
                      </p>
                    )}
                    <div className="mt-4">
                      <div className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium ${statusDisplay.color} ${statusDisplay.bgColor} border mb-3`}>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        {statusDisplay.label}
                      </div>
                      <p className="text-sm text-gray-600 mb-3">{statusDisplay.description}</p>
                      {!property.isShared && (
                        <Link 
                          href={paymentStatus === 'PAST_DUE' ? `/property/${property.id}/payment-recovery` : `/property/${property.id}/payment-setup`}
                          className="inline-flex items-center px-4 py-2 bg-brand-blue text-white text-sm font-medium rounded-lg hover:bg-brand-blue-dark transition-colors"
                        >
                          {paymentStatus === 'PAST_DUE' ? 'Update Payment Method' : 'Set Up Payment'}
                          <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 