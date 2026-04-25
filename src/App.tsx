/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  CheckCircle2, 
  Clock, 
  Settings, 
  Plus, 
  Star, 
  LayoutDashboard, 
  LogOut, 
  Bell,
  X,
  ChevronRight,
  CircleCheck,
  Gift,
  Users,
  Trash2,
  Target,
  HandCoins,
  BookOpen,
  Home,
  Palette,
  RefreshCw,
  Shuffle,
  Download,
  User as UserIcon,
} from 'lucide-react';
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  orderBy, 
  limit,
  serverTimestamp,
  getDocFromServer,
  increment,
  writeBatch
} from 'firebase/firestore';
import { onAuthStateChanged, signInAnonymously, signOut as firebaseSignOut } from 'firebase/auth';
import { db, auth } from './firebase';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Simple Types ---
export interface FamilyUser {
  uid: string;
  name: string;
  role: 'parent' | 'kid';
  points: number;
  familyId: string;
  avatarUrl?: string;
}

// --- Contexts ---
const AuthContext = createContext<{
  user: FamilyUser | null;
  loading: boolean;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  switchUser: (targetUser: FamilyUser) => void;
  setUser: (user: FamilyUser | null) => void;
} | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

// --- Main App Component ---
export default function App() {
  const [user, setUser] = useState<FamilyUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const savedUserData = localStorage.getItem('family_points_user');
        if (savedUserData) {
          const parsed = JSON.parse(savedUserData);
          if (parsed.familyId && parsed.uid) {
            const userRef = doc(db, 'families', parsed.familyId, 'users', parsed.uid);
            try {
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                setUser(userSnap.data() as FamilyUser);
              } else {
                setUser(null);
              }
            } catch (err) {
              handleFirestoreError(err, OperationType.GET, userRef.path);
            }
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await firebaseSignOut(auth);
    localStorage.removeItem('family_points_user');
    setUser(null);
  };

  const switchUser = (targetUser: FamilyUser) => {
    if (user?.role !== 'parent') return;
    localStorage.setItem('family_points_user', JSON.stringify(targetUser));
    setUser(targetUser);
  };

  const refreshUser = async () => {
    if (user?.familyId && user?.uid) {
      const userRef = doc(db, 'families', user.familyId, 'users', user.uid);
      try {
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data() as FamilyUser;
          setUser(data);
          localStorage.setItem('family_points_user', JSON.stringify(data));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, userRef.path);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut: handleSignOut, refreshUser, switchUser, setUser }}>
      <div className="min-h-screen bg-[#f8f9fa] text-[#1a1a1a] font-sans selection:bg-blue-100 antialiased overflow-x-hidden">
        <AnimatePresence mode="wait">
          {!user ? (
            <LandingPage key="landing" onAuthSuccess={refreshUser} deferredPrompt={deferredPrompt} />
          ) : !user.familyId ? (
            <Onboarding key="onboarding" onComplete={refreshUser} />
          ) : (
            <Dashboard key="dashboard" deferredPrompt={deferredPrompt} />
          )}
        </AnimatePresence>
      </div>
    </AuthContext.Provider>
  );
}

// --- Page Components ---

