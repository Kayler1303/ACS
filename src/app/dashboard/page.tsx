import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from 'next/link';
import { getUserAccessibleProperties } from "@/lib/permissions";
import { PageTracker } from "@/components/PageTracker";

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
          {allProperties.map((property) => (
            <Link key={property.id} href={`/property/${property.id}`}>
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
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
} 