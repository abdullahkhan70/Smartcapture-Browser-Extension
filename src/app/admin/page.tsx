'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Users, Mail, Search, Trash2, Check, ArrowLeft, Eye, EyeOff, RefreshCw, LogOut, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

const queryClient = new QueryClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Append the admin password to a URL as a query param. */
function authUrl(path: string, password: string) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}password=${encodeURIComponent(password)}`;
}

/** Fetch wrapper that sends the password in the X-Admin-Password header. */
function authFetch(url: string, password: string, init?: RequestInit) {
  return fetch(authUrl(url, password), {
    ...init,
    headers: {
      ...init?.headers,
      'x-admin-password': password,
    },
  });
}

// ---------------------------------------------------------------------------
// Login Screen
// ---------------------------------------------------------------------------

function LoginForm({ onLogin }: { onLogin: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');

    // Verify by hitting the subscribers endpoint
    fetch(authUrl('/api/admin/subscribers', password))
      .then((res) => {
        if (res.ok) {
          onLogin(password);
        } else {
          setLoginError('Invalid password');
        }
      })
      .catch(() => setLoginError('Connection error'))
      .finally(() => setLoading(false));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B1120]">
      <div className="w-full max-w-sm mx-4">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-600 shadow-xl shadow-cyan-500/30">
            <Camera className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-sm text-slate-400">SmartCapture Pro</p>
        </div>
        <form onSubmit={handleLogin} className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">Password</label>
            <Input
              type="password"
              placeholder="Enter admin password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 border-white/[0.08] bg-white/[0.04] text-white placeholder:text-slate-500 focus-visible:border-cyan-500/40"
              autoFocus
            />
          </div>
          {loginError && <p className="text-sm text-red-400">{loginError}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 bg-gradient-to-r from-cyan-500 to-sky-500 text-white hover:from-cyan-400 hover:to-sky-400"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
          <div className="text-center">
            <Link href="/" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
              ← Back to Site
            </Link>
          </div>
        </form>
        <p className="mt-4 text-center text-xs text-slate-600">
          Default password: admin123
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subscribers Tab
// ---------------------------------------------------------------------------

function SubscribersTab({ password }: { password: string }) {
  const [search, setSearch] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['subscribers', search],
    queryFn: () =>
      authFetch(`/api/admin/subscribers${search ? `?search=${encodeURIComponent(search)}` : ''}`, password).then(
        (r) => r.json()
      ),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/api/admin/subscribers/${id}`, password, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      toast.success('Subscriber deleted');
      setConfirmDeleteId(null);
    },
    onError: () => {
      toast.error('Failed to delete subscriber');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subscribers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-muted-foreground focus:border-cyan-500"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          className="border-white/10 bg-white/5 hover:bg-white/10 text-white"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        {data?.count !== undefined && (
          <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            <Users className="h-3 w-3 mr-1" />
            {data.count} subscribers
          </Badge>
        )}
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02] backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-white/5">
              <TableHead className="text-muted-foreground">Email</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Subscribed Date</TableHead>
              <TableHead className="text-right text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  <TableCell><Skeleton className="h-4 w-48 bg-white/10" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 bg-white/10" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 bg-white/10" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-8 bg-white/10 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.subscribers?.length === 0 ? (
              <TableRow className="border-white/5">
                <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                  No subscribers found
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence>
                {data?.subscribers?.map((subscriber: { id: string; email: string; active: boolean; createdAt: string }) => (
                  <motion.tr
                    key={subscriber.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <TableCell className="font-medium text-white">{subscriber.email}</TableCell>
                    <TableCell>
                      {subscriber.active ? (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-slate-500/20 text-slate-400 border-slate-500/30">
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(subscriber.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      {confirmDeleteId === subscriber.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteMutation.mutate(subscriber.id)}
                            className="bg-red-600 hover:bg-red-700 text-white"
                          >
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-muted-foreground hover:text-white"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(subscriber.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages Tab
// ---------------------------------------------------------------------------

function MessagesTab({ password }: { password: string }) {
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['messages', showUnreadOnly],
    queryFn: () =>
      authFetch(`/api/admin/messages?unread=${showUnreadOnly}`, password).then((r) => r.json()),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/api/admin/messages/${id}`, password, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Message marked as read');
    },
    onError: () => {
      toast.error('Failed to update message');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authFetch(`/api/admin/messages/${id}`, password, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      toast.success('Message deleted');
      setConfirmDeleteId(null);
    },
    onError: () => {
      toast.error('Failed to delete message');
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant={showUnreadOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          className={
            showUnreadOnly
              ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
              : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
          }
        >
          {showUnreadOnly ? <Eye className="h-4 w-4 mr-2" /> : <EyeOff className="h-4 w-4 mr-2" />}
          {showUnreadOnly ? 'Unread Only' : 'All Messages'}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          className="border-white/10 bg-white/5 hover:bg-white/10 text-white"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
        {data?.unreadCount > 0 && (
          <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <Mail className="h-3 w-3 mr-1" />
            {data.unreadCount} unread
          </Badge>
        )}
        {data?.count !== undefined && (
          <Badge variant="secondary" className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            {data.count} total
          </Badge>
        )}
      </div>

      <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02] backdrop-blur-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-white/5">
              <TableHead className="text-muted-foreground">Name</TableHead>
              <TableHead className="text-muted-foreground">Email</TableHead>
              <TableHead className="text-muted-foreground">Subject</TableHead>
              <TableHead className="text-muted-foreground">Message</TableHead>
              <TableHead className="text-muted-foreground">Date</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-right text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="border-white/5">
                  <TableCell><Skeleton className="h-4 w-24 bg-white/10" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-36 bg-white/10" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28 bg-white/10" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48 bg-white/10" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24 bg-white/10" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 bg-white/10" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 bg-white/10 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : data?.messages?.length === 0 ? (
              <TableRow className="border-white/5">
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No messages found
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence>
                {data?.messages?.map(
                  (message: {
                    id: string;
                    name: string;
                    email: string;
                    subject: string | null;
                    message: string;
                    read: boolean;
                    createdAt: string;
                  }) => (
                    <motion.tr
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      className="border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <TableCell className="font-medium text-white">{message.name}</TableCell>
                      <TableCell className="text-muted-foreground">{message.email}</TableCell>
                      <TableCell className="text-white/80">{message.subject || '—'}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {message.message.length > 80
                          ? `${message.message.slice(0, 80)}...`
                          : message.message}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {format(new Date(message.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        {message.read ? (
                          <Badge
                            variant="secondary"
                            className="bg-slate-500/20 text-slate-400 border-slate-500/30"
                          >
                            Read
                          </Badge>
                        ) : (
                          <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/30">
                            Unread
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!message.read && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => markReadMutation.mutate(message.id)}
                              className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              title="Mark as read"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          {confirmDeleteId === message.id ? (
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteMutation.mutate(message.id)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-muted-foreground hover:text-white"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setConfirmDeleteId(message.id)}
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  )
                )}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard (authenticated view)
// ---------------------------------------------------------------------------

function AdminDashboard({ password, onLogout }: { password: string; onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-[#0B1120] text-white">
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                SmartCapture Pro
              </h1>
              <p className="text-muted-foreground mt-1">Admin Dashboard</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Site
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={onLogout}
                className="border-white/10 bg-white/5 text-muted-foreground hover:text-white hover:border-white/20"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Tabs defaultValue="subscribers" className="w-full">
            <TabsList className="bg-white/5 border border-white/10 mb-6">
              <TabsTrigger
                value="subscribers"
                className="data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-300 text-muted-foreground"
              >
                <Users className="h-4 w-4 mr-2" />
                Subscribers
              </TabsTrigger>
              <TabsTrigger
                value="messages"
                className="data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-300 text-muted-foreground"
              >
                <Mail className="h-4 w-4 mr-2" />
                Messages
              </TabsTrigger>
            </TabsList>
            <TabsContent value="subscribers">
              <SubscribersTab password={password} />
            </TabsContent>
            <TabsContent value="messages">
              <MessagesTab password={password} />
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root page — manages auth state
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [password, setPassword] = useState<string | null>(null);

  // Rehydrate session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('scAdminAuth');
    if (saved) {
      // Verify the saved password still works
      fetch(authUrl('/api/admin/subscribers', saved))
        .then((res) => {
          if (res.ok) setPassword(saved);
          else sessionStorage.removeItem('scAdminAuth');
        })
        .catch(() => sessionStorage.removeItem('scAdminAuth'));
    }
  }, []);

  const handleLogin = (pwd: string) => {
    setPassword(pwd);
    sessionStorage.setItem('scAdminAuth', pwd);
  };

  const handleLogout = () => {
    setPassword(null);
    sessionStorage.removeItem('scAdminAuth');
  };

  return (
    <QueryClientProvider client={queryClient}>
      {password ? (
        <AdminDashboard password={password} onLogout={handleLogout} />
      ) : (
        <LoginForm onLogin={handleLogin} />
      )}
    </QueryClientProvider>
  );
}