function LandingPage({ onAuthSuccess, deferredPrompt }: { onAuthSuccess: () => void, deferredPrompt: any, [key: string]: any }) {
  const { setUser } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleEnter = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
      setUser({ uid: 'temp' } as any);
    } catch (err) {
      console.error("Anonymous sign in failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User choice: ${outcome}`);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <div className="mb-12">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-8 mx-auto">
          <Trophy className="text-white w-8 h-8" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-[#1a1a1a]">Pointify</h1>
        <p className="text-lg text-gray-500 max-w-sm mx-auto">Local, simple family reward system. No accounts needed.</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-[240px]">
        <button 
          onClick={handleEnter} disabled={loading}
          className="flex items-center justify-center gap-3 bg-blue-600 text-white px-8 py-4 rounded-xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
        >
          <span>Enter App</span>
        </button>
        {deferredPrompt && (
          <button 
            onClick={handleInstall}
            className="flex items-center justify-center gap-2 bg-white text-blue-600 border border-blue-100 px-8 py-4 rounded-xl font-bold hover:bg-blue-50 transition-all active:scale-95"
          >
            <Download size={18} />
            <span>Install App</span>
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Onboarding({ onComplete }: { onComplete: () => void, [key: string]: any }) {
  const { setUser } = useAuth();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<'parent' | 'kid' | null>(null);
  const [name, setName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [familyIdInput, setFamilyIdInput] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const finalize = async (familyId: string) => {
    setLoading(true);
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const userData = {
      uid: userId,
      name: name || (role === 'parent' ? 'Parent' : 'Kid'),
      role,
      familyId,
      avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${Math.random()}`,
      points: 0
    };

    const userRef = doc(db, 'families', familyId, 'users', userId);
    try {
      await setDoc(userRef, userData);
      localStorage.setItem('family_points_user', JSON.stringify(userData));
      setUser(userData as FamilyUser);
      onComplete();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, userRef.path);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFamily = async () => {
    setLoading(true);
    const familyId = Math.random().toString(36).substring(2, 11);
    const familyRef = doc(db, 'families', familyId);
    try {
      const familyData = {
        id: familyId,
        name: familyName,
        createdBy: auth.currentUser?.uid || 'temp',
        createdAt: new Date().toISOString()
      };
      await setDoc(familyRef, familyData);
      await finalize(familyId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, familyRef.path);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinFamily = async () => {
    setLoading(true);
    setError('');
    const id = familyIdInput.trim().toLowerCase();
    if (!id) {
      setError("Please enter a Family ID");
      setLoading(false);
      return;
    }
    const familyRef = doc(db, 'families', id);
    try {
      const familySnap = await getDoc(familyRef);
      if (!familySnap.exists()) {
        setError("Family ID not found!");
        setLoading(false);
        return;
      }
      await finalize(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, familyRef.path);
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="min-h-screen flex items-center justify-center p-6">
      <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm w-full max-w-sm">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="text-xl font-bold mb-1">Select Role</h2>
              <p className="text-sm text-gray-500 mb-8">What's your role in the family?</p>
              <div className="space-y-3">
                <button onClick={() => { setRole('parent'); setStep(2); }} className="w-full p-4 border border-gray-100 rounded-2xl flex items-center gap-4 hover:border-blue-600 hover:bg-blue-50/50 transition-all text-left">
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center"><Settings size={20} /></div>
                  <div className="font-bold">I'm a Parent</div>
                </button>
                <button onClick={() => { setRole('kid'); setStep(2); }} className="w-full p-4 border border-gray-100 rounded-2xl flex items-center gap-4 hover:border-blue-600 hover:bg-blue-50/50 transition-all text-left">
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center"><Star size={20} /></div>
                  <div className="font-bold">I'm a Kid</div>
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="text-xl font-bold mb-1">Your Name</h2>
              <p className="text-sm text-gray-500 mb-8">How should we call you?</p>
              <input autoFocus type="text" placeholder="e.g. Mia or Dad" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl mb-6 outline-none focus:ring-1 focus:ring-blue-600" />
              <button onClick={() => setStep(6)} disabled={!name} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-100">Continue</button>
            </motion.div>
          )}

          {step === 6 && (
            <motion.div key="step6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="text-xl font-bold mb-1">Pick Avatar</h2>
              <p className="text-sm text-gray-500 mb-8">Express yourself!</p>
              <AvatarCustomizer onSave={(url) => { setAvatarUrl(url); setStep(3); }} onCancel={() => setStep(2)} />
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="text-xl font-bold mb-1">Set Up Family</h2>
              <div className="space-y-3 mt-8">
                <button onClick={() => setStep(4)} className="w-full p-4 border border-gray-100 rounded-2xl flex items-center gap-3 hover:border-blue-600 hover:bg-blue-50/50 transition-all font-bold"><Plus size={20} className="text-blue-600" />Create Family</button>
                <button onClick={() => setStep(5)} className="w-full p-4 border border-gray-100 rounded-2xl flex items-center gap-3 hover:border-blue-600 hover:bg-blue-50/50 transition-all font-bold"><ChevronRight size={20} className="text-blue-600" />Join Family</button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h2 className="text-xl font-bold mb-1">Create Family</h2>
              <input autoFocus type="text" placeholder="The Smith Family" value={familyName} onChange={(e) => setFamilyName(e.target.value)} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl mb-6 outline-none focus:ring-1 focus:ring-blue-600" />
              <button onClick={handleCreateFamily} disabled={loading || !familyName} className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-100">Finish</button>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center gap-2 mb-1">
                <button onClick={() => setStep(3)} className="p-1 -ml-1 text-gray-400 hover:text-gray-600 transition-colors"><X size={16} /></button>
                <h2 className="text-xl font-bold">Join Family</h2>
              </div>
              <p className="text-sm text-gray-500 mb-8">Enter the Family ID shared by your parent or sibling.</p>
              <input 
                autoFocus 
                type="text" 
                placeholder="e.g. x7k2m9p..." 
                value={familyIdInput} 
                onChange={(e) => { 
                  setFamilyIdInput(e.target.value);
                  if (error) setError('');
                }} 
                className={`w-full p-4 bg-gray-50 border rounded-2xl mb-2 outline-none focus:ring-2 transition-all font-mono text-center ${error ? 'border-red-200 focus:ring-red-100' : 'border-gray-100 focus:ring-blue-100'}`} 
              />
              {error && <div className="text-[10px] text-red-500 font-bold mb-4 text-center uppercase tracking-wider">{error}</div>}
              <button 
                onClick={handleJoinFamily} 
                disabled={loading || !familyIdInput.trim()} 
                className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold shadow-lg shadow-blue-100 flex items-center justify-center gap-2"
              >
                {loading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : 'Finish & Join'}
              </button>
              <p className="text-[10px] text-gray-400 mt-4 text-center">IDs are lowercase alphanumeric strings.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// --- Dashboard ---

function Dashboard({ deferredPrompt }: { deferredPrompt: any, [key: string]: any }) {
  const { user, signOut, refreshUser, switchUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'chores' | 'rewards' | 'approvals'>('overview');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyUser[]>([]);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);

  useEffect(() => {
    if (!user?.familyId) return;

    const familiesRef = doc(db, 'families', user.familyId);
    
    // Notifications listener
    const notifsQuery = query(
      collection(familiesRef, 'notifications'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );
    const unsubNotifs = onSnapshot(notifsQuery, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'notifications'));

    // Members listener
    const membersQuery = collection(familiesRef, 'users');
    const unsubMembers = onSnapshot(membersQuery, (snapshot) => {
      setFamilyMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FamilyUser)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    refreshUser();
    
    return () => {
      unsubNotifs();
      unsubMembers();
    };
  }, [user?.uid, user?.familyId]);

  const navItems = [
    { id: 'overview', label: 'Home', icon: <LayoutDashboard size={20} /> },
    { id: 'chores', label: 'Chores', icon: <Clock size={20} /> },
    { id: 'rewards', label: 'Rewards', icon: <Star size={20} /> },
    { id: 'goals', label: 'Family Goals', icon: <Target size={20} /> },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle2 size={20} />, parentOnly: true },
  ];

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-[#f8f9fa] h-screen overflow-hidden text-[#1a1a1a]">
      {/* --- Desktop Sidebar --- */}
      <nav className="hidden lg:flex w-64 bg-white border-r border-gray-100 flex-col p-6 shrink-0 h-full">
        <div className="flex items-center gap-3 mb-10 pl-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><Trophy className="text-white w-4 h-4" /></div>
          <h1 className="text-xl font-bold tracking-tight">Pointify</h1>
        </div>
        <div className="space-y-1 flex-1">
          {navItems.filter(item => !item.parentOnly || user?.role === 'parent').map(item => (
            <NavItem 
              key={item.id}
              active={activeTab === item.id} 
              onClick={() => setActiveTab(item.id as any)} 
              icon={item.icon} 
              label={item.label} 
            />
          ))}
        </div>
        
        <div className="p-4 bg-gray-50 rounded-2xl mt-auto space-y-4">
          {deferredPrompt && (
            <button 
              onClick={async () => {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
              }}
              className="w-full p-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-100 transition-all mb-4"
            >
              <Download size={14} /> Install Pointify
            </button>
          )}
          {user?.role === 'parent' && (
            <div className="space-y-2">
              <div className="text-[11px] font-black uppercase text-gray-400 tracking-wider ml-1">Switch Account</div>
              <div className="flex gap-2 p-1 overflow-x-auto no-scrollbar">
                {familyMembers.map((member) => (
                  <button 
                    key={member.uid}
                    onClick={() => switchUser(member)}
                    className={`relative shrink-0 transition-all ${user?.uid === member.uid ? 'ring-2 ring-blue-600 ring-offset-2 scale-105' : 'opacity-60 hover:opacity-100 hover:scale-105'}`}
                    title={member.name}
                  >
                    <img src={member.avatarUrl} className="w-8 h-8 rounded-full border border-white shadow-sm" alt={member.name} />
                    <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border border-white ${member.role === 'parent' ? 'bg-indigo-500' : 'bg-blue-500'}`} />
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className={`pt-2 ${user?.role === 'parent' ? 'border-t border-gray-200/50' : ''} flex items-center gap-3`}>
            <button 
              onClick={() => setShowAvatarModal(true)}
              className="relative group shrink-0"
              title="Change Avatar"
            >
              <img src={user?.avatarUrl} className="w-10 h-10 rounded-full border-2 border-white shadow-sm transition-all group-hover:ring-2 group-hover:ring-blue-100" alt="" />
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 rounded-full flex items-center justify-center transition-all text-white">
                <Palette size={12} />
              </div>
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold truncate">{user?.name}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <span className="capitalize">{user?.role}</span>
                <span className="opacity-30">•</span>
                <button onClick={() => setShowAvatarModal(true)} className="hover:text-blue-600 transition-colors">Edit</button>
              </div>
            </div>
            <button 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowLogoutModal(true);
              }}
              className="p-2.5 bg-white border border-red-50 text-red-400 rounded-xl hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
              title="Log Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* --- Mobile Header --- */}
      <header className="lg:hidden bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center shrink-0"><Trophy className="text-white w-3.5 h-3.5" /></div>
          <span className="font-bold tracking-tight text-lg">Pointify</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsActivityOpen(true)} className="p-2 text-gray-500 hover:bg-gray-50 rounded-xl relative">
            <Bell size={20} />
            {notifications.length > 0 && <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white" />}
          </button>
          <button onClick={() => setShowLogoutModal(true)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-20 lg:pb-0">
        <div className="p-4 md:p-8 max-w-5xl w-full mx-auto space-y-6 md:space-y-8 flex-1">
          <header className="flex justify-between items-center sm:block">
            <h2 className="text-xl md:text-2xl font-bold capitalize lg:block hidden">{activeTab}</h2>
            <div className="px-4 py-2 bg-white border border-gray-100 rounded-2xl shadow-sm font-medium flex items-center gap-3 w-fit sm:mt-2">
              <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><Star size={14} fill="currentColor" /></div>
              <span className="text-xs md:text-sm">Points: <span className="font-bold text-blue-600">{user?.points}</span></span>
            </div>
          </header>
          
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && <OverviewView key="overview" />}
            {activeTab === 'chores' && <ChoresView key="chores" />}
            {activeTab === 'rewards' && <RewardsView key="rewards" />}
            {activeTab === 'goals' && <SharedGoalsView key="goals" />}
            {activeTab === 'approvals' && user?.role === 'parent' && <ApprovalsView key="approvals" onAction={fetchData} />}
          </AnimatePresence>
        </div>
      </main>

      {/* --- Desktop Activity Bar --- */}
      <aside className="hidden xl:flex w-80 bg-gray-50 border-l border-gray-100 flex-col h-screen overflow-hidden">
        <div className="p-8 pb-4"><h3 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><Bell size={12} />Activity</h3></div>
        <div className="flex-1 overflow-y-auto p-8 pt-2 space-y-4">
          {notifications.map((notif, i) => <NotificationCard key={i} notification={notif} />)}
          {notifications.length === 0 && <div className="text-center py-10 text-gray-400 text-sm font-medium">No activity yet</div>}
        </div>
      </aside>

      {/* --- Mobile Activity Drawer --- */}
      <AnimatePresence>
        {isActivityOpen && (
          <div className="lg:hidden fixed inset-0 z-50 overflow-hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setIsActivityOpen(false)} />
            <motion.aside 
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2"><Bell size={18} />Activity</h3>
                <button onClick={() => setIsActivityOpen(false)} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full"><X size={20} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {notifications.map((notif, i) => <NotificationCard key={i} notification={notif} />)}
                {notifications.length === 0 && <div className="text-center py-10 text-gray-400 text-xs font-medium">No activity yet</div>}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* --- Mobile Bottom Nav --- */}
      <nav className="lg:hidden fixed bottom-6 left-6 right-6 z-40">
        <div className="bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl rounded-[32px] p-2 flex items-center justify-between shadow-blue-100/50">
          {navItems.filter(item => !item.parentOnly || user?.role === 'parent').map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex-1 flex flex-col items-center gap-1 p-2 rounded-2xl transition-all ${activeTab === item.id ? 'text-blue-600' : 'text-gray-400'}`}
            >
              <div className={`p-2 rounded-xl transition-all ${activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 lg:shadow-none' : 'hover:bg-gray-50'}`}>
                {item.icon}
              </div>
              <span className="text-xs font-bold uppercase tracking-tighter">{item.label}</span>
            </button>
          ))}
          {user?.role === 'parent' && (
            <button
              onClick={() => {
                // For mobile switcher, maybe show a small popover or just switch to next child?
                // For now, let's just use the desktop logic but we need a trigger.
                // We'll add the switcher to the activity drawer or profile section.
                setIsActivityOpen(true);
              }}
              className="flex-1 flex flex-col items-center gap-1 p-2 text-gray-400"
            >
              <div className="p-1 rounded-full border-2 border-transparent">
                <img src={user?.avatarUrl} className="w-8 h-8 rounded-full border border-gray-100" alt="" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-tighter">You</span>
            </button>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {showLogoutModal && (
          <LogoutModal 
            user={user} 
            onClose={() => setShowLogoutModal(false)} 
            onConfirm={() => {
              setShowLogoutModal(false);
              signOut();
            }} 
          />
        )}
        {showAvatarModal && user && (
          <AvatarModal 
            user={user} 
            onClose={() => setShowAvatarModal(false)} 
            onRefresh={refreshUser} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function LogoutModal({ user, onClose, onConfirm }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/10 backdrop-blur-md" onClick={onClose} />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-white p-6 sm:p-8 rounded-[32px] sm:rounded-[40px] w-full max-w-sm shadow-2xl space-y-6 text-center border border-gray-100"
      >
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <LogOut size={32} />
        </div>
        <h2 className="text-xl font-bold">Log out?</h2>
        <div className="space-y-4">
          <p className="text-sm text-gray-500 leading-relaxed">
            You're using a guest session. Make sure you've saved your <span className="font-bold text-blue-600">Family ID</span> if you want to join this group again later.
          </p>
          <div className="bg-gray-50 p-4 rounded-2xl">
            <div className="text-xs font-black uppercase text-gray-400 tracking-widest mb-1">Your Family ID</div>
            <div className="font-mono text-base font-bold text-blue-600 select-all">{user?.familyId}</div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 p-4 bg-gray-50 rounded-2xl font-bold text-xs hover:bg-gray-100 transition-colors">Go Back</button>
          <button onClick={onConfirm} className="flex-1 p-4 bg-red-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-red-100 hover:bg-red-700 transition-all">Log Out</button>
        </div>
      </motion.div>
    </div>
  );
}


function NavItem({ active, onClick, icon, label }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all ${active ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
      {icon}{label}
    </button>
  );
}

function NotificationCard({ notification }: any) {
  const diff = Math.floor((new Date().getTime() - new Date(notification.timestamp).getTime()) / 60000);
  const time = diff < 1 ? 'JUST NOW' : diff < 60 ? `${diff} MINS AGO` : diff < 1440 ? `${Math.floor(diff/60)} HOURS AGO` : 'YESTERDAY';
  return (
    <div className={`p-4 bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${notification.type === 'chore_completed' ? 'border-l-blue-500' : notification.type === 'reward_redeemed' ? 'border-l-amber-500' : 'border-l-green-500'}`}>
      <div className="text-[10px] text-gray-400 font-bold mb-1 uppercase">{time}</div>
      <p className="text-sm font-bold text-[#1a1a1a] mb-0.5">{notification.type.replace('_', ' ').toUpperCase()}</p>
      <p className="text-xs text-gray-600 leading-tight">{notification.message}</p>
    </div>
  );
}

// --- Views Implementation ---

function OverviewView() {
  const { user } = useAuth();
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [selectedChild, setSelectedChild] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user?.familyId) return;
    const unsub = onSnapshot(collection(db, 'families', user.familyId, 'users'), (snapshot) => {
      setFamilyMembers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));
    return () => unsub();
  }, [user?.familyId]);

  const copyCode = () => {
    if (user?.familyId) {
      navigator.clipboard.writeText(user.familyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">Family Rankings</h3>
          <div className="space-y-6">
            {familyMembers.sort((a,b) => b.points - a.points).map((member, i) => (
              <div 
                key={i} 
                onClick={() => {
                  if (user?.role === 'parent' && member.role === 'kid') {
                    setSelectedChild(member);
                  }
                }}
                className={`space-y-2 group p-2 -m-2 rounded-2xl transition-all ${user?.role === 'parent' && member.role === 'kid' ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
              >
                <div className="flex justify-between items-center text-xs font-bold text-gray-500 uppercase px-1">
                  <div className="flex items-center gap-2">
                    <img src={member.avatarUrl} className="w-6 h-6 rounded-full border border-white shadow-sm" alt="" />
                    <span>{member.name}</span>
                    {member.role === 'parent' && <span className="bg-indigo-50 text-indigo-500 px-1 border border-indigo-100 rounded text-[7px] font-black uppercase tracking-tighter">Parent</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span>{member.points} pts</span>
                    {user?.role === 'parent' && member.role === 'kid' && (
                      <ChevronRight size={14} className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    )}
                  </div>
                </div>
                <div className="h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-50">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min((member.points / 1000) * 100, 100)}%` }} className={`h-full ${member.role === 'parent' ? 'bg-indigo-500' : 'bg-blue-500'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col justify-center items-center">
          <div className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-2">FAMILY ID</div>
          <div 
            onClick={copyCode}
            className="text-blue-600 font-mono font-bold select-all bg-blue-50 px-4 py-2 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors flex items-center gap-2 group border border-blue-100"
          >
            {user?.familyId}
            <span className="text-[10px] opacity-0 group-hover:opacity-100 transition-opacity bg-blue-600 text-white px-2 py-0.5 rounded-md">
              {copied ? 'Copied!' : 'Copy'}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-4 text-center">Share this ID with family members to let them join!</p>
        </div>
      </div>

      <AnimatePresence>
        {selectedChild && (
          <ManageChildModal 
            child={selectedChild} 
            onClose={() => {
              setSelectedChild(null);
              fetchMembers();
            }} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ManageChildModal({ child, onClose }: any) {
  const [points, setPoints] = useState(child.points);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!child?.uid || !user?.familyId) return;
    const activityQuery = query(
      collection(db, 'families', user.familyId, 'completions'),
      where('kidId', '==', child.uid),
      where('status', '==', 'approved'),
      limit(50)
    );
    const unsub = onSnapshot(activityQuery, (snapshot) => {
      setActivity(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'chore' })));
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'completions'));
    return () => unsub();
  }, [child.uid, user?.familyId]);

  const updatePoints = async () => {
    if (!user?.familyId) return;
    setSaving(true);
    const userRef = doc(db, 'families', user.familyId, 'users', child.uid);
    try {
      await updateDoc(userRef, { points });
      setSaving(false);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, userRef.path);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/10 backdrop-blur-md" onClick={onClose} />
      <motion.div 
        initial={{ y: 50, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        exit={{ y: 50, opacity: 0 }}
        className="relative bg-white p-8 rounded-[40px] w-full max-w-lg shadow-2xl space-y-8 max-h-[85vh] overflow-hidden flex flex-col border border-gray-100"
      >
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3 md:gap-4">
            <img src={child.avatarUrl} className="w-12 h-12 md:w-16 md:h-16 rounded-2xl md:rounded-3xl border-4 border-white shadow-xl rotate-3" alt="" />
            <div>
              <h2 className="text-xl md:text-2xl font-bold">{child.name}</h2>
              <div className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Manage Profile</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-50 rounded-full text-gray-400"><X size={20} /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
          <div className="md:col-span-2 space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Current Points</label>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  value={points} 
                  onChange={(e) => setPoints(parseInt(e.target.value) || 0)} 
                  className="flex-1 min-w-0 p-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 font-bold transition-all text-sm" 
                />
                <button 
                  onClick={updatePoints}
                  disabled={saving}
                  className="px-6 bg-blue-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 disabled:bg-gray-200 whitespace-nowrap"
                >
                  {saving ? '...' : 'Update'}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPoints((p: number) => p + 50)} className="flex-1 p-4 bg-green-50 text-green-600 rounded-2xl font-bold text-[11px] hover:bg-green-100 transition-colors uppercase tracking-widest">+50 pts</button>
              <button onClick={() => setPoints((p: number) => Math.max(0, p - 50))} className="flex-1 p-4 bg-red-50 text-red-600 rounded-2xl font-bold text-[11px] hover:bg-red-100 transition-colors uppercase tracking-widest">-50 pts</button>
            </div>
          </div>
          <div className="bg-blue-50 p-6 rounded-[32px] flex flex-col justify-center items-center text-blue-600 border border-blue-100 shadow-inner md:scale-100 scale-90">
            <Trophy size={32} className="mb-2 opacity-50" />
            <div className="text-4xl font-black">{points}</div>
            <div className="text-[11px] font-black uppercase opacity-60">Balance</div>
          </div>
        </div>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <h3 className="text-xs font-black uppercase text-gray-400 tracking-widest flex items-center gap-2">
            <Clock size={12} /> Activity History
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center p-12">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : activity.length === 0 ? (
              <div className="p-8 text-center bg-gray-50 rounded-3xl text-gray-400 text-sm">No recent activity</div>
            ) : (
              activity.map((item, i) => (
                <div key={i} className="bg-gray-50 p-4 rounded-2xl flex items-center justify-between border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${item.type === 'chore' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                      {item.type === 'chore' ? <CircleCheck size={16} /> : <Gift size={16} />}
                    </div>
                    <div>
                      <div className="text-sm font-bold">{item.choreTitle || item.rewardTitle}</div>
                      <div className="text-[10px] text-gray-400 font-bold uppercase">{new Date(item.timestamp).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className={`text-sm font-black ${item.type === 'chore' ? 'text-green-500' : 'text-red-500'}`}>
                    {item.type === 'chore' ? '+' : '-'}{item.pointsAwarded || item.cost}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function ChoresView() {
  const { user } = useAuth();
  const [chores, setChores] = useState<any[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [completingIds, setCompletingIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deletingChore, setDeletingChore] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  useEffect(() => {
    if (!user?.familyId) return;
    const choresRef = collection(db, 'families', user.familyId, 'chores');
    const unsubChores = onSnapshot(choresRef, (snapshot) => {
      setChores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'chores'));

    const completionsRef = collection(db, 'families', user.familyId, 'completions');
    const q = query(completionsRef, where('status', '==', 'pending'), where('kidId', '==', user.uid));
    const unsubComps = onSnapshot(q, (snapshot) => {
      setPendingIds(snapshot.docs.map(doc => doc.data().choreId));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'completions'));

    return () => {
      unsubChores();
      unsubComps();
    };
  }, [user?.familyId, user?.uid]);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const complete = async (chore: any) => {
    if (!user?.familyId) return;
    setCompletingIds(prev => [...prev, chore.id]);
    try {
      const completionsRef = collection(db, 'families', user.familyId, 'completions');
      await addDoc(completionsRef, { 
        choreId: chore.id, 
        kidId: user.uid, 
        kidName: user.name,
        choreTitle: chore.title,
        status: 'pending', 
        familyId: user.familyId, 
        pointsAwarded: chore.points,
        timestamp: new Date().toISOString()
      });

      const notifsRef = collection(db, 'families', user.familyId, 'notifications');
      await addDoc(notifsRef, { 
        userId: 'ALL_PARENTS', 
        familyId: user.familyId, 
        message: `${user.name} completed: ${chore.title}`, 
        type: 'chore_completed',
        read: false,
        timestamp: new Date().toISOString()
      });

      showToast("Told your parents! Waiting for approval.");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'completions');
    } finally {
      setCompletingIds(prev => prev.filter(id => id !== chore.id));
    }
  };

  const deleteChore = async () => {
    if (!deletingChore || !user?.familyId) return;
    const choreRef = doc(db, 'families', user.familyId, 'chores', deletingChore.id);
    try {
      await deleteDoc(choreRef);
      setDeletingChore(null);
      showToast("Chore deleted", "info" as any);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, choreRef.path);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 relative">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[60] bg-[#1a1a1a] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10"
          >
            <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
              <Star size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center"><h3 className="text-xl font-bold">Chore Catalog</h3>{user?.role === 'parent' && <button onClick={() => setShowModal(true)} className="text-blue-600 font-bold text-sm bg-blue-50 px-5 py-2.5 rounded-2xl border border-blue-100 hover:bg-blue-100 transition-all">+ Add Chore</button>}</div>
      
      <div className="space-y-12">
        {['homework', 'family'].map(cat => {
          const filtered = chores.filter(c => c.category === cat || (!c.category && cat === 'family'));

          return (
            <div key={cat} className="space-y-4">
              <div className="flex items-center gap-3 px-1">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cat === 'homework' ? 'bg-purple-600 text-white shadow-lg shadow-purple-100' : 'bg-orange-500 text-white shadow-lg shadow-orange-100'}`}>
                  {cat === 'homework' ? <BookOpen size={16} /> : <Home size={16} />}
                </div>
                <h4 className="font-bold text-gray-900 capitalize italc text-sm tracking-tight">{cat === 'homework' ? 'Homework (Tutor)' : 'Family Work'}</h4>
              </div>

              {filtered.length === 0 ? (
                <div className="bg-white p-12 rounded-[32px] border border-dashed border-gray-100 flex flex-col items-center text-center">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-3 ${cat === 'homework' ? 'bg-purple-50 text-purple-200' : 'bg-orange-50 text-orange-200'}`}>
                    {cat === 'homework' ? <BookOpen size={24} /> : <Home size={24} />}
                  </div>
                  <div className="text-xs font-bold text-gray-400">No {cat === 'homework' ? 'homework' : 'family work'} assigned yet.</div>
                </div>
              ) : (
                <>
                  {/* --- Desktop Table --- */}
                  <div className="hidden sm:block bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="text-xs text-gray-400 uppercase tracking-widest border-b border-gray-50 font-black">
                        <tr><th className="px-6 py-4">Task</th><th className="px-6 py-4 text-right">Points</th><th className="px-6 py-4 text-right">Action</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filtered.map((c, i) => {
                          const isPending = pendingIds.includes(c.id);
                          const isCompleting = completingIds.includes(c.id);
                          return (
                            <tr key={i} className="text-sm cursor-default hover:bg-gray-50/50 transition-colors">
                              <td className="px-6 py-5">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${c.category === 'homework' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
                                    {c.category === 'homework' ? <BookOpen size={16} /> : <Home size={16} />}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <div className="font-bold">{c.title}</div>
                                      {!c.isRecurring && (
                                        <span className="text-xs bg-red-50 text-red-500 px-2 py-1 rounded-lg font-black tracking-tighter uppercase">One-Time</span>
                                      )}
                                      {c.expiresAt && (
                                        <span className="text-xs bg-amber-50 text-amber-600 px-2 py-1 rounded-lg font-black tracking-tighter uppercase">Expiring</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {isPending && <div className="text-[10px] text-amber-500 font-bold uppercase font-black tracking-wider mt-1 px-11">Pending Approval</div>}
                              </td>
                              <td className="px-6 py-5 text-right font-bold text-blue-600">{c.points}</td>
                              <td className="px-6 py-5 text-right font-bold">
                                <div className="flex items-center justify-end gap-3">
                                  {user?.role === 'parent' && (
                                    <button onClick={() => setDeletingChore(c)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                  )}
                                  {user?.role === 'kid' && (
                                    <button 
                                      onClick={() => complete(c)} 
                                      disabled={isPending || isCompleting}
                                      className={`px-4 py-2 rounded-xl text-white transition-all font-bold text-xs flex items-center justify-center min-w-[80px] shadow-sm ${isPending ? 'bg-gray-100 text-gray-400 cursor-not-allowed shadow-none' : isCompleting ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700 active:scale-95'}`}
                                    >
                                      {isCompleting ? (
                                        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                                      ) : isPending ? 'Sent' : 'Done'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* --- Mobile Cards --- */}
                  <div className="sm:hidden space-y-3">
                    {filtered.map((c, i) => {
                      const isPending = pendingIds.includes(c.id);
                      const isCompleting = completingIds.includes(c.id);
                      return (
                        <div key={i} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4">
                          <div className="flex justify-between items-start">
                            <div className="flex items-start gap-3">
                              <div className={`p-2.5 rounded-xl shrink-0 ${c.category === 'homework' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
                                {c.category === 'homework' ? <BookOpen size={18} /> : <Home size={18} />}
                              </div>
                              <div>
                                <div className="font-bold text-gray-900 leading-tight text-base">{c.title}</div>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {!c.isRecurring && <span className="text-[10px] bg-red-50 text-red-500 px-2 py-1 rounded-lg font-black uppercase">One-Time</span>}
                                  {c.expiresAt && <span className="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded-lg font-black uppercase tracking-tighter">Expiring</span>}
                                </div>
                              </div>
                            </div>
                            <div className="text-blue-600 font-bold text-lg">{c.points}</div>
                          </div>
                          
                          <div className="flex items-center justify-between gap-4 mt-1 border-t border-gray-50 pt-3">
                            <div className="flex items-center gap-3">
                              {user?.role === 'parent' && (
                                <button onClick={() => setDeletingChore(c)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                              )}
                              {isPending ? (
                                <div className="text-[10px] text-amber-500 font-black uppercase tracking-widest">Pending Approval</div>
                              ) : (
                                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Ready to work</div>
                              )}
                            </div>
                            {user?.role === 'kid' && (
                              <button 
                                onClick={() => complete(c)} 
                                disabled={isPending || isCompleting}
                                className={`px-6 py-3 rounded-2xl text-white transition-all font-bold text-xs flex items-center justify-center min-w-[100px] shadow-sm ${isPending ? 'bg-gray-50 text-gray-400 cursor-not-allowed shadow-none' : isCompleting ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 active:scale-95'}`}
                              >
                                {isCompleting ? (
                                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                                ) : isPending ? 'Sent' : 'Submit Done'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {showModal && <AddChoreModal onClose={() => { setShowModal(false); fetchData(); }} user={user} />}
      <AnimatePresence>
        {deletingChore && (
          <DeleteConfirmationModal 
            title="Delete Chore" 
            message={`Are you sure you want to delete "${deletingChore.title}"?`}
            onConfirm={deleteChore} 
            onCancel={() => setDeletingChore(null)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AddChoreModal({ onClose, user }: any) {
  const [title, setTitle] = useState('');
  const [points, setPoints] = useState(50);
  const [category, setCategory] = useState<'family' | 'homework'>('family');
  const [isRecurring, setIsRecurring] = useState(true);
  const [duration, setDuration] = useState<string>('none'); // none, 24h, 3d, 7d
  
  const submit = async (e: any) => {
    e.preventDefault();
    if (!user?.familyId) return;

    let expiresAt = null;
    if (duration !== 'none') {
      const now = new Date();
      if (duration === '24h') now.setHours(now.getHours() + 24);
      if (duration === '3d') now.setDate(now.getDate() + 3);
      if (duration === '7d') now.setDate(now.getDate() + 7);
      expiresAt = now.toISOString();
    }

    const choresRef = collection(db, 'families', user.familyId, 'chores');
    const choreData = {
      title, 
      points, 
      familyId: user.familyId, 
      createdBy: user.uid,
      isRecurring,
      expiresAt,
      category,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(choresRef, choreData);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, choresRef.path);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"><div className="absolute inset-0 bg-black/10 backdrop-blur-sm" onClick={onClose} />
      <motion.form initial={{ scale: 0.9 }} animate={{ scale: 1 }} onSubmit={submit} className="relative bg-white p-6 sm:p-8 rounded-[32px] w-full max-w-sm space-y-6">
        <h2 className="text-xl font-bold">New Chore</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Category</label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                type="button" 
                onClick={() => setCategory('family')}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all text-xs font-bold ${category === 'family' ? 'border-orange-500 bg-orange-50 text-orange-600' : 'border-gray-100 bg-gray-50 text-gray-400 opacity-60'}`}
              >
                <Home size={16} /> Family
              </button>
              <button 
                type="button" 
                onClick={() => setCategory('homework')}
                className={`flex items-center justify-center gap-2 p-3 rounded-2xl border-2 transition-all text-xs font-bold ${category === 'homework' ? 'border-purple-500 bg-purple-50 text-purple-600' : 'border-gray-100 bg-gray-50 text-gray-400 opacity-60'}`}
              >
                <BookOpen size={16} /> Homework
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Title</label>
            <input required type="text" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-3 sm:p-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-1">Points</label>
            <input required type="number" value={points} onChange={(e) => setPoints(parseInt(e.target.value))} className="w-full p-3 sm:p-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 transition-all font-medium text-sm" />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button"
              onClick={() => setIsRecurring(!isRecurring)}
              className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group gap-2"
            >
              <div className="text-[10px] font-black uppercase text-gray-400">Behavior</div>
              <div className="text-xs font-bold text-gray-900">{isRecurring ? 'Recurring' : 'One-Time'}</div>
              <div className={`w-8 h-4 rounded-full transition-all relative ${isRecurring ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isRecurring ? 'left-4.5' : 'left-0.5'}`} />
              </div>
            </button>

            <div className="p-4 bg-gray-50 rounded-2xl flex flex-col items-center justify-center gap-2">
              <div className="text-xs font-black uppercase text-gray-400">Duration</div>
              <select 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)}
                className="text-sm font-bold bg-transparent outline-none cursor-pointer text-blue-600 appearance-none text-center w-full"
              >
                <option value="none">No Limit</option>
                <option value="24h">24 Hours</option>
                <option value="3d">3 Days</option>
                <option value="7d">1 Week</option>
              </select>
            </div>
          </div>
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-95">Save Chore</button>
      </motion.form>
    </div>
  );
}

function RewardsView() {
  const { user } = useAuth();
  const [rewards, setRewards] = useState<any[]>([]);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [deletingReward, setDeletingReward] = useState<any | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  useEffect(() => {
    if (!user?.familyId) return;
    const rewardsRef = collection(db, 'families', user.familyId, 'rewards');
    const unsubRewards = onSnapshot(rewardsRef, (snapshot) => {
      setRewards(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rewards'));

    const redemptionsRef = collection(db, 'families', user.familyId, 'redemptions');
    const q = query(redemptionsRef, where('status', '==', 'pending'), where('kidId', '==', user.uid));
    const unsubReds = onSnapshot(q, (snapshot) => {
      setPendingIds(snapshot.docs.map(doc => doc.data().rewardId));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'redemptions'));

    return () => {
      unsubRewards();
      unsubReds();
    };
  }, [user?.familyId, user?.uid]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const redeem = async (r: any) => {
    if (!user?.familyId) return;
    if (user.points < r.cost) return showToast("Insufficient points!", "error");
    
    try {
      const redemptionsRef = collection(db, 'families', user.familyId, 'redemptions');
      await addDoc(redemptionsRef, { 
        rewardId: r.id, 
        kidId: user.uid, 
        kidName: user.name,
        rewardTitle: r.title,
        status: 'pending', 
        familyId: user.familyId, 
        cost: r.cost,
        timestamp: new Date().toISOString()
      });
      
      const notifsRef = collection(db, 'families', user.familyId, 'notifications');
      await addDoc(notifsRef, { 
        userId: 'ALL_PARENTS', 
        familyId: user.familyId, 
        message: `${user.name} wants to redeem: ${r.title}`, 
        type: 'reward_redeemed',
        read: false,
        timestamp: new Date().toISOString()
      });
      
      showToast("Sent to parents for approval!");
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'redemptions');
    }
  };

  const deleteReward = async () => {
    if (!deletingReward || !user?.familyId) return;
    const rewardRef = doc(db, 'families', user.familyId, 'rewards', deletingReward.id);
    try {
      await deleteDoc(rewardRef);
      setDeletingReward(null);
      showToast("Reward deleted", "info" as any);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, rewardRef.path);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 relative">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-8 left-1/2 -translate-x-1/2 z-[60] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10 ${toast.type === 'error' ? 'bg-red-600' : 'bg-[#1a1a1a]'}`}
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${toast.type === 'error' ? 'bg-red-400' : 'bg-amber-500'}`}>
              <Gift size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Rewards</h3>
        {user?.role === 'parent' && <button onClick={() => setShowModal(true)} className="text-blue-600 font-bold text-sm bg-blue-50 px-5 py-2.5 rounded-2xl border border-blue-100 hover:bg-blue-100 transition-all">+ Add Reward</button>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
        {rewards.map((r, i) => {
          const isPending = pendingIds.includes(r.id);
          const canAfford = user!.points >= r.cost;
          
          return (
            <div key={i} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col items-center text-center group transition-all hover:shadow-md relative overflow-hidden">
              {user?.role === 'parent' && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingReward(r);
                  }} 
                  className="absolute top-4 left-4 p-2 text-gray-300 hover:text-red-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 size={16} />
                </button>
              )}
              {!r.isRecurring && (
                <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
                  <span className="text-[10px] bg-red-50 text-red-500 px-2 py-1 rounded-lg font-black tracking-tighter uppercase">Limited</span>
                  {r.expiresAt && (
                    <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-1 rounded-lg font-bold uppercase">Expiring</span>
                  )}
                </div>
              )}
              <div className={`p-4 rounded-2xl mb-4 ${isPending ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-600'}`}>
                <Gift size={32} />
              </div>
              <h4 className="font-bold">{r.title}</h4>
              <span className="text-blue-600 font-bold text-sm mt-1 mb-4">{r.cost} pts</span>
              
              {user?.role === 'kid' && (
                <button 
                  onClick={() => redeem(r)} 
                  disabled={isPending || (!canAfford && !isPending)} 
                  className={`w-full p-4 rounded-2xl text-xs font-bold transition-all ${
                    isPending 
                      ? 'bg-amber-100 text-amber-600 cursor-default' 
                      : !canAfford 
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-100'
                  }`}
                >
                  {isPending ? 'Waiting for approval' : canAfford ? 'Redeem Now' : `Need ${r.cost - user!.points} more pts`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {showModal && <AddRewardModal onClose={() => { setShowModal(false); fetchData(); }} user={user} />}
      <AnimatePresence>
        {deletingReward && (
          <DeleteConfirmationModal 
            title="Delete Reward" 
            message={`Are you sure you want to delete "${deletingReward.title}"?`}
            onConfirm={deleteReward} 
            onCancel={() => setDeletingReward(null)} 
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AddRewardModal({ onClose, user }: any) {
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState(100);
  const [isRecurring, setIsRecurring] = useState(true);
  const [duration, setDuration] = useState<string>('none'); // none, 24h, 3d, 7d

  const submit = async (e: any) => {
    e.preventDefault();
    if (!user?.familyId) return;

    let expiresAt = null;
    if (duration !== 'none') {
      const now = new Date();
      if (duration === '24h') now.setHours(now.getHours() + 24);
      if (duration === '3d') now.setDate(now.getDate() + 3);
      if (duration === '7d') now.setDate(now.getDate() + 7);
      expiresAt = now.toISOString();
    }

    const rewardsRef = collection(db, 'families', user.familyId, 'rewards');
    const rewardData = { 
      title, 
      cost, 
      familyId: user.familyId, 
      createdBy: user.uid,
      isRecurring,
      expiresAt,
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(rewardsRef, rewardData);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, rewardsRef.path);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"><div className="absolute inset-0 bg-black/10 backdrop-blur-sm" onClick={onClose} />
      <motion.form initial={{ scale: 0.9 }} animate={{ scale: 1 }} onSubmit={submit} className="relative bg-white p-6 sm:p-8 rounded-[32px] w-full max-w-sm space-y-6">
        <h2 className="text-xl font-bold">New Reward</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-gray-400 ml-1">Reward Name</label>
            <input required type="text" placeholder="e.g. Extra Pizza" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-3 sm:p-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 transition-all font-bold text-base" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-gray-400 ml-1">Point Cost</label>
            <input required type="number" value={cost} onChange={(e) => setCost(parseInt(e.target.value))} className="w-full p-3 sm:p-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 transition-all font-bold text-base" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button"
              onClick={() => setIsRecurring(!isRecurring)}
              className="flex flex-col items-center justify-center p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all group gap-2"
            >
              <div className="text-xs font-black uppercase text-gray-400">Behavior</div>
              <div className="text-sm font-bold text-gray-900">{isRecurring ? 'Recurring' : 'One-Time'}</div>
              <div className={`w-8 h-4 rounded-full transition-all relative ${isRecurring ? 'bg-blue-600' : 'bg-gray-200'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isRecurring ? 'left-4.5' : 'left-0.5'}`} />
              </div>
            </button>

            <div className="p-4 bg-gray-50 rounded-2xl flex flex-col items-center justify-center gap-2">
              <div className="text-xs font-black uppercase text-gray-400">Duration</div>
              <select 
                value={duration} 
                onChange={(e) => setDuration(e.target.value)}
                className="text-sm font-bold bg-transparent outline-none cursor-pointer text-blue-600 appearance-none text-center w-full"
              >
                <option value="none">No Limit</option>
                <option value="24h">24 Hours</option>
                <option value="3d">3 Days</option>
                <option value="7d">1 Week</option>
              </select>
            </div>
          </div>
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all active:scale-95">Save Reward</button>
      </motion.form>
    </div>
  );
}

function SharedGoalsView() {
  const { user, refreshUser } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [contributingGoal, setContributingGoal] = useState<any | null>(null);
  const [amount, setAmount] = useState(10);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<any | null>(null);

  useEffect(() => {
    if (!user?.familyId) return;
    const goalsRef = collection(db, 'families', user.familyId, 'shared-goals');
    const unsub = onSnapshot(goalsRef, (snapshot) => {
      setGoals(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'shared-goals'));
    return () => unsub();
  }, [user?.familyId]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const manageContribution = async (goal: any) => {
    if (user?.role !== 'kid') return;
    setContributingGoal(goal);
  };

  const handleContribute = async () => {
    if (!contributingGoal || !user?.familyId) return;
    if (user.points < amount) return showToast("Insufficient points!", "error");

    try {
      const batch = writeBatch(db);
      const userRef = doc(db, 'families', user.familyId, 'users', user.uid);
      const goalRef = doc(db, 'families', user.familyId, 'shared-goals', contributingGoal.id);
      
      batch.update(userRef, { points: increment(-amount) });
      batch.update(goalRef, { 
        currentPoints: increment(amount),
        [`contributors.${user.uid}`]: increment(amount) 
      });

      await batch.commit();
      
      showToast(`Chipped in ${amount} pts!`);
      setContributingGoal(null);
      refreshUser();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'shared-goals');
    }
  };

  const deleteGoal = async () => {
    if (!deletingGoal || !user?.familyId) return;
    const goalRef = doc(db, 'families', user.familyId, 'shared-goals', deletingGoal.id);
    try {
      await deleteDoc(goalRef);
      setDeletingGoal(null);
      showToast("Goal removed", "info" as any);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, goalRef.path);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 relative">
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className={`fixed top-8 left-1/2 -translate-x-1/2 z-[60] text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/10 ${toast.type === 'error' ? 'bg-red-600' : 'bg-[#1a1a1a]'}`}
          >
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${toast.type === 'error' ? 'bg-red-400' : 'bg-blue-600'}`}>
              <Target size={14} className="text-white" />
            </div>
            <span className="text-sm font-bold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center">
        <h3 className="text-xl font-bold">Family Goals</h3>
        {user?.role === 'parent' && <button onClick={() => setShowModal(true)} className="text-blue-600 font-bold text-sm bg-blue-50 px-5 py-2.5 rounded-2xl border border-blue-100 hover:bg-blue-100 transition-all">+ New Goal</button>}
      </div>

      {goals.length === 0 ? (
        <div className="bg-white p-12 rounded-[40px] border border-dashed border-gray-100 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-gray-50 text-gray-300 rounded-3xl flex items-center justify-center mb-4">
            <Target size={32} />
          </div>
          <h4 className="font-bold text-gray-900">No collective goals yet</h4>
          <p className="text-sm text-gray-400 mt-1">Parents can create a big goal for the whole family.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {goals.map((g, i) => {
            const progress = (g.currentPoints / g.cost) * 100;
            const isCompleted = g.status === 'completed';
            
            return (
              <div key={i} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col group relative overflow-hidden">
                {user?.role === 'parent' && (
                  <button 
                    onClick={() => setDeletingGoal(g)}
                    className="absolute top-4 left-4 p-2 text-gray-200 hover:text-red-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isCompleted ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                    {isCompleted ? <Trophy size={24} /> : <Target size={24} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-gray-900 truncate">{g.title}</h4>
                    <div className="text-[10px] text-gray-400 font-black uppercase tracking-wider">{isCompleted ? 'Goal Reached!' : 'Collective Effort'}</div>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  <div className="flex justify-between items-end">
                    <div className="text-xs font-bold text-gray-900">{g.currentPoints} <span className="text-gray-400 font-medium">/ {g.cost} pts</span></div>
                    <div className="text-xs font-bold text-blue-600">{Math.round(progress)}%</div>
                  </div>
                  <div className="w-full h-3 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                    <motion.div 
                      initial={{ width: 0 }} 
                      animate={{ width: `${Math.min(100, progress)}%` }} 
                      className={`h-full ${isCompleted ? 'bg-green-500 shadow-lg shadow-green-100' : 'bg-blue-600 shadow-lg shadow-blue-100'}`} 
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar">
                  {Object.entries(g.contributors).length > 0 ? (
                    Object.entries(g.contributors).map(([uid, pts]: any) => (
                      <div key={uid} className="px-3 py-1.5 bg-gray-50 rounded-xl text-[10px] font-bold flex items-center gap-2 shrink-0">
                        <div className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-[8px] font-black">{pts}</div>
                        <span>Contributor</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-[10px] text-gray-400 italic">No contributions yet</div>
                  )}
                </div>

                {user?.role === 'kid' && !isCompleted && (
                  <button 
                    onClick={() => manageContribution(g)}
                    className="w-full p-4 bg-blue-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <HandCoins size={14} /> Contribute Points
                  </button>
                )}
                
                {isCompleted && (
                  <div className="w-full p-4 bg-green-50 text-green-600 rounded-2xl font-bold text-xs text-center border border-green-100">
                    🎉 Enjoy your reward!
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* --- Contribution Modal --- */}
      <AnimatePresence>
        {contributingGoal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/10 backdrop-blur-md" onClick={() => setContributingGoal(null)} />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white p-6 sm:p-8 rounded-[40px] w-full max-w-sm shadow-2xl space-y-6"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <HandCoins size={32} />
                </div>
                <h2 className="text-xl font-bold">Chip In</h2>
                <p className="text-sm text-gray-500 mt-2">How many points do you want to contribute to <b>{contributingGoal.title}</b>?</p>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setAmount(Math.max(10, amount - 10))} className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center font-bold hover:bg-gray-100 transition-all">-10</button>
                <div className="text-3xl font-black text-blue-600">{amount}</div>
                <button onClick={() => setAmount(amount + 10)} className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center font-bold hover:bg-gray-100 transition-all">+10</button>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setContributingGoal(null)} className="flex-1 p-4 bg-gray-50 text-gray-500 rounded-2xl font-bold text-sm">Cancel</button>
                <button onClick={handleContribute} className="flex-1 p-4 bg-blue-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-blue-100">Contribute</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingGoal && (
          <DeleteConfirmationModal 
            title="Remove Goal" 
            message={`Delete the family goal "${deletingGoal.title}"? Contributions will not be refunded.`}
            onConfirm={deleteGoal} 
            onCancel={() => setDeletingGoal(null)} 
          />
        )}
      </AnimatePresence>

      {showModal && <AddSharedGoalModal onClose={() => { setShowModal(false); fetchData(); }} user={user} />}
    </motion.div>
  );
}

function AddSharedGoalModal({ onClose, user }: any) {
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState(500);

  const submit = async (e: any) => {
    e.preventDefault();
    if (!user?.familyId) return;

    const goalsRef = collection(db, 'families', user.familyId, 'shared-goals');
    const goalData = { 
      title, 
      cost, 
      currentPoints: 0, 
      familyId: user.familyId,
      contributors: {},
      status: 'active',
      createdAt: new Date().toISOString()
    };
    try {
      await addDoc(goalsRef, goalData);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, goalsRef.path);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/10 backdrop-blur-md" onClick={onClose} />
      <motion.form 
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        onSubmit={submit} 
        className="relative bg-white p-8 rounded-[40px] w-full max-w-sm shadow-2xl space-y-6"
      >
        <h2 className="text-xl font-bold">New Family Goal</h2>
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-gray-400 ml-1">Goal Title</label>
            <input required type="text" placeholder="e.g. Movie Night" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 font-bold text-base" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-black uppercase text-gray-400 ml-1">Point Cost</label>
            <input required type="number" value={cost} onChange={(e) => setCost(parseInt(e.target.value))} className="w-full p-4 bg-gray-50 rounded-2xl outline-none focus:ring-2 focus:ring-blue-100 font-black text-xl" />
          </div>
        </div>
        <button type="submit" className="w-full p-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95">Set Family Goal</button>
      </motion.form>
    </div>
  );
}

function DeleteConfirmationModal({ title, message, onConfirm, onCancel }: any) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/10 backdrop-blur-md" onClick={onCancel} />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-white p-8 rounded-[40px] w-full max-w-sm shadow-2xl space-y-6 text-center border border-gray-100"
      >
        <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Trash2 size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-gray-500 mt-2">{message}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 p-4 bg-gray-50 text-gray-500 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-all">Cancel</button>
          <button onClick={onConfirm} className="flex-1 p-4 bg-red-500 text-white rounded-2xl font-bold text-sm hover:bg-red-600 shadow-lg shadow-red-100 transition-all active:scale-95">Delete</button>
        </div>
      </motion.div>
    </div>
  );
}

function ApprovalsView({ onAction }: any) {
  const { user, refreshUser } = useAuth();
  const [completions, setCompletions] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.familyId) return;
    const familiesRef = doc(db, 'families', user.familyId);
    
    const compsRef = collection(familiesRef, 'completions');
    const unsubComps = onSnapshot(query(compsRef, where('status', '==', 'pending')), (snapshot) => {
      setCompletions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'completions'));

    const redsRef = collection(familiesRef, 'redemptions');
    const unsubReds = onSnapshot(query(redsRef, where('status', '==', 'pending')), (snapshot) => {
      setRedemptions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'redemptions'));

    return () => {
      unsubComps();
      unsubReds();
    };
  }, [user?.familyId]);

  const act = async (collectionName: string, item: any, action: 'approved' | 'rejected') => {
    if (!user?.familyId) return;
    const batch = writeBatch(db);
    const itemRef = doc(db, 'families', user.familyId, collectionName, item.id);
    const kidRef = doc(db, 'families', user.familyId, 'users', item.kidId);
    
    batch.update(itemRef, { status: action });
    
    if (action === 'approved') {
      if (collectionName === 'completions') {
        batch.update(kidRef, { points: increment(item.pointsAwarded) });
      } else if (collectionName === 'redemptions') {
        batch.update(kidRef, { points: increment(-item.cost) });
      }
    }

    try {
      await batch.commit();
      
      const notifsRef = collection(db, 'families', user.familyId, 'notifications');
      let message = "";
      let type = "";
      
      if (collectionName === 'completions') {
        message = action === 'approved' ? `Bravo! Points awarded for ${item.choreTitle}!` : `Sorry, your completion of ${item.choreTitle} wasn't approved.`;
        type = action === 'approved' ? 'chore_approved' : 'chore_rejected';
      } else {
        message = action === 'approved' ? `Enjoy your reward: ${item.rewardTitle}!` : `Sorry, your redemption of ${item.rewardTitle} was rejected.`;
        type = action === 'approved' ? 'reward_approved' : 'reward_rejected';
      }

      await addDoc(notifsRef, { 
        userId: item.kidId,
        familyId: user.familyId,
        message,
        type,
        read: false,
        timestamp: new Date().toISOString()
      });
      
      onAction();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, collectionName);
    }
  };

  if (completions.length === 0 && redemptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-[32px] border border-dashed border-gray-200">
        <div className="w-12 h-12 bg-gray-50 text-gray-300 rounded-2xl flex items-center justify-center mb-4">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="font-bold text-gray-900">All clear!</h3>
        <p className="text-sm text-gray-400">No pending approvals at the moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {completions.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2"><Clock size={12} /> Pending Chores</h3>
          <div className="space-y-3">
            {completions.map((c, i) => (
              <div key={i} className="bg-white p-5 rounded-[24px] border border-gray-100 flex justify-between items-center shadow-sm hover:shadow-md transition-all">
                <div className="min-w-0">
                  <div className="text-[10px] font-black text-blue-600 uppercase tracking-wider mb-1">{c.kidName || 'Kid'} done:</div>
                  <div className="text-sm font-bold truncate">{c.choreTitle || 'Completed Chore'}</div>
                  <div className="text-[10px] text-gray-400 font-bold mt-0.5">WORTH {c.pointsAwarded} PTS</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => act('completions', c.id, 'rejected')} className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl text-red-500 hover:bg-red-50 transition-colors"><X size={18} /></button>
                  <button onClick={() => act('completions', c.id, 'approved')} className="w-10 h-10 flex items-center justify-center bg-blue-600 rounded-xl text-white hover:bg-blue-700 shadow-lg shadow-blue-100 transition-colors"><CheckCircle2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {redemptions.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-sm font-black uppercase text-gray-400 tracking-widest flex items-center gap-2"><Trophy size={12} /> Pending Rewards</h3>
          <div className="space-y-3">
            {redemptions.map((r, i) => (
              <div key={i} className="bg-white p-5 rounded-[24px] border border-gray-100 flex justify-between items-center shadow-sm hover:shadow-md transition-all">
                <div className="min-w-0">
                  <div className="text-[10px] font-black text-amber-500 uppercase tracking-wider mb-1">{r.kidName || 'Kid'} wants:</div>
                  <div className="text-sm font-bold truncate">{r.rewardTitle || 'Reward Redemption'}</div>
                  <div className="text-[10px] text-gray-400 font-bold mt-0.5">COSTS {r.cost} PTS</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => act('redemptions', r.id, 'rejected')} className="w-10 h-10 flex items-center justify-center bg-gray-50 rounded-xl text-red-500 hover:bg-red-50 transition-colors"><X size={18} /></button>
                  <button onClick={() => act('redemptions', r.id, 'approved')} className="w-10 h-10 flex items-center justify-center bg-amber-500 rounded-xl text-white hover:bg-amber-600 shadow-lg shadow-amber-100 transition-colors"><CheckCircle2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const DICEBEAR_STYLES = [
  { id: 'avataaars', name: 'Human' },
  { id: 'bottts', name: 'Robot' },
  { id: 'lorelei', name: 'Cute' },
  { id: 'adventurer', name: 'Simple' },
  { id: 'pixel-art', name: 'Pixel' },
  { id: 'fun-emoji', name: 'Emoji' },
];

const STYLE_CUSTOMIZATIONS: any = {
  avataaars: {
    eyes: { type: 'shape', param: 'eyes', options: ['default', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'wink', 'winkWacky'] },
    eyebrows: { type: 'shape', param: 'eyebrows', options: ['default', 'angry', 'angryNatural', 'defaultNatural', 'flatNatural', 'raisedExcited', 'sadConcerned', 'unibrowNatural', 'upLoud'] },
    mouth: { type: 'shape', param: 'mouth', options: ['default', 'concerned', 'disbelief', 'eating', 'grimace', 'sad', 'screamOpen', 'serious', 'smile', 'tongue', 'twinkle'] },
    skin: { type: 'color', param: 'skinColor', options: ['614335', 'ae5d29', 'd08b5b', 'edb98a', 'f8d25c', 'fd9841', 'ffdbb4'] },
    hairColor: { type: 'color', param: 'hairColor', options: ['2c1b18', '4a312c', '724130', 'a55728', 'b58143', 'c93305', 'd6b370', 'e8e1e1', 'f59797', 'ecdcbf'] },
  },
  lorelei: {
    eyes: { type: 'shape', param: 'eyes', options: ['variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06', 'variant07', 'variant08', 'variant09', 'variant10'] },
    eyebrows: { type: 'shape', param: 'eyebrows', options: ['variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06', 'variant07'] },
    mouth: { type: 'shape', param: 'mouth', options: ['variant01', 'variant02', 'variant03', 'variant04', 'variant05', 'variant06', 'variant07', 'variant08'] },
    skin: { type: 'color', param: 'bodyColor', options: ['d08b5b', 'ae5d29', '614335', 'f8d25c', 'fd9841', 'ffdbb4', 'edb98a'] },
    hairColor: { type: 'color', param: 'hairColor', options: ['2c1b18', '4a312c', '724130', 'a55728', 'b58143', 'c93305', 'd6b370', 'e8e1e1', 'f59797', 'ecdcbf'] },
  },
  bottts: {
    eyes: { type: 'shape', param: 'eyes', options: ['round', 'roundSide', 'square', 'squareSide', 'bulging', 'dizzy', 'glow', 'robocop', 'sensor'] },
    mouth: { type: 'shape', param: 'mouth', options: ['bite', 'smile', 'square01', 'square02'] },
    faceColor: { type: 'color', param: 'faceColor', options: ['929598', 'd1d4f9', 'c0aede', 'ffd5dc', 'ffdfbf'] },
    eyesColor: { type: 'color', param: 'eyesColor', options: ['000000', 'ffd5dc', 'ffdfbf', 'c0aede'] }
  }
};

const PRESET_COLORS = [
  '#f8fafc', '#fee2e2', '#fef3c7', '#ecfdf5', '#eff6ff', 
  '#faf5ff', '#fff1f2', '#1e293b', '#475569', '#be123c',
  '#15803d', '#1d4ed8', '#7e22ce', '#a21caf', '#b91c1c'
];

const PRESET_GRADIENTS = [
  'b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'
];

function AvatarCustomizer({ initialUrl, onSave, onCancel }: { initialUrl?: string, onSave: (url: string) => void, onCancel?: () => void }) {
  const [style, setStyle] = useState(() => {
    if (!initialUrl) return DICEBEAR_STYLES[0].id;
    try {
      const url = new URL(initialUrl);
      const parts = url.pathname.split('/');
      return parts[2]?.replace('.svg', '') || DICEBEAR_STYLES[0].id;
    } catch {
      return DICEBEAR_STYLES[0].id;
    }
  });
  
  const [seed, setSeed] = useState(() => {
    if (!initialUrl) return Math.random().toString(36).substring(7);
    try {
      const url = new URL(initialUrl);
      return url.searchParams.get('seed') || Math.random().toString(36).substring(7);
    } catch {
      return Math.random().toString(36).substring(7);
    }
  });

  const [bgColor, setBgColor] = useState(() => {
    if (!initialUrl) return 'b6e3f4';
    try {
      const url = new URL(initialUrl);
      return url.searchParams.get('backgroundColor') || 'b6e3f4';
    } catch { return 'b6e3f4'; }
  });

  const [bgType, setBgType] = useState(() => {
    if (!initialUrl) return 'solid';
    try {
      const url = new URL(initialUrl);
      return url.searchParams.get('backgroundType') || 'solid';
    } catch { return 'solid'; }
  });

  const [radius, setRadius] = useState(() => {
    if (!initialUrl) return 0;
    try {
      const url = new URL(initialUrl);
      return parseInt(url.searchParams.get('radius') || '0');
    } catch { return 0; }
  });

  const [scale, setScale] = useState(() => {
    if (!initialUrl) return 100;
    try {
      const url = new URL(initialUrl);
      return parseInt(url.searchParams.get('scale') || '100');
    } catch { return 100; }
  });

  const [flip, setFlip] = useState(() => {
    if (!initialUrl) return false;
    try {
      const url = new URL(initialUrl);
      return url.searchParams.get('flip') === 'true';
    } catch { return false; }
  });

  // Deep Customization State
  const [customColors, setCustomColors] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (initialUrl) {
      try {
        const url = new URL(initialUrl);
        url.searchParams.forEach((val, key) => {
          // Exclude standard params that have their own state
          const systemParams = ['seed', 'backgroundColor', 'backgroundType', 'radius', 'scale', 'flip'];
          if (!systemParams.includes(key)) {
            initial[key] = val;
          }
        });
      } catch {}
    }
    return initial;
  });

  const prevStyle = React.useRef(style);
  useEffect(() => {
    // Only reset custom colors when style ACTUALLY changes after first mount
    if (prevStyle.current !== style) {
      setCustomColors({});
      prevStyle.current = style;
    }
  }, [style]);

  const avatarUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set('seed', seed);
    params.set('backgroundColor', bgColor.replace('#', ''));
    params.set('backgroundType', bgType);
    params.set('radius', radius.toString());
    params.set('scale', scale.toString());
    params.set('flip', flip.toString());
    
    Object.entries(customColors).forEach(([key, val]) => {
      params.set(key, val as string);
    });

    return `https://api.dicebear.com/7.x/${style}/svg?${params.toString()}`;
  }, [style, seed, bgColor, bgType, radius, scale, flip, customColors]);

  const customization = STYLE_CUSTOMIZATIONS[style];

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center sticky top-0 bg-white z-10 pb-6 shadow-[0_20px_20px_-20px_rgba(0,0,0,0.05)]">
        <div className="relative group">
          <div className="w-44 h-44 rounded-[56px] bg-white border-4 border-white shadow-2xl overflow-hidden relative">
            <img 
              key={avatarUrl} 
              src={avatarUrl} 
              alt="Preview" 
              className="w-full h-full object-cover transition-opacity duration-300" 
            />
            <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-all" />
          </div>
          <button 
            onClick={() => {
              setSeed(Math.random().toString(36).substring(7));
              setCustomColors({});
            }}
            className="absolute -bottom-2 -right-2 w-14 h-14 bg-white text-blue-600 rounded-3xl flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition-all border border-gray-100"
          >
            <Shuffle size={24} />
          </button>
        </div>
      </div>

      <div className="space-y-8 pb-32">
        <div>
          <label className="text-xs font-black uppercase text-gray-400 ml-1 mb-4 block tracking-widest">Base Style</label>
          <div className="grid grid-cols-3 gap-3">
            {DICEBEAR_STYLES.map(s => (
              <button 
                key={s.id}
                onClick={() => setStyle(s.id)}
                className={`p-4 rounded-3xl border-2 text-sm font-bold uppercase tracking-tight transition-all ${style === s.id ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md' : 'border-gray-50 bg-gray-50/50 text-gray-400 hover:border-gray-200'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* --- Pro Details (Eyes, Mouth, Skin, Hair, etc) --- */}
        {customization && (
          <div className="space-y-8 bg-blue-50/40 p-8 rounded-[48px] border border-blue-100/30">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">
                <Palette size={16} />
              </div>
              <span className="text-xs font-black uppercase text-blue-700 tracking-widest">Character Customizer</span>
            </div>
            
            {Object.entries(customization).map(([label, config]: [string, any]) => (
              <div key={label} className="space-y-4">
                <div className="flex items-center justify-between px-1">
                  <div className="text-[11px] font-black uppercase text-gray-400 tracking-wider capitalize">{label} Treatment</div>
                  <button 
                    onClick={() => {
                      const next = { ...customColors };
                      delete next[config.param];
                      setCustomColors(next);
                    }}
                    className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full transition-all ${!customColors[config.param] ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-300 hover:text-gray-400 border border-gray-100'}`}
                  >
                    Automatic
                  </button>
                </div>

                {config.type === 'color' ? (
                  <div className="flex flex-wrap gap-3">
                    {config.options.map((option: string) => (
                      <button 
                        key={option}
                        onClick={() => setCustomColors(prev => ({ ...prev, [config.param]: option }))}
                        className={`w-9 h-9 rounded-full border-4 transition-transform hover:scale-110 active:scale-95 ${customColors[config.param] === option ? 'border-blue-600 scale-110 shadow-xl ring-4 ring-blue-100' : 'border-white shadow-sm'}`}
                        style={{ backgroundColor: `#${option}` }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {config.options.map((option: string) => (
                      <button 
                        key={option}
                        onClick={() => setCustomColors(prev => ({ ...prev, [config.param]: option }))}
                        className={`px-3 py-3 rounded-2xl border-2 text-[11px] font-bold truncate transition-all ${customColors[config.param] === option ? 'border-blue-600 bg-white text-blue-700 shadow-md scale-[1.02]' : 'border-transparent bg-white/50 text-gray-400 hover:border-gray-100'}`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="space-y-6 bg-gray-50/50 p-8 rounded-[48px] border border-gray-100">
          <div className="flex items-center justify-between px-1">
            <label className="text-xs font-black uppercase text-gray-400 tracking-widest">Backdrop Style</label>
            <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm">
              <button 
                onClick={() => setBgType('solid')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${bgType === 'solid' ? 'bg-blue-600 text-white shadow-xl' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                Solid
              </button>
              <button 
                onClick={() => setBgType('gradientLinear')}
                className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase transition-all ${bgType === 'gradientLinear' ? 'bg-blue-600 text-white shadow-xl' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                Gradient
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            {(bgType === 'solid' ? PRESET_COLORS : PRESET_GRADIENTS).map(c => (
              <button 
                key={c}
                onClick={() => setBgColor(c)}
                style={{ background: bgType === 'solid' ? (c.startsWith('#') ? c : `#${c}`) : `linear-gradient(to bottom, #${c}, #ffffff)` }}
                className={`w-9 h-9 rounded-full border-4 transition-transform hover:scale-120 active:scale-95 ${bgColor === c ? 'border-blue-600 scale-120 shadow-2xl z-10' : 'border-white shadow-sm'}`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50/50 p-6 rounded-[32px] border border-gray-100">
            <label className="text-xs font-black uppercase text-gray-400 tracking-widest block mb-4">Portrait Scale: {scale}%</label>
            <input 
              type="range" min="60" max="100" step="5" 
              value={scale} onChange={(e) => setScale(parseInt(e.target.value))} 
              className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
            />
          </div>
          <div className="bg-gray-50/50 p-6 rounded-[32px] border border-gray-100">
            <label className="text-xs font-black uppercase text-gray-400 tracking-widest block mb-4">Corner Polish: {radius}</label>
            <input 
              type="range" min="0" max="50" step="5" 
              value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} 
              className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-6 bg-gray-50/50 rounded-[32px] border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl border border-gray-100 text-gray-400">
              <RefreshCw size={18} />
            </div>
            <span className="text-xs font-black uppercase text-gray-400 tracking-widest">Flip Portrait</span>
          </div>
          <button 
            onClick={() => setFlip(!flip)}
            className={`w-16 h-8 rounded-full transition-all relative shadow-inner ${flip ? 'bg-blue-600' : 'bg-gray-200'}`}
          >
            <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${flip ? 'left-9' : 'left-1'}`} />
          </button>
        </div>

        <div>
          <label className="text-xs font-black uppercase text-gray-400 ml-1 mb-3 block tracking-widest">Random Seed Reference</label>
          <div className="relative">
            <input 
              type="text" 
              value={seed} 
              onChange={(e) => setSeed(e.target.value)}
              className="w-full p-5 bg-gray-50 border border-gray-100 rounded-[32px] outline-none focus:ring-4 focus:ring-blue-100 transition-all font-mono text-base pr-14 focus:bg-white focus:border-blue-200"
              placeholder="Name your character..."
            />
            <div className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-300">
              <Shuffle size={20} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 p-8 sticky bottom-0 bg-white/95 backdrop-blur-xl border-t border-gray-100 z-20 -mx-8 -mb-8 rounded-t-[48px] shadow-[0_-20px_40px_rgba(0,0,0,0.03)]">
        {onCancel && (
          <button 
            onClick={onCancel} 
            className="flex-1 p-5 bg-gray-50 border border-gray-100 rounded-3xl font-black text-xs uppercase tracking-widest text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all active:scale-95"
          >
            Go Back
          </button>
        )}
        <button 
          onClick={() => onSave(avatarUrl)} 
          className="flex-[2] p-5 bg-blue-600 text-white rounded-3xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-200 hover:bg-blue-700 hover:scale-105 transition-all active:scale-95 flex items-center justify-center gap-3"
        >
          <CircleCheck size={20} /> Save Changes
        </button>
      </div>
    </div>
  );
}

function AvatarModal({ user, onClose, onRefresh }: { user: FamilyUser, onClose: () => void, onRefresh: () => void }) {
  const handleSave = async (avatarUrl: string) => {
    if (!user?.familyId) return;
    const userRef = doc(db, 'families', user.familyId, 'users', user.uid);
    try {
      await updateDoc(userRef, { avatarUrl });
      const updatedUser = { ...user, avatarUrl };
      localStorage.setItem('family_points_user', JSON.stringify(updatedUser));
      onRefresh();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, userRef.path);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/10 backdrop-blur-md" onClick={onClose} />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative bg-white p-6 sm:p-8 rounded-[40px] w-full max-w-sm shadow-2xl space-y-6 border border-gray-100"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><UserIcon size={20} /></div>
            <h2 className="text-xl font-bold">Customize Avatar</h2>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-50 rounded-full transition-colors"><X size={20} /></button>
        </div>
        
        <AvatarCustomizer initialUrl={user.avatarUrl} onSave={handleSave} />
      </motion.div>
    </div>
  );
}
