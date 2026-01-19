import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchYardsFromIndex, fetchAgentsFromIndex, fetchPrivateSellersFromIndex, fetchAllUsersFromIndex, fetchManagersFromIndex } from '../api/adminUsersIndexApi';
import { doc, getDocFromServer, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { updateUserSubscriptionAndDeal, clearUserDeal, approveYard, rejectYardRequest, revertToPrivateUser, type UpdateUserSubscriptionAndDealPayload } from '../api/adminUsersApi';
import { getEffectivePlanForUser } from '../config/billingConfig';
import type { SubscriptionPlan, UserProfile } from '../types/UserProfile';
import type { BillingPlan } from '../types/BillingPlan';
import SellerExposureEditor from '../components/admin/SellerExposureEditor';
import { fetchLeadsForCustomer, type AdminLeadItem } from '../api/adminSalesLeadsApi';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';
import './AdminCustomersPage.css';

type TabType = 'yards' | 'agents' | 'sellers' | 'deals' | 'managers';
type ModalTabType = 'details' | 'plan' | 'exposure' | 'sales';

interface CustomerRow {
  id: string;
  type: 'YARD' | 'AGENT' | 'PRIVATE_SELLER';
  name: string;
  email?: string;
  phone?: string;
  subscriptionPlan: SubscriptionPlan;
  billingDealName?: string | null;
  billingDealValidUntil?: Timestamp | null;
  hasCustomDeal: boolean;
}

export default function AdminCustomersPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>('yards');

  // Data state
  const [yards, setYards] = useState<CustomerRow[]>([]);
  const [agents, setAgents] = useState<CustomerRow[]>([]);
  const [sellers, setSellers] = useState<CustomerRow[]>([]);
  const [deals, setDeals] = useState<CustomerRow[]>([]);
  const [managers, setManagers] = useState<CustomerRow[]>([]);

  // Loading & error states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Diagnostics state (always available for ADMIN, not just debug mode)
  const [diagnostics, setDiagnostics] = useState<{
    collectionPath?: string;
    filters?: any;
    queryConstraints?: any[];
    resultCount?: number;
    lastError?: {
      code?: string;
      message?: string;
      stack?: string;
    };
    correlationId?: string;
    timestamp?: string;
  }>({});
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  // Admin Ops Controls state
  const [showOpsControls, setShowOpsControls] = useState(false);
  const [opsResults, setOpsResults] = useState<Record<string, any>>({});
  const [opsLoading, setOpsLoading] = useState<Record<string, boolean>>({});
  
  // Health check result for current tab (shown in empty state)
  const [tabHealthCheckResult, setTabHealthCheckResult] = useState<any>(null);
  
  // Rebuild index state
  const [rebuildResult, setRebuildResult] = useState<any>(null);
  const [rebuildLoading, setRebuildLoading] = useState(false);
  
  // Copy button feedback state (ChatGPT-style)
  const [copiedButtonId, setCopiedButtonId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selected customer for editing
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [selectedCustomerFull, setSelectedCustomerFull] = useState<UserProfile | null>(null);
  const [selectedCustomerPlan, setSelectedCustomerPlan] = useState<BillingPlan | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<ModalTabType>('details');
  
  // Sales/Leads data
  const [leads, setLeads] = useState<AdminLeadItem[]>([]);
  const [leadsMeta, setLeadsMeta] = useState<{ fromSellerId: number; fromEmail: number; deduped: number; total: number } | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [leadsStatusFilter, setLeadsStatusFilter] = useState<string>('ALL');

  // Edit form state
  const [editSubscriptionPlan, setEditSubscriptionPlan] = useState<SubscriptionPlan>('FREE');
  const [editDealName, setEditDealName] = useState<string>('');
  const [editDealValidUntil, setEditDealValidUntil] = useState<string>('');
  const [editCustomFreeQuota, setEditCustomFreeQuota] = useState<string>('');
  const [editCustomLeadPrice, setEditCustomLeadPrice] = useState<string>('');
  const [editCustomFixedFee, setEditCustomFixedFee] = useState<string>('');
  const [editCustomCurrency, setEditCustomCurrency] = useState<string>('ILS');

  // Check admin access
  const isAdmin = userProfile?.isAdmin === true;

  // Helper constants
  const levelColors: Record<string, { bg: string; color: string }> = {
    OK: { bg: '#e8f5e9', color: '#2e7d32' },
    WARN: { bg: '#fff3e0', color: '#f57c00' },
    FAIL: { bg: '#ffebee', color: '#c62828' },
  };

  // Generate correlation ID for diagnostics
  const generateCorrelationId = () => {
    return `cust_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };
  
  // Cleanup copy timeout on unmount
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);
  
  // Copy to clipboard with ChatGPT-style feedback
  const copyToClipboard = useCallback((text: string, buttonId: string) => {
    // Clear any existing timeout
    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }
    
    navigator.clipboard.writeText(text).then(() => {
      // Set copied state
      setCopiedButtonId(buttonId);
      
      // Reset after 1750ms (ChatGPT-style timing)
      copyTimeoutRef.current = setTimeout(() => {
        setCopiedButtonId(null);
        copyTimeoutRef.current = null;
      }, 1750);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }, []);

  // Run health check for a role
  const runHealthCheck = async (role: 'YARD' | 'AGENT' | 'PRIVATE' | 'ALL', setTabResult = false) => {
    const loadingKey = role;
    setOpsLoading(prev => ({ ...prev, [loadingKey]: true }));
    try {
      const correlationId = generateCorrelationId();
      const healthCheckFn = httpsCallable(functions, 'adminDebugCustomerHealthCheck');
      const result = await healthCheckFn({ role, correlationId });
      const resultData = result.data as any;
      setOpsResults(prev => ({ ...prev, [role]: resultData }));
      if (setTabResult) {
        setTabHealthCheckResult(resultData);
      }
      return resultData;
    } catch (error: any) {
      console.error(`Health check error for ${role}:`, error);
      const errorResult = {
        ok: false,
        level: 'FAIL' as const,
        title: `Customer Health Check: ${role}`,
        summary: `Error: ${error.message || 'Unknown error'}`,
        details: {
          correlationId: generateCorrelationId(),
          error: error.message || String(error),
          code: error.code,
        },
        ts: new Date().toISOString(),
      };
      setOpsResults(prev => ({ ...prev, [role]: errorResult }));
      if (setTabResult) {
        setTabHealthCheckResult(errorResult);
      }
      return errorResult;
    } finally {
      setOpsLoading(prev => ({ ...prev, [loadingKey]: false }));
    }
  };

  // Map tab to role for health check
  const getRoleForTab = (tab: TabType): 'YARD' | 'AGENT' | 'PRIVATE' | 'ALL' => {
    switch (tab) {
      case 'yards': return 'YARD';
      case 'agents': return 'AGENT';
      case 'sellers': return 'PRIVATE';
      case 'deals': return 'ALL';
      case 'managers': return 'ALL'; // Managers don't have a specific role for health check
      default: return 'ALL';
    }
  };

  // Rebuild adminUsersIndex
  const handleRebuildIndex = async (role: 'YARD' | 'AGENT' | 'PRIVATE' | 'ALL' = 'ALL') => {
    setRebuildLoading(true);
    setRebuildResult(null);
    try {
      const correlationId = generateCorrelationId();
      const rebuildFn = httpsCallable(functions, 'adminDebugRebuildAdminUsersIndex');
      const result = await rebuildFn({ role, correlationId });
      const resultData = result.data as any;
      setRebuildResult(resultData);
      
      // After successful rebuild, refresh health check and current tab
      if (resultData.ok) {
        await runHealthCheck('ALL');
        // Trigger tab reload by setting activeTab to itself
        setActiveTab(activeTab);
      }
    } catch (error: any) {
      console.error('Rebuild index error:', error);
      setRebuildResult({
        ok: false,
        level: 'FAIL',
        title: 'Rebuild Customers Index Failed',
        summary: `Error: ${error.message || 'Unknown error'}`,
        details: {
          correlationId: generateCorrelationId(),
          error: error.message || String(error),
        },
        ts: new Date().toISOString(),
      });
    } finally {
      setRebuildLoading(false);
    }
  };

  // Redirect if not admin (wait for auth to load first)
  useEffect(() => {
    if (authLoading) return; // Wait for auth/profile to load
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  // Load customers based on active tab
  useEffect(() => {
    if (authLoading || !isAdmin) return;

    async function loadCustomers() {
      setLoading(true);
      setError(null);
      const correlationId = generateCorrelationId();
      
      try {
        let collectionPath = 'adminUsersIndex';
        let filters: any = {};
        let queryConstraints: any[] = [];
        
        if (activeTab === 'yards') {
          filters = { primaryRole: 'YARD' };
          queryConstraints = [{ type: 'where', field: 'primaryRole', operator: '==', value: 'YARD' }];
          
          console.log('[AdminCustomersPage] Loading yards:', { collectionPath, filters, correlationId });
          
          const yardsList = await fetchYardsFromIndex();
          
          console.log('[AdminCustomersPage] Yards result:', { count: yardsList.length, correlationId });
          
          setDiagnostics({
            collectionPath,
            filters,
            queryConstraints,
            resultCount: yardsList.length,
            correlationId,
            timestamp: new Date().toISOString(),
          });
          
          const rows: CustomerRow[] = yardsList.map((yard) => ({
            id: yard.id,
            type: 'YARD',
            name: yard.name,
            email: yard.email || undefined,
            phone: yard.phone || undefined,
            subscriptionPlan: yard.subscriptionPlan || 'FREE',
            hasCustomDeal: false,
          }));
          setYards(rows);
        } else if (activeTab === 'agents') {
          filters = { primaryRole: 'AGENT' };
          queryConstraints = [{ type: 'where', field: 'primaryRole', operator: '==', value: 'AGENT' }];
          
          console.log('[AdminCustomersPage] Loading agents:', { collectionPath, filters, correlationId });
          
          const agentsList = await fetchAgentsFromIndex();
          
          console.log('[AdminCustomersPage] Agents result:', { count: agentsList.length, correlationId });
          
          setDiagnostics({
            collectionPath,
            filters,
            queryConstraints,
            resultCount: agentsList.length,
            correlationId,
            timestamp: new Date().toISOString(),
          });
          
          const rows: CustomerRow[] = agentsList.map((agent) => ({
            id: agent.id,
            type: 'AGENT',
            name: agent.name,
            email: agent.email || undefined,
            phone: agent.phone || undefined,
            subscriptionPlan: agent.subscriptionPlan || 'FREE',
            hasCustomDeal: false,
          }));
          setAgents(rows);
        } else if (activeTab === 'sellers') {
          filters = { primaryRole: 'PRIVATE' };
          queryConstraints = [{ type: 'where', field: 'primaryRole', operator: '==', value: 'PRIVATE' }];
          
          console.log('[AdminCustomersPage] Loading sellers:', { collectionPath, filters, correlationId });
          
          const sellersList = await fetchPrivateSellersFromIndex();
          
          console.log('[AdminCustomersPage] Sellers result:', { count: sellersList.length, correlationId });
          
          setDiagnostics({
            collectionPath,
            filters,
            queryConstraints,
            resultCount: sellersList.length,
            correlationId,
            timestamp: new Date().toISOString(),
          });
          
          const rows: CustomerRow[] = sellersList.map((seller) => ({
            id: seller.id,
            type: 'PRIVATE_SELLER',
            name: seller.name,
            email: seller.email || undefined,
            phone: seller.phone || undefined,
            subscriptionPlan: seller.subscriptionPlan || 'FREE',
            hasCustomDeal: false,
          }));
          setSellers(rows);
        } else if (activeTab === 'deals') {
          filters = { all: true };
          queryConstraints = [];
          
          console.log('[AdminCustomersPage] Loading deals:', { collectionPath, filters, correlationId });
          
          const allUsers = await fetchAllUsersFromIndex();
          
          console.log('[AdminCustomersPage] All users result:', { count: allUsers.length, correlationId });

          const allRows: CustomerRow[] = allUsers.map((u) => ({
            id: u.id,
            type: u.type,
            name: u.name,
            email: u.email,
            phone: u.phone,
            subscriptionPlan: u.subscriptionPlan || 'FREE',
            hasCustomDeal: false,
          }));

          // Load full user data to check for deals
          const rowsWithDeals: CustomerRow[] = [];
          for (const row of allRows) {
            try {
              const userDoc = await getDocFromServer(doc(db, 'users', row.id));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                const hasDeal = !!(userData.billingDealName || userData.customFreeMonthlyLeadQuota || userData.customLeadPrice || userData.customFixedMonthlyFee);
                if (hasDeal) {
                  rowsWithDeals.push({
                    ...row,
                    billingDealName: userData.billingDealName || null,
                    billingDealValidUntil: userData.billingDealValidUntil || null,
                    hasCustomDeal: true,
                  });
                }
              }
            } catch (err) {
              console.error(`Error loading user ${row.id}:`, err);
            }
          }
          
          setDiagnostics({
            collectionPath,
            filters,
            queryConstraints,
            resultCount: rowsWithDeals.length,
            correlationId,
            timestamp: new Date().toISOString(),
          });
          
          setDeals(rowsWithDeals);
        } else if (activeTab === 'managers') {
          filters = { isAdmin: true };
          queryConstraints = [{ type: 'where', field: 'isAdmin', operator: '==', value: true }];
          
          console.log('[AdminCustomersPage] Loading managers:', { collectionPath, filters, correlationId });
          
          const managersList = await fetchManagersFromIndex();
          
          console.log('[AdminCustomersPage] Managers result:', { count: managersList.length, correlationId });
          
          setDiagnostics({
            collectionPath: 'users',
            filters,
            queryConstraints,
            resultCount: managersList.length,
            correlationId,
            timestamp: new Date().toISOString(),
          });
          
          const rows: CustomerRow[] = managersList.map((manager) => ({
            id: manager.id,
            type: manager.type,
            name: manager.name,
            email: manager.email || undefined,
            phone: manager.phone || undefined,
            subscriptionPlan: manager.subscriptionPlan || 'FREE',
            hasCustomDeal: false,
          }));
          setManagers(rows);
        }
      } catch (err: any) {
        console.error('[AdminCustomersPage] Load error:', {
          error: err,
          code: err?.code,
          message: err?.message,
          stack: err?.stack,
          correlationId,
        });
        
        // Capture comprehensive error info
        const errorInfo = {
          code: err?.code || 'unknown',
          message: err?.message || String(err),
          stack: err?.stack,
        };
        
        setDiagnostics(prev => ({
          ...prev,
          lastError: errorInfo,
          correlationId,
          timestamp: new Date().toISOString(),
        }));
        
        // Map Firebase error codes to user-friendly messages
        let errorMessage = 'אירעה שגיאה בטעינת הלקוחות.';
        let recommendedAction = 'נסה שוב מאוחר יותר.';
        
        if (err?.code === 'permission-denied') {
          errorMessage = 'אין הרשאה לטעון נתוני לקוחות.';
          recommendedAction = 'ודא שהמשתמש שלך מסומן כמנהל במערכת (config/admins או custom claim admin=true).';
        } else if (err?.code === 'failed-precondition') {
          errorMessage = 'שגיאת אינדקס: האינדקס הנדרש לא קיים.';
          recommendedAction = err?.message?.includes('index') 
            ? `צור את האינדקס ב-Firestore Console: ${err.message}`
            : 'בדוק את ה-Firestore Console ליצירת האינדקס הנדרש.';
        } else if (err?.code === 'not-found') {
          errorMessage = 'הקולקציה או המסמך לא נמצאו.';
          recommendedAction = 'ודא שהקולקציה adminUsersIndex קיימת ומוגדרת נכון.';
        } else if (err?.message) {
          errorMessage = `שגיאה: ${err.message}`;
        }
        
        setError(`${errorMessage} ${recommendedAction}`);
      } finally {
        setLoading(false);
      }
    }

    loadCustomers();
  }, [authLoading, isAdmin, activeTab]);

  // Get current tab data
  const getCurrentTabData = (): CustomerRow[] => {
    switch (activeTab) {
      case 'yards':
        return yards;
      case 'agents':
        return agents;
      case 'sellers':
        return sellers;
      case 'deals':
        return deals;
      case 'managers':
        return managers;
      default:
        return [];
    }
  };

  // Handle customer row click (open edit panel)
  const handleCustomerClick = async (customer: CustomerRow) => {
    try {
      setError(null);
      setEditLoading(true);
      // Load full user profile
      const userDoc = await getDocFromServer(doc(db, 'users', customer.id));
      if (!userDoc.exists()) {
        setError('משתמש לא נמצא.');
        return;
      }

      const userData = userDoc.data();
      const fullUser: UserProfile = {
        uid: userDoc.id,
        email: userData.email || '',
        fullName: userData.fullName || '',
        phone: userData.phone || '',
        role: userData.role || null,
        canBuy: userData.canBuy || false,
        canSell: userData.canSell || false,
        isAgent: userData.isAgent || false,
        isYard: userData.isYard || false,
        isAdmin: userData.isAdmin || false,
        status: userData.status || 'ACTIVE',
        primaryRole: userData.primaryRole || null,
        requestedRole: userData.requestedRole || null,
        roleStatus: userData.roleStatus || null,
        subscriptionPlan: userData.subscriptionPlan || 'FREE',
        billingDealName: userData.billingDealName || null,
        billingDealValidUntil: userData.billingDealValidUntil || null,
        customFreeMonthlyLeadQuota: userData.customFreeMonthlyLeadQuota || null,
        customLeadPrice: userData.customLeadPrice || null,
        customFixedMonthlyFee: userData.customFixedMonthlyFee || null,
        customCurrency: userData.customCurrency || null,
      };

      setSelectedCustomerFull(fullUser);
      setSelectedCustomer(customer);

      // Load effective plan
      const plan = await getEffectivePlanForUser(fullUser);
      setSelectedCustomerPlan(plan);

      // Populate edit form
      setEditSubscriptionPlan(fullUser.subscriptionPlan || 'FREE');
      setEditDealName(fullUser.billingDealName || '');
      setEditDealValidUntil(
        fullUser.billingDealValidUntil
          ? new Date(fullUser.billingDealValidUntil.toMillis()).toISOString().split('T')[0]
          : ''
      );
      setEditCustomFreeQuota(fullUser.customFreeMonthlyLeadQuota?.toString() || '');
      setEditCustomLeadPrice(fullUser.customLeadPrice?.toString() || '');
      setEditCustomFixedFee(fullUser.customFixedMonthlyFee?.toString() || '');
      setEditCustomCurrency(fullUser.customCurrency || 'ILS');

      setIsEditing(true);
      setActiveModalTab('details'); // Reset to details tab when opening modal
      
      // Load leads if customer is a seller
      if (customer.type === 'YARD' || customer.type === 'AGENT') {
        loadLeadsForCustomer(customer.id, fullUser.email);
      }
    } catch (err: any) {
      console.error('Error loading customer details:', err);
      setError('אירעה שגיאה בטעינת פרטי הלקוח.');
    } finally {
      setEditLoading(false);
    }
  };

  // Load leads for customer
  const loadLeadsForCustomer = async (uid: string, email?: string) => {
    setLeadsLoading(true);
    setLeadsError(null);
    setLeadsStatusFilter('ALL'); // Reset filter when loading new customer
    try {
      const response = await fetchLeadsForCustomer({ uid, email });
      setLeads(response.items);
      setLeadsMeta(response.meta);
    } catch (err: any) {
      console.error('Error loading leads:', err);
      setLeadsError('שגיאה בטעינת לידים/מכירות');
      setLeadsMeta(null);
    } finally {
      setLeadsLoading(false);
    }
  };

  // Filter leads by status (client-side)
  const filteredLeads = leadsStatusFilter === 'ALL' 
    ? leads 
    : leads.filter(lead => lead.status === leadsStatusFilter);

  // Handle save deal
  const handleSaveDeal = async () => {
    if (!selectedCustomer) return;

    try {
      setError(null);
      setEditLoading(true);
      const payload: UpdateUserSubscriptionAndDealPayload = {
        subscriptionPlan: editSubscriptionPlan,
      };

      // Only include deal fields if deal name is provided or custom fields are set
      if (editDealName.trim() || editCustomFreeQuota || editCustomLeadPrice || editCustomFixedFee) {
        payload.billingDealName = editDealName.trim() || null;
        payload.billingDealValidUntil = editDealValidUntil
          ? Timestamp.fromDate(new Date(editDealValidUntil))
          : null;
        payload.customFreeMonthlyLeadQuota = editCustomFreeQuota ? parseFloat(editCustomFreeQuota) : null;
        payload.customLeadPrice = editCustomLeadPrice ? parseFloat(editCustomLeadPrice) : null;
        payload.customFixedMonthlyFee = editCustomFixedFee ? parseFloat(editCustomFixedFee) : null;
        payload.customCurrency = editCustomCurrency || null;
      }

      await updateUserSubscriptionAndDeal(selectedCustomer.id, payload);

      // Refresh data
      setActiveTab(activeTab); // Trigger reload
      setIsEditing(false);
      setSelectedCustomer(null);
      setSelectedCustomerFull(null);
      setSelectedCustomerPlan(null);
    } catch (err: any) {
      console.error('Error saving deal:', err);
      setError('אירעה שגיאה בשמירת הדיל.');
    } finally {
      setEditLoading(false);
    }
  };

  // Handle clear deal
  const handleClearDeal = async () => {
    if (!selectedCustomer) return;

    try {
      setError(null);
      setEditLoading(true);
      await clearUserDeal(selectedCustomer.id);

      // Refresh data
      setActiveTab(activeTab); // Trigger reload
      setIsEditing(false);
      setSelectedCustomer(null);
      setSelectedCustomerFull(null);
      setSelectedCustomerPlan(null);
    } catch (err: any) {
      console.error('Error clearing deal:', err);
      setError('אירעה שגיאה בביטול הדיל.');
    } finally {
      setEditLoading(false);
    }
  };

  // Show loading while auth is being checked
  if (authLoading) {
    return (
      <div className="admin-customers-page">
        <div className="page-container">
          <div className="loading-state">
            <p>בודק הרשאות...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const currentData = getCurrentTabData();

  return (
    <div className="admin-customers-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">ניהול לקוחות</h1>
          <div style={{ display: 'flex', gap: '0.5rem', marginRight: 'auto', flexWrap: 'wrap' }}>
            {/* Quick Health Check Buttons */}
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => runHealthCheck('ALL')}
              disabled={opsLoading['ALL']}
              title="Run Health Check for all customers"
            >
              {opsLoading['ALL'] ? 'בודק...' : '🔍 Health Check (ALL)'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => runHealthCheck('YARD')}
              disabled={opsLoading['YARD']}
              title="Run Health Check for yards"
            >
              {opsLoading['YARD'] ? 'בודק...' : '🔍 YARD'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => runHealthCheck('AGENT')}
              disabled={opsLoading['AGENT']}
              title="Run Health Check for agents"
            >
              {opsLoading['AGENT'] ? 'בודק...' : '🔍 AGENT'}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => runHealthCheck('PRIVATE')}
              disabled={opsLoading['PRIVATE']}
              title="Run Health Check for private customers"
            >
              {opsLoading['PRIVATE'] ? 'בודק...' : '🔍 PRIVATE'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowOpsControls(!showOpsControls)}
            >
              {showOpsControls ? 'הסתר' : 'הצג'} בקרות Admin Ops
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleRebuildIndex('ALL')}
              disabled={rebuildLoading}
              title="Rebuild Customers Index from canonical sources"
            >
              {rebuildLoading ? 'בונה...' : '🔧 Rebuild Customers Index'}
            </button>
          </div>
        </div>

        {/* Rebuild Result */}
        {rebuildResult && (
          <div className="dbg-ltr" style={{
            marginBottom: '1rem',
            padding: '1rem',
            background: rebuildResult.level === 'OK' ? '#e8f5e9' : rebuildResult.level === 'WARN' ? '#fff3e0' : '#ffebee',
            borderRadius: '8px',
            border: `1px solid ${rebuildResult.level === 'OK' ? '#2e7d32' : rebuildResult.level === 'WARN' ? '#f57c00' : '#c62828'}`,
            direction: 'ltr',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong>{rebuildResult.title || 'Rebuild Result'}</strong>
              <span style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                background: rebuildResult.level === 'OK' ? '#2e7d32' : rebuildResult.level === 'WARN' ? '#f57c00' : '#c62828',
                color: 'white'
              }}>
                {rebuildResult.level || 'OK'}
              </span>
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Summary:</strong> {rebuildResult.summary || 'N/A'}
            </div>
            {rebuildResult.details && (
              <>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Correlation ID:</strong>
                  <span className="dbg-ltr" dir="ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '0.25rem' }}>
                    {rebuildResult.details.correlationId || 'N/A'}
                  </span>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Scanned:</strong> {rebuildResult.details.scanned ?? 'N/A'} | 
                  <strong> Upserted:</strong> {rebuildResult.details.upserted ?? 'N/A'} | 
                  <strong> Skipped:</strong> {rebuildResult.details.skipped ?? 'N/A'}
                </div>
                {rebuildResult.details.errors && rebuildResult.details.errors.length > 0 && (
                  <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#fee', borderRadius: '4px' }}>
                    <strong>Errors ({rebuildResult.details.errors.length}):</strong>
                    <ul style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                      {rebuildResult.details.errors.slice(0, 5).map((err: string, idx: number) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.9rem' }}>Raw JSON</summary>
                  <pre className="dbg-ltr" dir="ltr" style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    overflow: 'auto',
                    fontSize: '0.8rem',
                    direction: 'ltr',
                    textAlign: 'left'
                  }}>
                    {JSON.stringify(rebuildResult, null, 2)}
                  </pre>
                </details>
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(rebuildResult, null, 2), 'copy-rebuild-result')}
                  disabled={copiedButtonId === 'copy-rebuild-result'}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 1rem',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    background: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    minWidth: '100px'
                  }}
                >
                  {copiedButtonId === 'copy-rebuild-result' ? 'הועתק' : 'העתק JSON'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Quick Health Check Results (compact, always visible if result exists) */}
        {Object.keys(opsResults).length > 0 && (
          <div className="dbg-ltr" style={{
            marginBottom: '1rem',
            padding: '1rem',
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #ddd',
            direction: 'ltr',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong>Health Check Results:</strong>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setOpsResults({})}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                Clear
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {(['ALL', 'YARD', 'AGENT', 'PRIVATE'] as const).map((role) => {
                const result = opsResults[role];
                if (!result) return null;
                const level = result.level || 'OK';
                const colors = levelColors[level] || levelColors.OK;
                return (
                  <details key={role} style={{
                    flex: '1 1 200px',
                    padding: '0.5rem',
                    background: colors.bg,
                    border: `1px solid ${colors.color}`,
                    borderRadius: '4px'
                  }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {role}: <span style={{ color: colors.color }}>{result.summary || 'N/A'}</span>
                    </summary>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
                      <div><strong>Correlation ID:</strong> <span className="dbg-ltr" style={{ fontFamily: 'monospace' }}>{result.details?.correlationId || 'N/A'}</span></div>
                      <div><strong>Count:</strong> {result.details?.count ?? 'N/A'}</div>
                      <div><strong>Collection:</strong> <span className="dbg-ltr" style={{ fontFamily: 'monospace' }}>{result.details?.collectionPath || 'N/A'}</span></div>
                      {result.details?.lastError && (
                        <div style={{ marginTop: '0.25rem', padding: '0.25rem', background: '#fee', borderRadius: '2px' }}>
                          <strong>Error:</strong> <span className="dbg-ltr" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            {result.details.lastError.code}: {result.details.lastError.message}
                          </span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => copyToClipboard(JSON.stringify(result, null, 2), `copy-json-${role.toLowerCase()}`)}
                        disabled={copiedButtonId === `copy-json-${role.toLowerCase()}`}
                        style={{ marginTop: '0.25rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', minWidth: '100px' }}
                      >
                        {copiedButtonId === `copy-json-${role.toLowerCase()}` ? 'Copied' : 'Copy JSON'}
                      </button>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}

        {/* Admin Ops Controls Grid */}
        {showOpsControls && isAdmin && (
          <div style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            background: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem', textAlign: 'right' }}>Admin Ops Controls - Customer Management</h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              {(['YARD', 'AGENT', 'PRIVATE', 'ALL'] as const).map((role) => {
                const result = opsResults[role];
                const loading = opsLoading[role];
                const level = result?.level || 'OK';
                const colors = levelColors[level] || levelColors.OK;

                return (
                  <div
                    key={role}
                    style={{
                      padding: '1rem',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      background: colors.bg
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                        {role === 'YARD' ? 'מגרשים' : role === 'AGENT' ? 'סוכנים' : role === 'PRIVATE' ? 'פרטי' : 'הכל'}
                      </h3>
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: colors.color,
                        color: 'white'
                      }}>
                        {level}
                      </span>
                    </div>
                    <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
                      {result?.summary || 'לא בוצע בדיקה'}
                    </p>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => runHealthCheck(role)}
                      disabled={loading}
                      style={{ marginTop: '0.5rem', width: '100%' }}
                    >
                      {loading ? 'בודק...' : 'הרץ Health Check'}
                    </button>
                    {result && (
                      <details style={{ marginTop: '0.5rem' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#666' }}>
                          פרטים נוספים
                        </summary>
                        <div className="dbg-ltr" dir="ltr" style={{ 
                          marginTop: '0.5rem', 
                          padding: '0.5rem', 
                          background: 'white', 
                          borderRadius: '4px', 
                          fontSize: '0.8rem',
                          direction: 'ltr',
                          textAlign: 'left'
                        }}>
                          <div style={{ marginBottom: '0.5rem' }}>
                            <strong>Correlation ID:</strong>
                            <span className="dbg-ltr" dir="ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '0.25rem' }}>
                              {result.details?.correlationId || 'N/A'}
                            </span>
                          </div>
                          <div style={{ marginBottom: '0.5rem' }}>
                            <strong>Collection:</strong>
                            <span className="dbg-ltr" dir="ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '0.25rem' }}>
                              {result.details?.collectionPath || 'N/A'}
                            </span>
                          </div>
                          <div style={{ marginBottom: '0.5rem' }}>
                            <strong>Count:</strong> {result.details?.count ?? 'N/A'}
                          </div>
                          {result.details?.lastError && (
                            <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#fee', borderRadius: '4px' }}>
                              <strong>Error:</strong>
                              <div className="dbg-ltr" dir="ltr" style={{ fontFamily: 'monospace', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                {result.details.lastError.code}: {result.details.lastError.message}
                              </div>
                            </div>
                          )}
                          <details style={{ marginTop: '0.5rem' }}>
                            <summary style={{ cursor: 'pointer', fontSize: '0.85rem' }}>Raw JSON</summary>
                            <pre className="dbg-ltr" dir="ltr" style={{
                              marginTop: '0.5rem',
                              padding: '0.5rem',
                              background: '#f9f9f9',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              overflow: 'auto',
                              fontSize: '0.75rem',
                              direction: 'ltr',
                              textAlign: 'left'
                            }}>
                              {JSON.stringify(result, null, 2)}
                            </pre>
                          </details>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(JSON.stringify(result, null, 2), `copy-json-ops-${role.toLowerCase()}`)}
                            disabled={copiedButtonId === `copy-json-ops-${role.toLowerCase()}`}
                            style={{
                              marginTop: '0.5rem',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              background: '#2196f3',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              minWidth: '100px'
                            }}
                          >
                            {copiedButtonId === `copy-json-ops-${role.toLowerCase()}` ? 'Copied' : 'Copy JSON'}
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="tabs-container">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'yards' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setActiveTab('yards');
              setTabHealthCheckResult(null); // Clear tab-specific health check result
            }}
          >
            מגרשים
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'agents' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setActiveTab('agents');
              setTabHealthCheckResult(null);
            }}
          >
            סוכנים
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'sellers' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setActiveTab('sellers');
              setTabHealthCheckResult(null);
            }}
          >
            לקוחות פרטיים
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'deals' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setActiveTab('deals');
              setTabHealthCheckResult(null);
            }}
          >
            דילים
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'managers' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setActiveTab('managers');
              setTabHealthCheckResult(null);
            }}
          >
            Managers
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="error-state">
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)}>
              ✕
            </button>
          </div>
        )}

        {/* Diagnostics Accordion (Admin-only, always available) */}
        {isAdmin && (
          <div className="diagnostics-accordion" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className="diagnostics-toggle"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              style={{
                width: '100%',
                padding: '12px',
                background: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                textAlign: 'right',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>🔍 אבחון טכני (Diagnostics)</span>
              <span>{showDiagnostics ? '▼' : '▶'}</span>
            </button>
            {showDiagnostics && (
              <div className="diagnostics-content dbg-ltr" style={{
                marginTop: '8px',
                padding: '16px',
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '13px',
                direction: 'ltr',
                textAlign: 'left'
              }}>
                <div style={{ marginBottom: '12px' }}>
                  <strong>Collection Path:</strong>
                  <span className="dbg-ltr" dir="ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '4px' }}>
                    {diagnostics.collectionPath || 'Not loaded'}
                  </span>
                </div>
                
                {diagnostics.filters && Object.keys(diagnostics.filters).length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Filters:</strong>
                    <pre className="dbg-ltr" dir="ltr" style={{ 
                      marginTop: '4px',
                      padding: '8px',
                      background: '#f9f9f9',
                      borderRadius: '4px',
                      fontSize: '12px',
                      overflow: 'auto',
                      direction: 'ltr',
                      textAlign: 'left'
                    }}>
                      {JSON.stringify(diagnostics.filters, null, 2)}
                    </pre>
                  </div>
                )}
                
                {diagnostics.queryConstraints && diagnostics.queryConstraints.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Query Constraints:</strong>
                    <pre className="dbg-ltr" dir="ltr" style={{ 
                      marginTop: '4px',
                      padding: '8px',
                      background: '#f9f9f9',
                      borderRadius: '4px',
                      fontSize: '12px',
                      overflow: 'auto',
                      direction: 'ltr',
                      textAlign: 'left'
                    }}>
                      {JSON.stringify(diagnostics.queryConstraints, null, 2)}
                    </pre>
                  </div>
                )}
                
                <div style={{ marginBottom: '12px' }}>
                  <strong>Result Count:</strong>
                  <span className="dbg-ltr" dir="ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '4px' }}>
                    {diagnostics.resultCount ?? 'Not loaded'}
                  </span>
                </div>
                
                {diagnostics.lastError && (
                  <div style={{ marginBottom: '12px', padding: '12px', background: '#fee', border: '1px solid #fcc', borderRadius: '4px' }}>
                    <strong style={{ color: '#c00' }}>Last Error:</strong>
                    <div className="dbg-ltr" dir="ltr" style={{ marginTop: '8px' }}>
                      <div><strong>Code:</strong> <span className="dbg-ltr" dir="ltr" style={{ fontFamily: 'monospace' }}>{diagnostics.lastError.code || 'unknown'}</span></div>
                      <div style={{ marginTop: '4px' }}><strong>Message:</strong> <span className="dbg-ltr" dir="ltr" style={{ fontFamily: 'monospace' }}>{diagnostics.lastError.message || 'N/A'}</span></div>
                    </div>
                  </div>
                )}
                
                {diagnostics.correlationId && (
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Correlation ID:</strong>
                    <span className="dbg-ltr" dir="ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '4px' }}>
                      {diagnostics.correlationId}
                    </span>
                  </div>
                )}
                
                {diagnostics.timestamp && (
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Timestamp:</strong>
                    <span className="dbg-ltr" dir="ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '4px' }}>
                      {diagnostics.timestamp}
                    </span>
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(diagnostics, null, 2), 'copy-diagnostics')}
                  disabled={copiedButtonId === 'copy-diagnostics'}
                  style={{
                    marginTop: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    background: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    minWidth: '120px'
                  }}
                >
                  {copiedButtonId === 'copy-diagnostics' ? 'Copied' : 'Copy Diagnostics'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="loading-state">
            <p>טוען לקוחות...</p>
          </div>
        ) : currentData.length === 0 ? (
          <div className="empty-state" style={{
            padding: '2rem',
            textAlign: 'center',
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #ddd'
          }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
              {activeTab === 'deals'
                ? 'לא נמצאו דילים פעילים.'
                : activeTab === 'managers'
                ? 'No managers found.'
                : `לא נמצאו ${activeTab === 'yards' ? 'מגרשים' : activeTab === 'agents' ? 'סוכנים' : 'לקוחות פרטיים'}.`}
            </p>
            
            {/* Explain WHY it's empty */}
            {diagnostics.lastError ? (
              <div style={{
                marginTop: '1rem',
                padding: '12px',
                background: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '4px',
                textAlign: 'right'
              }}>
                <strong>סיבה לשגיאה:</strong>
                <div style={{ marginTop: '8px' }}>
                  {diagnostics.lastError.code === 'permission-denied' && (
                    <p>❌ אין הרשאה: המשתמש לא מסומן כמנהל או חסר custom claim admin=true</p>
                  )}
                  {diagnostics.lastError.code === 'failed-precondition' && (
                    <p>❌ אינדקס חסר: נדרש ליצור אינדקס ב-Firestore Console. {diagnostics.lastError.message}</p>
                  )}
                  {diagnostics.lastError.code === 'not-found' && (
                    <p>❌ קולקציה לא נמצאה: הקולקציה adminUsersIndex לא קיימת או לא נגישה</p>
                  )}
                  {!['permission-denied', 'failed-precondition', 'not-found'].includes(diagnostics.lastError.code || '') && (
                    <p>❌ שגיאה: {diagnostics.lastError.message || 'שגיאה לא ידועה'}</p>
                  )}
                </div>
                <p style={{ marginTop: '8px', fontSize: '0.9rem', color: '#666' }}>
                  פתח את האבחון הטכני למעלה לפרטים נוספים.
                </p>
              </div>
            ) : diagnostics.resultCount === 0 ? (
              <div style={{
                marginTop: '1rem',
                padding: '12px',
                background: '#e3f2fd',
                border: '1px solid #2196f3',
                borderRadius: '4px',
                textAlign: 'right'
              }}>
                <p>ℹ️ אין מסמכים בקולקציה התואמים את הפילטרים.</p>
                <p style={{ marginTop: '8px', fontSize: '0.9rem', color: '#666' }}>
                  זה יכול להיות תקין אם באמת אין לקוחות מסוג זה במערכת.
                </p>
              </div>
            ) : (
              <div style={{
                marginTop: '1rem',
                padding: '12px',
                background: '#f5f5f5',
                border: '1px solid #ddd',
                borderRadius: '4px',
                textAlign: 'right'
              }}>
                <p>ℹ️ טרם נטענו נתונים. בדוק את האבחון הטכני למעלה.</p>
              </div>
            )}

            {/* Per-tab Health Check Button */}
            <div style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  const role = getRoleForTab(activeTab);
                  await runHealthCheck(role, true);
                }}
                disabled={opsLoading[getRoleForTab(activeTab)]}
                style={{ minWidth: '200px' }}
              >
                {opsLoading[getRoleForTab(activeTab)] 
                  ? 'בודק...' 
                  : `🔍 הרץ Health Check עבור ${activeTab === 'yards' ? 'מגרשים' : activeTab === 'agents' ? 'סוכנים' : activeTab === 'sellers' ? 'לקוחות פרטיים' : activeTab === 'managers' ? 'Managers' : 'דילים'}`}
              </button>
            </div>

            {/* Show Health Check Result if available for this tab */}
            {tabHealthCheckResult && (
              <div className="dbg-ltr" style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: '#f9f9f9',
                border: '1px solid #ddd',
                borderRadius: '8px',
                direction: 'ltr',
                textAlign: 'left'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong>Health Check Result:</strong>
                  <span style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    background: tabHealthCheckResult.level === 'OK' ? '#2e7d32' : tabHealthCheckResult.level === 'WARN' ? '#f57c00' : '#c62828',
                    color: 'white'
                  }}>
                    {tabHealthCheckResult.level || 'OK'}
                  </span>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Summary:</strong> {tabHealthCheckResult.summary || 'N/A'}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Correlation ID:</strong>
                  <span className="dbg-ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '0.25rem' }}>
                    {tabHealthCheckResult.details?.correlationId || 'N/A'}
                  </span>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Collection:</strong>
                  <span className="dbg-ltr" style={{ display: 'block', fontFamily: 'monospace', marginTop: '0.25rem' }}>
                    {tabHealthCheckResult.details?.collectionPath || 'N/A'}
                  </span>
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Count:</strong> {tabHealthCheckResult.details?.count ?? 'N/A'}
                </div>
                {tabHealthCheckResult.details?.lastError && (
                  <div style={{ marginBottom: '0.5rem', padding: '0.5rem', background: '#fee', borderRadius: '4px' }}>
                    <strong>Error:</strong>
                    <div className="dbg-ltr" style={{ fontFamily: 'monospace', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                      {tabHealthCheckResult.details.lastError.code}: {tabHealthCheckResult.details.lastError.message}
                    </div>
                  </div>
                )}
                <details style={{ marginTop: '0.5rem' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.9rem' }}>Raw JSON</summary>
                  <pre className="dbg-ltr" style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    background: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    overflow: 'auto',
                    fontSize: '0.8rem',
                    direction: 'ltr',
                    textAlign: 'left'
                  }}>
                    {JSON.stringify(tabHealthCheckResult, null, 2)}
                  </pre>
                </details>
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(tabHealthCheckResult, null, 2), 'copy-tab-health-check')}
                  disabled={copiedButtonId === 'copy-tab-health-check'}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 1rem',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    background: '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    minWidth: '100px'
                  }}
                >
                  {copiedButtonId === 'copy-tab-health-check' ? 'הועתק' : 'העתק JSON'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="table-container">
            <table className="customers-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>אימייל</th>
                  <th>טלפון</th>
                  <th>סוג משתמש</th>
                  {activeTab === 'yards' && <th>סטטוס</th>}
                  <th>חבילה</th>
                  <th>דיל</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {currentData.map((customer) => (
                  <tr key={customer.id}>
                    <td>
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.email || '—'}</td>
                    <td>{customer.phone || '—'}</td>
                    <td>
                      {activeTab === 'managers'
                        ? 'Manager'
                        : customer.type === 'YARD'
                        ? 'מגרש'
                        : customer.type === 'AGENT'
                        ? 'סוכן'
                        : 'לקוח פרטי'}
                    </td>
                    {activeTab === 'yards' && (
                      <td>
                        {/* Status will be shown in modal - this column is placeholder for future enhancement */}
                        <span style={{ fontSize: '0.85rem', color: '#666' }}>—</span>
                      </td>
                    )}
                    <td>
                      <span className={`plan-badge plan-${customer.subscriptionPlan.toLowerCase()}`}>
                        {customer.subscriptionPlan}
                      </span>
                    </td>
                    <td>
                      {customer.billingDealName ? (
                        <span className="deal-badge">{customer.billingDealName}</span>
                      ) : customer.hasCustomDeal ? (
                        <span className="deal-badge">דיל מותאם</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => handleCustomerClick(customer)}
                      >
                        ניהול
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Side Panel / Modal */}
      {isEditing && selectedCustomer && selectedCustomerFull && (
        <div className="edit-panel-overlay" onClick={() => {
          setError(null);
          setIsEditing(false);
        }}>
          <div className="edit-panel" onClick={(e) => e.stopPropagation()}>
            <div className="edit-panel-header">
              <h2>ניהול לקוח: {selectedCustomer.name}</h2>
              <button type="button" className="close-btn" onClick={() => {
                setError(null);
                setIsEditing(false);
              }}>
                ✕
              </button>
            </div>

            {editLoading ? (
              <div className="loading-state">
                <p>טוען...</p>
              </div>
            ) : (
              <div className="edit-panel-content">
                {/* Modal Tabs */}
                <div className="modal-tabs">
                  <button
                    type="button"
                    className={`modal-tab ${activeModalTab === 'details' ? 'active' : ''}`}
                    onClick={() => setActiveModalTab('details')}
                  >
                    פרטים
                  </button>
                  <button
                    type="button"
                    className={`modal-tab ${activeModalTab === 'plan' ? 'active' : ''}`}
                    onClick={() => setActiveModalTab('plan')}
                  >
                    חבילה/דיל
                  </button>
                  {(selectedCustomer.type === 'YARD' || selectedCustomer.type === 'AGENT') && (
                    <button
                      type="button"
                      className={`modal-tab ${activeModalTab === 'exposure' ? 'active' : ''}`}
                      onClick={() => setActiveModalTab('exposure')}
                    >
                      חשיפה
                    </button>
                  )}
                  <button
                    type="button"
                    className={`modal-tab ${activeModalTab === 'sales' ? 'active' : ''}`}
                    onClick={() => setActiveModalTab('sales')}
                  >
                    מכירות/לידים
                  </button>
                </div>

                {/* Tab Content */}
                <div className="modal-tab-content">
                  {/* Details Tab */}
                  {activeModalTab === 'details' && (
                    <div className="info-section">
                      <h3>Basic Information</h3>
                      <div className="info-grid">
                        <div>
                          <label>Name:</label>
                          <p>{selectedCustomerFull.fullName || selectedCustomer.name}</p>
                        </div>
                        <div>
                          <label>Email:</label>
                          <p>{selectedCustomerFull.email}</p>
                        </div>
                        <div>
                          <label>Phone:</label>
                          <p>{selectedCustomerFull.phone || '—'}</p>
                        </div>
                        <div>
                          <label>User Type:</label>
                          <p>
                            {selectedCustomerFull.isAdmin
                              ? 'Manager (Admin)'
                              : selectedCustomer.type === 'YARD'
                              ? 'Yard'
                              : selectedCustomer.type === 'AGENT'
                              ? 'Agent'
                              : 'Private Customer'}
                          </p>
                        </div>
                      </div>

                      {/* Role Information Section - Show for all users, but especially important for managers */}
                      <div className="info-section" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f9f9f9', borderRadius: '8px' }}>
                        <h3>Role & Permissions</h3>
                        <div className="info-grid">
                          <div>
                            <label>isAdmin:</label>
                            <p>
                              <span style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                background: selectedCustomerFull.isAdmin ? '#4caf50' : '#e0e0e0',
                                color: selectedCustomerFull.isAdmin ? 'white' : '#666',
                                fontWeight: 'bold',
                                fontSize: '0.9rem'
                              }}>
                                {selectedCustomerFull.isAdmin ? 'true' : 'false'}
                              </span>
                            </p>
                          </div>
                          <div>
                            <label>primaryRole:</label>
                            <p>{selectedCustomerFull.primaryRole || '—'}</p>
                          </div>
                          <div>
                            <label>role (legacy):</label>
                            <p>{selectedCustomerFull.role || '—'}</p>
                          </div>
                          <div>
                            <label>requestedRole:</label>
                            <p>{selectedCustomerFull.requestedRole || '—'}</p>
                          </div>
                          <div>
                            <label>roleStatus:</label>
                            <p>
                              <span style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '4px',
                                background: selectedCustomerFull.roleStatus === 'APPROVED' ? '#4caf50' : selectedCustomerFull.roleStatus === 'PENDING' ? '#ff9800' : '#e0e0e0',
                                color: selectedCustomerFull.roleStatus === 'APPROVED' ? 'white' : selectedCustomerFull.roleStatus === 'PENDING' ? 'white' : '#666',
                                fontWeight: 'bold',
                                fontSize: '0.9rem'
                              }}>
                                {selectedCustomerFull.roleStatus || 'NONE'}
                              </span>
                            </p>
                          </div>
                          <div>
                            <label>isAgent:</label>
                            <p>{selectedCustomerFull.isAgent ? 'true' : 'false'}</p>
                          </div>
                          <div>
                            <label>isYard:</label>
                            <p>{selectedCustomerFull.isYard ? 'true' : 'false'}</p>
                          </div>
                        </div>

                        {/* Warning badge for admins with agent/yard flags */}
                        {selectedCustomerFull.isAdmin && (selectedCustomerFull.role === 'AGENT' || selectedCustomerFull.isAgent || selectedCustomerFull.primaryRole === 'AGENT' || selectedCustomerFull.isYard || selectedCustomerFull.primaryRole === 'YARD') && (
                          <div style={{
                            marginTop: '1rem',
                            padding: '0.75rem',
                            background: '#fff3cd',
                            border: '1px solid #ffc107',
                            borderRadius: '4px',
                            direction: 'ltr',
                            textAlign: 'left'
                          }}>
                            <strong style={{ color: '#856404' }}>⚠️ Warning:</strong>
                            <p style={{ margin: '0.5rem 0 0 0', color: '#856404', fontSize: '0.9rem' }}>
                              This admin is also marked with business role flags (Agent/Yard). 
                              Admins are automatically excluded from the Agents list regardless of these flags.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Admin Action Bar - Yard Approval/Activation */}
                      {(selectedCustomerFull.requestedRole === 'YARD' || selectedCustomerFull.primaryRole === 'YARD' || selectedCustomerFull.isYard) && (
                        <div className="admin-action-bar" style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0f7ff', border: '1px solid #2196f3', borderRadius: '8px' }}>
                          <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem', fontWeight: 600 }}>Admin Actions - Yard Management</h3>
                          
                          {/* Status Explanation */}
                          <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'white', borderRadius: '4px', fontSize: '0.9rem' }}>
                            {selectedCustomerFull.roleStatus === 'PENDING' && (
                              <div style={{ color: '#856404' }}>
                                <strong>⚠️ Status: Pending Approval</strong>
                                <p style={{ margin: '0.5rem 0 0 0' }}>This yard request is pending approval. Yard actions are disabled until approved.</p>
                              </div>
                            )}
                            {selectedCustomerFull.roleStatus === 'APPROVED' && selectedCustomerFull.status === 'ACTIVE' && (
                              <div style={{ color: '#2e7d32' }}>
                                <strong>✅ Status: Active Yard</strong>
                                <p style={{ margin: '0.5rem 0 0 0' }}>This yard is approved and active.</p>
                              </div>
                            )}
                            {selectedCustomerFull.roleStatus === 'REJECTED' && (
                              <div style={{ color: '#c62828' }}>
                                <strong>❌ Status: Rejected</strong>
                                <p style={{ margin: '0.5rem 0 0 0' }}>This yard request was rejected.</p>
                              </div>
                            )}
                            {!selectedCustomerFull.roleStatus && selectedCustomerFull.isYard && (
                              <div style={{ color: '#666' }}>
                                <strong>ℹ️ Status: Legacy Yard</strong>
                                <p style={{ margin: '0.5rem 0 0 0' }}>This yard exists but has no explicit roleStatus.</p>
                              </div>
                            )}
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            {selectedCustomerFull.roleStatus === 'PENDING' && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={async () => {
                                    if (!selectedCustomer || !firebaseUser) return;
                                    if (!window.confirm('האם אתה בטוח שברצונך לאשר את המגרש? פעולה זו תפעיל את המגרש.')) return;
                                    
                                    try {
                                      setEditLoading(true);
                                      setError(null);
                                      await approveYard(selectedCustomer.id, firebaseUser.uid);
                                      
                                      // Reload customer data
                                      await handleCustomerClick(selectedCustomer);
                                      
                                      // Refresh list
                                      setActiveTab(activeTab);
                                    } catch (err: any) {
                                      console.error('Error approving yard:', err);
                                      setError('אירעה שגיאה באישור המגרש: ' + (err.message || 'Unknown error'));
                                    } finally {
                                      setEditLoading(false);
                                    }
                                  }}
                                  disabled={editLoading}
                                  style={{ minWidth: '120px' }}
                                >
                                  ✅ אישור מגרש
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={async () => {
                                    if (!selectedCustomer || !firebaseUser) return;
                                    if (!window.confirm('האם אתה בטוח שברצונך לדחות את בקשת המגרש? פעולה זו תדחה את הבקשה.')) return;
                                    
                                    try {
                                      setEditLoading(true);
                                      setError(null);
                                      await rejectYardRequest(selectedCustomer.id, firebaseUser.uid);
                                      
                                      // Reload customer data
                                      await handleCustomerClick(selectedCustomer);
                                      
                                      // Refresh list
                                      setActiveTab(activeTab);
                                    } catch (err: any) {
                                      console.error('Error rejecting yard request:', err);
                                      setError('אירעה שגיאה בדחיית הבקשה: ' + (err.message || 'Unknown error'));
                                    } finally {
                                      setEditLoading(false);
                                    }
                                  }}
                                  disabled={editLoading}
                                  style={{ minWidth: '120px' }}
                                >
                                  ❌ דחיית בקשה
                                </button>
                              </>
                            )}
                            
                            {(selectedCustomerFull.roleStatus === 'APPROVED' || (selectedCustomerFull.isYard && !selectedCustomerFull.roleStatus)) && (
                              <button
                                type="button"
                                className="btn btn-warning"
                                onClick={async () => {
                                  if (!selectedCustomer || !firebaseUser) return;
                                  if (!window.confirm('האם אתה בטוח שברצונך להחזיר את המשתמש למצב פרטי? פעולה זו תסיר את סטטוס המגרש.')) return;
                                    
                                    try {
                                      setEditLoading(true);
                                      setError(null);
                                      await revertToPrivateUser(selectedCustomer.id, firebaseUser.uid);
                                      
                                      // Reload customer data
                                      await handleCustomerClick(selectedCustomer);
                                      
                                      // Refresh list
                                      setActiveTab(activeTab);
                                    } catch (err: any) {
                                      console.error('Error reverting to private user:', err);
                                      setError('אירעה שגיאה בהחזרה למצב פרטי: ' + (err.message || 'Unknown error'));
                                    } finally {
                                      setEditLoading(false);
                                    }
                                  }}
                                  disabled={editLoading}
                                  style={{ minWidth: '120px' }}
                                >
                                  🔄 החזרה למצב פרטי
                                </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Plan/Deal Tab */}
                  {activeModalTab === 'plan' && (
                    <>
                      <div className="form-section">
                        <h3>חבילה / תכנית</h3>
                        <div className="form-group">
                          <label>תכנית מנוי:</label>
                          <select
                            value={editSubscriptionPlan}
                            onChange={(e) => setEditSubscriptionPlan(e.target.value as SubscriptionPlan)}
                            className="form-control"
                          >
                            <option value="FREE">FREE</option>
                            <option value="PLUS">PLUS</option>
                            <option value="PRO">PRO</option>
                          </select>
                        </div>

                        {selectedCustomerPlan && (
                          <div className="plan-info">
                            <h4>תצורת התכנית הנוכחית:</h4>
                            <ul>
                              <li>מכסה חינם: {selectedCustomerPlan.freeMonthlyLeadQuota} לידים/חודש</li>
                              <li>מחיר לליד: {selectedCustomerPlan.leadPrice} ₪</li>
                              <li>עמלה חודשית קבועה: {selectedCustomerPlan.fixedMonthlyFee} ₪</li>
                              <li>מטבע: {selectedCustomerPlan.currency}</li>
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="form-section">
                        <h3>דיל / התאמה אישית</h3>
                        <div className="form-group">
                          <label>שם הדיל:</label>
                          <input
                            type="text"
                            value={editDealName}
                            onChange={(e) => setEditDealName(e.target.value)}
                            className="form-control"
                            placeholder="לדוגמה: דיל VIP"
                          />
                        </div>
                        <div className="form-group">
                          <label>תוקף עד:</label>
                          <input
                            type="date"
                            value={editDealValidUntil}
                            onChange={(e) => setEditDealValidUntil(e.target.value)}
                            className="form-control"
                          />
                        </div>
                        <div className="form-group">
                          <label>מכסה חינם מותאמת:</label>
                          <input
                            type="number"
                            value={editCustomFreeQuota}
                            onChange={(e) => setEditCustomFreeQuota(e.target.value)}
                            className="form-control"
                            placeholder="השאר ריק לשימוש בתצורת התכנית"
                          />
                        </div>
                        <div className="form-group">
                          <label>מחיר לליד מותאם:</label>
                          <input
                            type="number"
                            value={editCustomLeadPrice}
                            onChange={(e) => setEditCustomLeadPrice(e.target.value)}
                            className="form-control"
                            placeholder="השאר ריק לשימוש בתצורת התכנית"
                          />
                        </div>
                        <div className="form-group">
                          <label>עמלה חודשית קבועה מותאמת:</label>
                          <input
                            type="number"
                            value={editCustomFixedFee}
                            onChange={(e) => setEditCustomFixedFee(e.target.value)}
                            className="form-control"
                            placeholder="השאר ריק לשימוש בתצורת התכנית"
                          />
                        </div>
                        <div className="form-group">
                          <label>מטבע:</label>
                          <select
                            value={editCustomCurrency}
                            onChange={(e) => setEditCustomCurrency(e.target.value)}
                            className="form-control"
                          >
                            <option value="ILS">ILS (₪)</option>
                            <option value="USD">USD ($)</option>
                            <option value="EUR">EUR (€)</option>
                          </select>
                        </div>
                      </div>

                      <div className="edit-panel-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={handleSaveDeal}
                          disabled={editLoading}
                        >
                          שמירת דיל
                        </button>
                        {selectedCustomerFull.billingDealName && (
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={handleClearDeal}
                            disabled={editLoading}
                          >
                            ביטול דיל
                          </button>
                        )}
                      </div>
                    </>
                  )}

                  {/* Exposure Tab */}
                  {activeModalTab === 'exposure' && (selectedCustomer.type === 'YARD' || selectedCustomer.type === 'AGENT') && (
                    <div className="exposure-tab-content">
                      <SellerExposureEditor sellerUid={selectedCustomer.id} />
                    </div>
                  )}

                  {/* Sales/Leads Tab */}
                  {activeModalTab === 'sales' && (
                    <div className="sales-leads-tab-content">
                      <div className="sales-leads-header">
                        <h3>מכירות/לידים</h3>
                        {leadsMeta && leadsMeta.total > 0 && (
                          <div className="leads-meta">
                            <span className="leads-count">נמצאו {leadsMeta.total} לידים</span>
                            {leadsMeta.deduped > 0 && (
                              <span className="leads-deduped-info">({leadsMeta.deduped} כפולים הוסרו)</span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {leadsLoading ? (
                        <div className="loading-state">
                          <p>טוען לידים...</p>
                        </div>
                      ) : leadsError ? (
                        <div className="error-state">
                          <p>{leadsError}</p>
                        </div>
                      ) : leads.length === 0 ? (
                        <div className="empty-state">
                          <p>אין לידים/מכירות ללקוח זה</p>
                        </div>
                      ) : (
                        <>
                          {/* Status Filter */}
                          <div className="leads-filter-section">
                            <label htmlFor="leads-status-filter">סנן לפי סטטוס:</label>
                            <select
                              id="leads-status-filter"
                              value={leadsStatusFilter}
                              onChange={(e) => setLeadsStatusFilter(e.target.value)}
                              className="form-control leads-filter-select"
                            >
                              <option value="ALL">הכל</option>
                              <option value="NEW">חדש</option>
                              <option value="IN_PROGRESS">בטיפול</option>
                              <option value="CLOSED">נסגר</option>
                              <option value="LOST">אבוד</option>
                            </select>
                            {leadsStatusFilter !== 'ALL' && (
                              <span className="filtered-count">
                                ({filteredLeads.length} מתוך {leads.length})
                              </span>
                            )}
                          </div>

                          <div className="leads-table-container">
                            <table className="leads-table">
                              <thead>
                                <tr>
                                  <th>תאריך</th>
                                  <th>סוג</th>
                                  <th>סטטוס</th>
                                  <th>רכב</th>
                                  <th>לקוח</th>
                                  <th>טלפון</th>
                                  <th>מקור</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredLeads.length === 0 ? (
                                  <tr>
                                    <td colSpan={7} className="no-results">
                                      אין לידים עם הסטטוס הנבחר
                                    </td>
                                  </tr>
                                ) : (
                                  filteredLeads.map((lead) => (
                                    <tr key={lead.id}>
                                      <td className="leadCellTruncate" title={lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—'}>
                                        {lead.createdAt?.toDate 
                                          ? lead.createdAt.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
                                          : lead.updatedAt?.toDate
                                          ? lead.updatedAt.toDate().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
                                          : '—'}
                                      </td>
                                      <td>
                                        {lead.sellerType === 'YARD' ? 'מגרש' : 'פרטי'}
                                      </td>
                                      <td>
                                        <span className={`status-badge status-${lead.status.toLowerCase().replace('_', '-')}`}>
                                          {lead.status === 'NEW' ? 'חדש' :
                                           lead.status === 'IN_PROGRESS' ? 'בטיפול' :
                                           lead.status === 'CLOSED' ? 'נסגר' :
                                           lead.status === 'LOST' ? 'אבוד' : lead.status}
                                        </span>
                                      </td>
                                      <td className="leadCellTruncate" title={lead.carTitle || lead.carId || '—'}>
                                        {lead.carTitle || lead.carId || '—'}
                                      </td>
                                      <td className="leadCellTruncate" title={lead.customerName || '—'}>
                                        {lead.customerName || '—'}
                                      </td>
                                      <td className="leadCellTruncate" title={lead.customerPhone || '—'}>
                                        {lead.customerPhone || '—'}
                                      </td>
                                      <td>
                                        {lead.source === 'WEB_SEARCH' ? 'חיפוש' :
                                         lead.source === 'YARD_QR' ? 'QR' :
                                         lead.source === 'DIRECT_LINK' ? 'קישור ישיר' : 'אחר'}
                                      </td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Modal Footer Actions */}
                <div className="edit-panel-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setError(null);
                      setIsEditing(false);
                      setActiveModalTab('details');
                    }}
                  >
                    סגור
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

