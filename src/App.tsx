/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Calendar, 
  Clock, 
  History, 
  Settings, 
  LogOut, 
  User, 
  CheckCircle2, 
  XCircle, 
  Monitor,
  ChevronRight,
  Plus,
  Trash2,
  Menu,
  X,
  ShieldCheck
} from 'lucide-react';
import { useAuthStore } from './store';
import { cn, formatTime } from './utils';
import { format, addHours, parse, isAfter, isBefore, startOfDay } from 'date-fns';

// --- Components ---

const Button = ({ className, variant = 'primary', ...props }: any) => {
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100'
  };
  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant as keyof typeof variants],
        className
      )}
      {...props}
    />
  );
};

const Input = ({ label, error, ...props }: any) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
    <input 
      className={cn(
        "w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all",
        error && "border-red-500 focus:ring-red-500/20"
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

const Card = ({ children, className }: any) => (
  <div className={cn("bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden", className)}>
    {children}
  </div>
);

// --- Auth Pages ---

const AuthPage = ({ type }: { type: 'login' | 'register' }) => {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAuthStore(state => state.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/auth/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAuth(data.user, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <Card className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Monitor size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {type === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-gray-500 mt-2">
              {type === 'login' ? 'Login to book your lab slot' : 'Join our computer lab community'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {type === 'register' && (
              <Input 
                label="Full Name" 
                placeholder="John Doe"
                value={formData.name}
                onChange={(e: any) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            )}
            <Input 
              label="Email Address" 
              type="email" 
              placeholder="john@example.com"
              value={formData.email}
              onChange={(e: any) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <Input 
              label="Password" 
              type="password" 
              placeholder="••••••••"
              value={formData.password}
              onChange={(e: any) => setFormData({ ...formData, password: e.target.value })}
              required
            />
            {error && <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>}
            <Button className="w-full py-3" type="submit" disabled={loading}>
              {loading ? 'Processing...' : type === 'login' ? 'Sign In' : 'Sign Up'}
            </Button>
          </form>

          <p className="text-center mt-6 text-sm text-gray-500">
            {type === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button 
              onClick={() => window.location.hash = type === 'login' ? '#register' : '#login'}
              className="text-indigo-600 font-semibold hover:underline"
            >
              {type === 'login' ? 'Register' : 'Login'}
            </button>
          </p>
        </Card>
      </motion.div>
    </div>
  );
};

// --- Main App ---

const Dashboard = () => {
  const { user, token, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState('book');
  const [bookings, setBookings] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any>({ bookings: [], config: {} });
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDuration, setSelectedDuration] = useState(2);
  const [selectedStartTime, setSelectedStartTime] = useState('');
  const [studentName, setStudentName] = useState(user?.name || '');
  const [phone, setPhone] = useState('');
  const [selectedSystem, setSelectedSystem] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchMyBookings = async () => {
    const res = await fetch('/api/bookings/my', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setBookings(data);
  };

  const fetchAvailability = async () => {
    const res = await fetch(`/api/bookings/availability?date=${selectedDate}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    setAvailability(data);
  };

  useEffect(() => {
    if (activeTab === 'history') fetchMyBookings();
    if (activeTab === 'book') fetchAvailability();
  }, [activeTab, selectedDate]);

  const handleBooking = async () => {
    if (!selectedStartTime) return;
    setLoading(true);
    setMessage(null);
    
    const start = parse(selectedStartTime, 'HH:mm', new Date());
    const end = format(addHours(start, selectedDuration), 'HH:mm');

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date: selectedDate,
          start_time: selectedStartTime,
          end_time: end,
          duration: selectedDuration,
          student_name: studentName,
          phone: phone,
          system_number: selectedSystem
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setMessage({ type: 'success', text: `Booking confirmed! System #${data.system_number} reserved.` });
      fetchAvailability();
      setSelectedStartTime('');
      setSelectedSystem(null);
      setPhone('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const generateTimeSlots = () => {
    const slots = [];
    const open = availability.config.lab_open_time || '09:00';
    const close = availability.config.lab_close_time || '18:00';
    const totalSystems = parseInt(availability.config.total_systems || '10');

    let current = parse(open, 'HH:mm', new Date());
    const endLimit = parse(close, 'HH:mm', new Date());

    while (isBefore(addHours(current, selectedDuration), addHours(endLimit, 0.01))) {
      const timeStr = format(current, 'HH:mm');
      const endTimeStr = format(addHours(current, selectedDuration), 'HH:mm');
      
      // Count overlaps
      const overlaps = availability.bookings.filter((b: any) => {
        return (b.start_time < endTimeStr) && (b.end_time > timeStr);
      }).length;

      slots.push({
        time: timeStr,
        available: totalSystems - overlaps,
        total: totalSystems
      });
      current = addHours(current, 1);
    }
    return slots;
  };

  const navItems = [
    { id: 'book', label: 'Book Slot', icon: Calendar },
    { id: 'history', label: 'My History', icon: History },
    ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin Panel', icon: ShieldCheck }] : [])
  ];

  if (activeTab === 'admin' && user?.role === 'admin') {
    return <AdminPanel onBack={() => setActiveTab('book')} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col p-6">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
            <Monitor size={20} />
          </div>
          <span className="font-bold text-xl tracking-tight">LabBook</span>
        </div>

        <nav className="flex-1 space-y-2">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                activeTab === item.id 
                  ? "bg-indigo-50 text-indigo-600 font-semibold" 
                  : "text-gray-500 hover:bg-gray-50"
              )}
            >
              <item.icon size={20} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="pt-6 border-t border-gray-100">
          <div className="flex items-center gap-3 px-2 mb-4">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
              <User size={20} className="text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{user?.name}</p>
              <p className="text-xs text-gray-500 truncate">{user?.role}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-red-600 hover:bg-red-50" onClick={logout}>
            <LogOut size={20} />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden bg-white border-b border-gray-200 p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 text-white rounded-lg flex items-center justify-center">
            <Monitor size={16} />
          </div>
          <span className="font-bold text-lg">LabBook</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-500">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed inset-0 top-[65px] bg-white z-40 p-6 flex flex-col"
          >
            <nav className="space-y-4 flex-1">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-4 px-6 py-4 rounded-2xl text-lg transition-all",
                    activeTab === item.id 
                      ? "bg-indigo-50 text-indigo-600 font-bold" 
                      : "text-gray-500"
                  )}
                >
                  <item.icon size={24} />
                  {item.label}
                </button>
              ))}
            </nav>
            <Button variant="danger" className="w-full py-4 text-lg" onClick={logout}>
              <LogOut size={24} />
              Sign Out
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-10 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <header className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900">
              {activeTab === 'book' ? 'Book a Lab Slot' : 'Your Booking History'}
            </h2>
            <p className="text-gray-500 mt-1">
              {activeTab === 'book' 
                ? 'Select a date and duration to see available timings.' 
                : 'View and manage your previous lab sessions.'}
            </p>
          </header>

          {activeTab === 'book' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Controls */}
              <div className="lg:col-span-1 space-y-6">
                <Card className="p-6">
                  <h3 className="font-bold mb-4 flex items-center gap-2">
                    <Calendar size={18} className="text-indigo-600" />
                    Reservation Details
                  </h3>
                  <div className="space-y-4">
                    <Input 
                      label="Select Date" 
                      type="date" 
                      min={format(new Date(), 'yyyy-MM-dd')}
                      value={selectedDate}
                      onChange={(e: any) => setSelectedDate(e.target.value)}
                    />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Duration</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[2, 3, 4].map(h => (
                          <button
                            key={h}
                            onClick={() => { setSelectedDuration(h); setSelectedStartTime(''); setSelectedSystem(null); }}
                            className={cn(
                              "py-2 rounded-xl border text-sm font-semibold transition-all",
                              selectedDuration === h 
                                ? "bg-indigo-600 border-indigo-600 text-white" 
                                : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
                            )}
                          >
                            {h}h
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {selectedStartTime && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <Card className="p-6 space-y-4">
                      <h3 className="font-bold flex items-center gap-2">
                        <User size={18} className="text-indigo-600" />
                        Student Details
                      </h3>
                      <Input 
                        label="Student Name" 
                        value={studentName}
                        onChange={(e: any) => setStudentName(e.target.value)}
                        placeholder="Enter student name"
                      />
                      <Input 
                        label="Phone Number" 
                        value={phone}
                        onChange={(e: any) => setPhone(e.target.value)}
                        placeholder="Enter phone number"
                      />
                      
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Select PC Number</label>
                        <div className="grid grid-cols-5 gap-2">
                          {Array.from({ length: parseInt(availability.config.total_systems || '10') }, (_, i) => i + 1).map(num => {
                            const isBooked = availability.bookings.some((b: any) => {
                              const start = selectedStartTime;
                              const end = format(addHours(parse(selectedStartTime, 'HH:mm', new Date()), selectedDuration), 'HH:mm');
                              return b.system_number === num && (b.start_time < end) && (b.end_time > start);
                            });
                            return (
                              <button
                                key={num}
                                disabled={isBooked}
                                onClick={() => setSelectedSystem(num)}
                                className={cn(
                                  "aspect-square rounded-lg border flex items-center justify-center text-xs font-bold transition-all",
                                  isBooked 
                                    ? "bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed" 
                                    : selectedSystem === num
                                      ? "bg-indigo-600 border-indigo-600 text-white"
                                      : "bg-white border-gray-200 text-gray-600 hover:border-indigo-300"
                                )}
                              >
                                {num}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                )}

                {selectedStartTime && selectedSystem && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                    <Card className="p-6 bg-indigo-600 text-white border-none">
                      <h3 className="font-bold mb-2">Summary</h3>
                      <div className="space-y-2 text-sm opacity-90">
                        <p className="flex justify-between"><span>Date:</span> <span>{format(parse(selectedDate, 'yyyy-MM-dd', new Date()), 'PPP')}</span></p>
                        <p className="flex justify-between"><span>Time:</span> <span>{formatTime(selectedStartTime)} - {formatTime(format(addHours(parse(selectedStartTime, 'HH:mm', new Date()), selectedDuration), 'HH:mm'))}</span></p>
                        <p className="flex justify-between"><span>PC Number:</span> <span>#{selectedSystem}</span></p>
                        <p className="flex justify-between"><span>Duration:</span> <span>{selectedDuration} Hours</span></p>
                      </div>
                      <Button 
                        className="w-full mt-6 bg-white text-indigo-600 hover:bg-gray-100" 
                        onClick={handleBooking}
                        disabled={loading || !studentName || !phone}
                      >
                        {loading ? 'Confirming...' : 'Confirm Booking'}
                      </Button>
                    </Card>
                  </motion.div>
                )}

                {message && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-4 rounded-2xl flex items-start gap-3",
                      message.type === 'success' ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    )}
                  >
                    {message.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                    <p className="text-sm font-medium">{message.text}</p>
                  </motion.div>
                )}
              </div>

              {/* Slots Grid */}
              <div className="lg:col-span-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {generateTimeSlots().map((slot, i) => (
                    <button
                      key={i}
                      disabled={slot.available === 0}
                      onClick={() => setSelectedStartTime(slot.time)}
                      className={cn(
                        "p-5 rounded-2xl border-2 text-left transition-all group relative overflow-hidden",
                        slot.available === 0 
                          ? "bg-gray-50 border-gray-100 opacity-60 cursor-not-allowed" 
                          : selectedStartTime === slot.time
                            ? "bg-indigo-50 border-indigo-600"
                            : "bg-white border-gray-100 hover:border-indigo-200"
                      )}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          slot.available === 0 ? "bg-gray-200 text-gray-400" : "bg-indigo-100 text-indigo-600"
                        )}>
                          <Clock size={20} />
                        </div>
                        <span className={cn(
                          "text-xs font-bold px-2 py-1 rounded-lg",
                          slot.available === 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                        )}>
                          {slot.available} / {slot.total} Left
                        </span>
                      </div>
                      <h4 className="font-bold text-gray-900 text-lg">{formatTime(slot.time)}</h4>
                      <p className="text-sm text-gray-500">Starts at {formatTime(slot.time)}</p>
                      
                      {selectedStartTime === slot.time && (
                        <div className="absolute top-2 right-2 text-indigo-600">
                          <CheckCircle2 size={24} fill="currentColor" className="text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {bookings.length === 0 ? (
                <Card className="p-12 text-center">
                  <div className="w-20 h-20 bg-gray-50 text-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
                    <History size={40} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">No bookings yet</h3>
                  <p className="text-gray-500 mt-2">Your lab booking history will appear here.</p>
                  <Button variant="secondary" className="mt-6 mx-auto" onClick={() => setActiveTab('book')}>
                    Book Your First Slot
                  </Button>
                </Card>
              ) : (
                bookings.map((booking) => (
                  <Card key={booking.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center",
                        booking.status === 'confirmed' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                      )}>
                        <Monitor size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">System #{booking.system_number}</h4>
                        <p className="text-sm text-gray-500">
                          {format(parse(booking.date, 'yyyy-MM-dd', new Date()), 'PPP')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{formatTime(booking.start_time)} - {formatTime(booking.end_time)}</p>
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{booking.duration} Hours Session</p>
                      </div>
                      <div className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold uppercase",
                        booking.status === 'confirmed' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                      )}>
                        {booking.status}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

const AdminPanel = ({ onBack }: { onBack: () => void }) => {
  const { token } = useAuthStore();
  const [bookings, setBookings] = useState<any[]>([]);
  const [settings, setSettings] = useState({ total_systems: 10, lab_open_time: '09:00', lab_close_time: '18:00' });
  const [loading, setLoading] = useState(false);

  const fetchAll = async () => {
    const [bRes, sRes] = await Promise.all([
      fetch('/api/admin/bookings', { headers: { 'Authorization': `Bearer ${token}` } }),
      fetch('/api/admin/settings', { headers: { 'Authorization': `Bearer ${token}` } })
    ]);
    setBookings(await bRes.json());
    setSettings(await sRes.json());
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCancel = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    await fetch(`/api/admin/bookings/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    fetchAll();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(settings)
    });
    setLoading(false);
    alert('Settings updated successfully!');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-10">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex items-center justify-between">
          <div>
            <button onClick={onBack} className="text-indigo-600 font-semibold flex items-center gap-1 mb-2 hover:underline">
              <ChevronRight size={16} className="rotate-180" /> Back to Dashboard
            </button>
            <h2 className="text-3xl font-bold text-gray-900">Admin Control Panel</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-gray-900">Admin Mode</p>
              <p className="text-xs text-emerald-600 font-semibold">System Active</p>
            </div>
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center">
              <ShieldCheck size={24} />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Settings */}
          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-10">
              <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Settings size={20} className="text-indigo-600" />
                Lab Configuration
              </h3>
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <Input 
                  label="Total Computer Systems" 
                  type="number" 
                  value={settings.total_systems}
                  onChange={(e: any) => setSettings({ ...settings, total_systems: parseInt(e.target.value) })}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    label="Opening Time" 
                    type="time" 
                    value={settings.lab_open_time}
                    onChange={(e: any) => setSettings({ ...settings, lab_open_time: e.target.value })}
                  />
                  <Input 
                    label="Closing Time" 
                    type="time" 
                    value={settings.lab_close_time}
                    onChange={(e: any) => setSettings({ ...settings, lab_close_time: e.target.value })}
                  />
                </div>
                <Button className="w-full mt-4" type="submit" disabled={loading}>
                  {loading ? 'Saving...' : 'Update Settings'}
                </Button>
              </form>
            </Card>
          </div>

          {/* Bookings List */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-2">
              <LayoutDashboard size={20} className="text-indigo-600" />
              Recent Bookings
            </h3>
            {bookings.map((booking) => (
              <Card key={booking.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-500">
                    <User size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{booking.user_name}</h4>
                    <p className="text-sm text-gray-500">{booking.user_email}</p>
                    <p className="text-xs font-bold text-indigo-600 mt-1">System #{booking.system_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{format(parse(booking.date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}</p>
                    <p className="text-xs text-gray-500 font-semibold">{formatTime(booking.start_time)} - {formatTime(booking.end_time)}</p>
                  </div>
                  {booking.status === 'confirmed' ? (
                    <Button variant="danger" className="p-2" onClick={() => handleCancel(booking.id)}>
                      <Trash2 size={18} />
                    </Button>
                  ) : (
                    <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold uppercase">
                      Cancelled
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const token = useAuthStore(state => state.token);
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handleHashChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (!token) {
    if (hash === '#register') return <AuthPage type="register" />;
    return <AuthPage type="login" />;
  }

  return <Dashboard />;
}
