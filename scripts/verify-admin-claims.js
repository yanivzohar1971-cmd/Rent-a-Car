/**
 * Verification script for admin custom claims
 * Run in browser console after signing in as admin
 * 
 * Usage:
 * 1. Sign in as admin user
 * 2. Open browser console (F12)
 * 3. Copy and paste the code below (without import statement)
 */

// Browser console version (paste this directly):
(async function verifyAdminClaims() {
  const { getAuth } = await import('firebase/auth');
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    console.error('❌ No user signed in');
    return;
  }

  console.log('🔍 Checking admin claims for user:', user.uid, user.email);
  
  try {
    const idTokenResult = await user.getIdTokenResult();
    const claims = idTokenResult.claims;
    const hasAdminClaim = claims.admin === true || claims.isAdmin === true;
    
    console.log('📋 Token claims:', claims);
    console.log('');
    
    if (hasAdminClaim) {
      console.log('✅ Admin claim found:', {
        admin: claims.admin,
        isAdmin: claims.isAdmin
      });
      console.log('✅ User has admin access');
      return true;
    } else {
      console.error('❌ No admin claim found');
      console.error('⚠️  User will be denied Storage write access');
      console.error('⚠️  Set custom claim using setAdminCustomClaim function');
      return false;
    }
  } catch (error) {
    console.error('❌ Error getting token:', error);
    return false;
  }
})();

// Alternative: If you have access to auth context, use this simpler version:
/*
const user = auth.currentUser;
if (user) {
  user.getIdTokenResult().then(result => {
    console.log('Claims:', result.claims);
    console.log('Has admin:', result.claims.admin === true || result.claims.isAdmin === true);
  });
}
*/
