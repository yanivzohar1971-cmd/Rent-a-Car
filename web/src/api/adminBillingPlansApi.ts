import { collection, doc, setDoc, getDocsFromServer, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { BillingPlan, BillingPlanRole } from '../types/BillingPlan';

/**
 * Fetch all billing plans
 * @returns Array of all BillingPlan objects
 */
export async function fetchBillingPlans(): Promise<BillingPlan[]> {
  try {
    const plansRef = collection(db, 'billingPlans');
    const snapshot = await getDocsFromServer(plansRef);
    
    const plans: BillingPlan[] = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      plans.push({
        id: doc.id,
        role: data.role,
        planCode: data.planCode,
        displayName: data.displayName || '',
        description: data.description || undefined,
        freeMonthlyLeadQuota: data.freeMonthlyLeadQuota || 0,
        leadPrice: data.leadPrice || 0,
        fixedMonthlyFee: data.fixedMonthlyFee || 0,
        currency: data.currency || 'ILS',
        isDefault: data.isDefault || false,
        isActive: data.isActive !== false, // default to true
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as BillingPlan);
    });

    return plans;
  } catch (error) {
    console.error('Error fetching billing plans:', error);
    throw error;
  }
}

/**
 * Fetch billing plans filtered by role
 * @param role The role to filter by
 * @returns Array of BillingPlan objects for the specified role
 */
export async function fetchBillingPlansByRole(role: BillingPlanRole): Promise<BillingPlan[]> {
  try {
    const plansRef = collection(db, 'billingPlans');
    const q = query(plansRef, where('role', '==', role));
    const snapshot = await getDocsFromServer(q);
    
    const plans: BillingPlan[] = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      plans.push({
        id: doc.id,
        role: data.role,
        planCode: data.planCode,
        displayName: data.displayName || '',
        description: data.description || undefined,
        freeMonthlyLeadQuota: data.freeMonthlyLeadQuota || 0,
        leadPrice: data.leadPrice || 0,
        fixedMonthlyFee: data.fixedMonthlyFee || 0,
        currency: data.currency || 'ILS',
        isDefault: data.isDefault || false,
        isActive: data.isActive !== false,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as BillingPlan);
    });

    return plans;
  } catch (error) {
    console.error('Error fetching billing plans by role:', error);
    throw error;
  }
}

/**
 * Create a new billing plan
 * @param input Plan data (without id, createdAt, updatedAt)
 * @returns The created plan with Firestore document ID
 */
export async function createBillingPlan(input: Omit<BillingPlan, 'id' | 'createdAt' | 'updatedAt'>): Promise<BillingPlan> {
  try {
    const plansRef = collection(db, 'billingPlans');
    const newDocRef = doc(plansRef);
    
    const now = serverTimestamp() as Timestamp;
    const planData: BillingPlan = {
      id: newDocRef.id,
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(newDocRef, planData);
    return planData;
  } catch (error) {
    console.error('Error creating billing plan:', error);
    throw error;
  }
}

/**
 * Update an existing billing plan
 * @param id Plan document ID
 * @param partial Partial update data
 */
export async function updateBillingPlan(
  id: string,
  partial: Partial<Omit<BillingPlan, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const planRef = doc(db, 'billingPlans', id);
    const updateData = {
      ...partial,
      updatedAt: serverTimestamp(),
    };
    await setDoc(planRef, updateData, { merge: true });
  } catch (error) {
    console.error('Error updating billing plan:', error);
    throw error;
  }
}

/**
 * Set a plan as the default for its role
 * This ensures only one default plan per role
 * @param role The role
 * @param planCode The plan code to set as default
 */
export async function setDefaultBillingPlan(role: BillingPlanRole, planCode: 'FREE' | 'PLUS' | 'PRO'): Promise<void> {
  try {
    // First, fetch all plans for this role
    const allPlans = await fetchBillingPlansByRole(role);
    
    // Update all plans: set isDefault=false for all, then set isDefault=true for the target
    const updates = allPlans.map(async (plan) => {
      const planRef = doc(db, 'billingPlans', plan.id);
      const shouldBeDefault = plan.planCode === planCode;
      await setDoc(
        planRef,
        {
          isDefault: shouldBeDefault,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    await Promise.all(updates);
  } catch (error) {
    console.error('Error setting default billing plan:', error);
    throw error;
  }
}

